/**
 * One-off migration: walks every cube via the sharded `GSI3`
 * (`GSI3PK = CUBE#{0..9}`, all 10 shards in parallel) and:
 *
 *   1. Writes a LIKE hash row for each entry in the cube's legacy
 *      `item.following` array (the list of users following the cube).
 *   2. Sets `item.likeCount = following.length` on the cube row.
 *
 * Per-user `User.likedCubesCount` is handled by `migrateUserFollows.ts`,
 * which walks each user's own `followedCubes` legacy array.
 *
 * Resumable: per-shard `lastKey` is written to checkpoint after every Dynamo
 * page. Delete `.migration-checkpoints/migrateCubeLikes.json` to start fresh.
 *
 * Idempotent enough for retries: PutItem on the LIKE row with the same SK
 * overwrites, and SETting `likeCount` to the legacy array length each pass
 * is deterministic.
 *
 * --recount mode: after the initial migration, the legacy-array length is no
 * longer the source of truth — actual LIKE hash rows on the cube's HASH
 * partition are. Pass `--recount` to walk every cube again and overwrite
 * `item.likeCount` with the actual number of LIKE# rows on that cube's
 * partition (always SET, including 0). Uses a separate checkpoint key
 * (`migrateCubeLikes_recount`) so it does not collide with the original
 * migration's checkpoint. Combine with `--dry-run` to recount a single cube.
 */
import { GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { cubeDao } from '@server/dynamo/daos';
import documentClient from '@server/dynamo/documentClient';

import 'dotenv/config';

import { CheckpointManager } from './checkpointUtil';

const DRY_RUN = process.argv.includes('--dry-run');
const RECOUNT = process.argv.includes('--recount');
const DRY_RUN_CUBE_ID = '5d39e7f38472c42aab0b73d6';

interface Stats {
  cubesScanned: number;
  cubesWithLikes: number;
  likeRowsWritten: number;
  errors: number;
}

interface CubeLikesCheckpoint {
  shardLastKeys: Array<Record<string, any> | null | 'done'>;
  stats: Stats;
  timestamp: number;
}

interface RecountStats {
  cubesScanned: number;
  cubesWithLikes: number;
  countsUpdated: number;
  countsChanged: number;
  errors: number;
}

interface CubeLikesRecountCheckpoint {
  shardLastKeys: Array<Record<string, any> | null | 'done'>;
  stats: RecountStats;
  timestamp: number;
}

const tableName = process.env.DYNAMO_TABLE!;
const SHARDS = 10;
const PAGE_LOG_INTERVAL = 1;
const ITEM_LOG_INTERVAL = 50;

const setCubeLikeCount = async (cubeId: string, count: number): Promise<void> => {
  await documentClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { PK: `CUBE#${cubeId}`, SK: 'CUBE' },
      UpdateExpression: 'SET #item.#likeCount = :v',
      ExpressionAttributeNames: { '#item': 'item', '#likeCount': 'likeCount' },
      ExpressionAttributeValues: { ':v': count },
    }),
  );
};

/**
 * Migrates one cube row's legacy `following` array into LIKE hash rows + stamps
 * `likeCount`. Shared between the sharded iteration and `--dry-run`.
 */
const processCubeRow = async (cubeBody: any, stats: Stats, now: number, logPrefix: string): Promise<void> => {
  const cubeId: string | undefined = cubeBody?.id;
  if (!cubeId) return;

  const following: string[] = Array.isArray(cubeBody.following) ? cubeBody.following : [];

  if (following.length > 0) {
    stats.cubesWithLikes += 1;
    for (const userId of following) {
      try {
        await cubeDao.writeLike(cubeId, userId, now);
        stats.likeRowsWritten += 1;
      } catch (err: any) {
        stats.errors += 1;
        console.error(`${logPrefix} writeLike(${cubeId}, ${userId}): ${err.message}`);
      }
    }
  }

  try {
    await setCubeLikeCount(cubeId, following.length);
  } catch (err: any) {
    stats.errors += 1;
    console.error(`${logPrefix} setCubeLikeCount(${cubeId}): ${err.message}`);
  }
};

/**
 * Recount mode: counts the actual LIKE# hash rows on the cube's HASH partition
 * and writes that to `item.likeCount`, regardless of whether it changed (and
 * including 0).
 */
const recountCubeRow = async (cubeBody: any, stats: RecountStats, logPrefix: string): Promise<void> => {
  const cubeId: string | undefined = cubeBody?.id;
  if (!cubeId) return;

  const previous: number | undefined = typeof cubeBody.likeCount === 'number' ? cubeBody.likeCount : undefined;

  let count: number;
  try {
    count = await cubeDao.countLikersOfCube(cubeId);
  } catch (err: any) {
    stats.errors += 1;
    console.error(`${logPrefix} countLikersOfCube(${cubeId}): ${err.message}`);
    return;
  }

  if (count > 0) stats.cubesWithLikes += 1;

  try {
    await setCubeLikeCount(cubeId, count);
    stats.countsUpdated += 1;
    if (previous !== count) stats.countsChanged += 1;
  } catch (err: any) {
    stats.errors += 1;
    console.error(`${logPrefix} setCubeLikeCount(${cubeId}, ${count}): ${err.message}`);
  }
};

const processShardRecount = async (
  shard: number,
  startKey: Record<string, any> | undefined,
  stats: RecountStats,
  onCheckpoint: (shard: number, lastKey: Record<string, any> | null | 'done') => void,
): Promise<void> => {
  let lastKey: Record<string, any> | undefined = startKey;
  let pageNum = 0;
  console.log(`[shard ${shard}] starting recount${startKey ? ' (resuming from checkpoint)' : ''}…`);

  do {
    pageNum += 1;
    const pageStart = Date.now();
    const result = await documentClient.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: 'GSI3',
        KeyConditionExpression: 'GSI3PK = :pk',
        ExpressionAttributeValues: { ':pk': `CUBE#${shard}` },
        ExclusiveStartKey: lastKey,
      }),
    );

    const items = result.Items || [];
    const pageDuration = ((Date.now() - pageStart) / 1000).toFixed(2);

    if (pageNum % PAGE_LOG_INTERVAL === 0) {
      console.log(
        `[shard ${shard}] page ${pageNum}: ${items.length} cubes (${pageDuration}s). ` +
          `Cumulative — scanned: ${stats.cubesScanned}, with-likes: ${stats.cubesWithLikes}, ` +
          `updated: ${stats.countsUpdated}, changed: ${stats.countsChanged}, errors: ${stats.errors}`,
      );
    }

    for (const row of items) {
      stats.cubesScanned += 1;
      const cubeBody = row?.item || {};
      await recountCubeRow(cubeBody, stats, `[shard ${shard}]`);

      if (stats.cubesScanned % ITEM_LOG_INTERVAL === 0) {
        console.log(
          `  […${stats.cubesScanned} cubes across all shards] with-likes: ${stats.cubesWithLikes}, ` +
            `updated: ${stats.countsUpdated}, changed: ${stats.countsChanged}, errors: ${stats.errors}`,
        );
      }
    }

    lastKey = result.LastEvaluatedKey;
    onCheckpoint(shard, lastKey ?? 'done');
  } while (lastKey);

  console.log(`[shard ${shard}] recount complete.`);
};

const processShard = async (
  shard: number,
  startKey: Record<string, any> | undefined,
  stats: Stats,
  now: number,
  onCheckpoint: (shard: number, lastKey: Record<string, any> | null | 'done') => void,
): Promise<void> => {
  let lastKey: Record<string, any> | undefined = startKey;
  let pageNum = 0;
  console.log(`[shard ${shard}] starting${startKey ? ' (resuming from checkpoint)' : ''}…`);

  do {
    pageNum += 1;
    const pageStart = Date.now();
    const result = await documentClient.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: 'GSI3',
        KeyConditionExpression: 'GSI3PK = :pk',
        ExpressionAttributeValues: { ':pk': `CUBE#${shard}` },
        ExclusiveStartKey: lastKey,
      }),
    );

    const items = result.Items || [];
    const pageDuration = ((Date.now() - pageStart) / 1000).toFixed(2);

    if (pageNum % PAGE_LOG_INTERVAL === 0) {
      console.log(
        `[shard ${shard}] page ${pageNum}: ${items.length} cubes (${pageDuration}s). ` +
          `Cumulative — scanned: ${stats.cubesScanned}, with-likes: ${stats.cubesWithLikes}, ` +
          `rows: ${stats.likeRowsWritten}, errors: ${stats.errors}`,
      );
    }

    for (const row of items) {
      stats.cubesScanned += 1;
      const cubeBody = row?.item || {};
      await processCubeRow(cubeBody, stats, now, `[shard ${shard}]`);

      if (stats.cubesScanned % ITEM_LOG_INTERVAL === 0) {
        console.log(
          `  […${stats.cubesScanned} cubes across all shards] with-likes: ${stats.cubesWithLikes}, ` +
            `rows: ${stats.likeRowsWritten}, errors: ${stats.errors}`,
        );
      }
    }

    lastKey = result.LastEvaluatedKey;
    onCheckpoint(shard, lastKey ?? 'done');
  } while (lastKey);

  console.log(`[shard ${shard}] complete.`);
};

const runDryRun = async (): Promise<void> => {
  console.log(`--- DRY RUN: migrating only cube ${DRY_RUN_CUBE_ID} ---`);
  const stats: Stats = { cubesScanned: 0, cubesWithLikes: 0, likeRowsWritten: 0, errors: 0 };

  const result = await documentClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { PK: `CUBE#${DRY_RUN_CUBE_ID}`, SK: 'CUBE' },
    }),
  );

  if (!result.Item) {
    console.error(`Cube ${DRY_RUN_CUBE_ID} not found`);
    process.exit(1);
  }

  const cubeBody = (result.Item as any).item || {};
  const beforeFollowing = Array.isArray(cubeBody.following) ? cubeBody.following : [];
  console.log(
    `Before — likeCount: ${cubeBody.likeCount}, following.length: ${beforeFollowing.length}`,
  );

  stats.cubesScanned = 1;
  await processCubeRow(cubeBody, stats, Date.now(), '[dry-run]');

  // Re-read to confirm what we wrote.
  const after = await documentClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { PK: `CUBE#${DRY_RUN_CUBE_ID}`, SK: 'CUBE' },
    }),
  );
  const afterBody = (after.Item as any)?.item || {};
  console.log(
    `After  — likeCount: ${afterBody.likeCount}, following.length: ${
      Array.isArray(afterBody.following) ? afterBody.following.length : 'absent'
    }`,
  );

  console.log('\n=== Dry-Run Stats ===');
  console.log(stats);
  process.exit(stats.errors > 0 ? 1 : 0);
};

const runRecountDryRun = async (): Promise<void> => {
  console.log(`--- DRY RUN (recount): cube ${DRY_RUN_CUBE_ID} ---`);
  const stats: RecountStats = {
    cubesScanned: 0,
    cubesWithLikes: 0,
    countsUpdated: 0,
    countsChanged: 0,
    errors: 0,
  };

  const result = await documentClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { PK: `CUBE#${DRY_RUN_CUBE_ID}`, SK: 'CUBE' },
    }),
  );

  if (!result.Item) {
    console.error(`Cube ${DRY_RUN_CUBE_ID} not found`);
    process.exit(1);
  }

  const cubeBody = (result.Item as any).item || {};
  console.log(`Before — likeCount: ${cubeBody.likeCount}`);

  stats.cubesScanned = 1;
  await recountCubeRow(cubeBody, stats, '[dry-run]');

  const after = await documentClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { PK: `CUBE#${DRY_RUN_CUBE_ID}`, SK: 'CUBE' },
    }),
  );
  const afterBody = (after.Item as any)?.item || {};
  console.log(`After  — likeCount: ${afterBody.likeCount}`);

  console.log('\n=== Recount Dry-Run Stats ===');
  console.log(stats);
  process.exit(stats.errors > 0 ? 1 : 0);
};

const runRecount = async (): Promise<void> => {
  const checkpoints = new CheckpointManager('migrateCubeLikes_recount');
  const saved = checkpoints.load() as CubeLikesRecountCheckpoint | null;

  const stats: RecountStats = saved?.stats ?? {
    cubesScanned: 0,
    cubesWithLikes: 0,
    countsUpdated: 0,
    countsChanged: 0,
    errors: 0,
  };
  const shardLastKeys: Array<Record<string, any> | null | 'done'> =
    saved?.shardLastKeys ?? Array.from({ length: SHARDS }, () => null);

  if (saved) {
    const remaining = shardLastKeys.filter((k) => k !== 'done').length;
    console.log(
      `Resuming recount: ${remaining}/${SHARDS} shards still pending, ` +
        `cubesScanned=${stats.cubesScanned}, updated=${stats.countsUpdated}.`,
    );
  } else {
    console.log(`Starting fresh recount. ${SHARDS} shards in parallel via GSI3.`);
  }

  const persistCheckpoint = (shard: number, lastKey: Record<string, any> | null | 'done') => {
    shardLastKeys[shard] = lastKey;
    checkpoints.save({
      shardLastKeys,
      stats,
      timestamp: Date.now(),
    } as any);
  };

  await Promise.all(
    Array.from({ length: SHARDS }, (_, shard) => {
      const start = shardLastKeys[shard];
      if (start === 'done') {
        console.log(`[shard ${shard}] already complete from checkpoint, skipping.`);
        return Promise.resolve();
      }
      return processShardRecount(shard, start ?? undefined, stats, persistCheckpoint);
    }),
  );

  console.log('\n=== Cube Like Recount Complete ===');
  console.log(`Cubes scanned: ${stats.cubesScanned}`);
  console.log(`Cubes with likes: ${stats.cubesWithLikes}`);
  console.log(`likeCount writes: ${stats.countsUpdated}`);
  console.log(`likeCount values changed: ${stats.countsChanged}`);
  console.log(`Errors: ${stats.errors}`);

  if (stats.errors === 0) {
    console.log('\nClearing recount checkpoint (clean finish).');
    checkpoints.clear();
  } else {
    console.warn(`\nLeaving recount checkpoint in place due to ${stats.errors} error(s). Rerun to retry failed items.`);
  }

  process.exit(stats.errors > 0 ? 1 : 0);
};

const main = async () => {
  if (!tableName) {
    console.error('DYNAMO_TABLE env var is required');
    process.exit(1);
  }

  if (RECOUNT) {
    if (DRY_RUN) {
      await runRecountDryRun();
    } else {
      await runRecount();
    }
    return;
  }

  if (DRY_RUN) {
    await runDryRun();
    return;
  }

  const checkpoints = new CheckpointManager('migrateCubeLikes');
  const saved = checkpoints.load() as CubeLikesCheckpoint | null;

  const stats: Stats = saved?.stats ?? {
    cubesScanned: 0,
    cubesWithLikes: 0,
    likeRowsWritten: 0,
    errors: 0,
  };
  const shardLastKeys: Array<Record<string, any> | null | 'done'> =
    saved?.shardLastKeys ?? Array.from({ length: SHARDS }, () => null);

  if (saved) {
    const remaining = shardLastKeys.filter((k) => k !== 'done').length;
    console.log(
      `Resuming: ${remaining}/${SHARDS} shards still pending, ` +
        `cubesScanned=${stats.cubesScanned}, rows=${stats.likeRowsWritten}.`,
    );
  } else {
    console.log(`Starting fresh migration. ${SHARDS} shards in parallel via GSI3.`);
  }

  const now = Date.now();

  const persistCheckpoint = (shard: number, lastKey: Record<string, any> | null | 'done') => {
    shardLastKeys[shard] = lastKey;
    checkpoints.save({
      shardLastKeys,
      stats,
      timestamp: Date.now(),
    } as any);
  };

  await Promise.all(
    Array.from({ length: SHARDS }, (_, shard) => {
      const start = shardLastKeys[shard];
      if (start === 'done') {
        console.log(`[shard ${shard}] already complete from checkpoint, skipping.`);
        return Promise.resolve();
      }
      return processShard(shard, start ?? undefined, stats, now, persistCheckpoint);
    }),
  );

  console.log('\n=== Cube Like Migration Complete ===');
  console.log(`Cubes scanned: ${stats.cubesScanned}`);
  console.log(`Cubes with likes: ${stats.cubesWithLikes}`);
  console.log(`Like rows written: ${stats.likeRowsWritten}`);
  console.log(`Errors: ${stats.errors}`);

  if (stats.errors === 0) {
    console.log('\nClearing checkpoint (clean finish).');
    checkpoints.clear();
  } else {
    console.warn(`\nLeaving checkpoint in place due to ${stats.errors} error(s). Rerun to retry failed items.`);
  }

  process.exit(stats.errors > 0 ? 1 : 0);
};

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
