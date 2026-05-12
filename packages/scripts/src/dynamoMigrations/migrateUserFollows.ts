/**
 * One-off migration: walks every user via a filtered base-table scan and
 * expands their three legacy follow arrays into hash rows + stamps the
 * matching denormalized counters:
 *
 *   item.following     (followers of this user)        →  FOLLOWER hash rows
 *                                                          on this user's
 *                                                          partition, plus
 *                                                          item.followerCount =
 *                                                          following.length
 *
 *   item.followedUsers (users this user follows)       →  FOLLOWER hash rows
 *                                                          on each followed
 *                                                          user's partition,
 *                                                          plus
 *                                                          item.followingCount =
 *                                                          followedUsers.length
 *
 *   item.followedCubes (cubes this user likes)         →  LIKE hash rows on
 *                                                          each cube's
 *                                                          partition, plus
 *                                                          item.likedCubesCount =
 *                                                          followedCubes.length
 *
 * Enumeration: users don't have a sharded enumeration index, so this scans
 * the base table with a tight filter (`SK = USER AND begins_with(PK, USER#)`).
 * Parallel scan segments via `MIGRATE_USER_FOLLOWS_SEGMENTS`.
 *
 * Resumable: per-segment lastKey is written to checkpoint after every Dynamo
 * page. Delete `.migration-checkpoints/migrateUserFollows.json` to start fresh.
 *
 * Idempotent enough for retries: PutItem on hash rows with the same SK
 * overwrites; SETting each counter to the legacy array length each pass is
 * deterministic.
 */
import { GetCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { cubeDao, userDao } from '@server/dynamo/daos';
import documentClient from '@server/dynamo/documentClient';

import 'dotenv/config';

import { CheckpointManager } from './checkpointUtil';

const DRY_RUN = process.argv.includes('--dry-run');
const DRY_RUN_USER_ID = '5d1125b00e0713602c55d967';

interface Stats {
  usersScanned: number;
  usersWithFollowers: number;
  usersWithFollowing: number;
  usersWithLikedCubes: number;
  followerRowsWritten: number;
  likeRowsWritten: number;
  errors: number;
}

interface UserFollowsCheckpoint {
  totalSegments: number;
  segmentLastKeys: Array<Record<string, any> | null | 'done'>;
  stats: Stats;
  timestamp: number;
}

const tableName = process.env.DYNAMO_TABLE!;
const SEGMENTS = Math.max(
  1,
  Math.min(parseInt(process.env.MIGRATE_USER_FOLLOWS_SEGMENTS || '1', 10), 32),
);
const PAGE_LOG_INTERVAL = 1;
const ITEM_LOG_INTERVAL = 50;

const setUserCounter = async (
  userId: string,
  counterField: 'followerCount' | 'followingCount' | 'likedCubesCount',
  count: number,
): Promise<void> => {
  await documentClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { PK: `USER#${userId}`, SK: 'USER' },
      UpdateExpression: 'SET #item.#field = :v',
      ExpressionAttributeNames: { '#item': 'item', '#field': counterField },
      ExpressionAttributeValues: { ':v': count },
    }),
  );
};

/**
 * Migrates one user row's three legacy arrays into hash rows + stamps the
 * matching counters. Shared between the segmented scan and `--dry-run`.
 */
const processUserRow = async (userBody: any, stats: Stats, now: number, logPrefix: string): Promise<void> => {
  const userId: string | undefined = userBody?.id;
  if (!userId) return;

  const following: string[] = Array.isArray(userBody.following) ? userBody.following : [];
  const followedUsers: string[] = Array.isArray(userBody.followedUsers) ? userBody.followedUsers : [];
  const followedCubes: string[] = Array.isArray(userBody.followedCubes) ? userBody.followedCubes : [];

  // following: people who follow this user → FOLLOWER rows on this user's partition.
  if (following.length > 0) {
    stats.usersWithFollowers += 1;
    for (const followerId of following) {
      try {
        await userDao.writeFollow(followerId, userId, now);
        stats.followerRowsWritten += 1;
      } catch (err: any) {
        stats.errors += 1;
        console.error(`${logPrefix} writeFollow(${followerId} → ${userId}): ${err.message}`);
      }
    }
  }
  try {
    await setUserCounter(userId, 'followerCount', following.length);
  } catch (err: any) {
    stats.errors += 1;
    console.error(`${logPrefix} setUserCounter(${userId}, followerCount): ${err.message}`);
  }

  // followedUsers: people this user follows → FOLLOWER rows on each followed user's partition.
  if (followedUsers.length > 0) {
    stats.usersWithFollowing += 1;
    for (const followedId of followedUsers) {
      try {
        await userDao.writeFollow(userId, followedId, now);
        stats.followerRowsWritten += 1;
      } catch (err: any) {
        stats.errors += 1;
        console.error(`${logPrefix} writeFollow(${userId} → ${followedId}): ${err.message}`);
      }
    }
  }
  try {
    await setUserCounter(userId, 'followingCount', followedUsers.length);
  } catch (err: any) {
    stats.errors += 1;
    console.error(`${logPrefix} setUserCounter(${userId}, followingCount): ${err.message}`);
  }

  // followedCubes: cubes this user likes → LIKE rows on each cube's partition.
  if (followedCubes.length > 0) {
    stats.usersWithLikedCubes += 1;
    for (const cubeId of followedCubes) {
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
    await setUserCounter(userId, 'likedCubesCount', followedCubes.length);
  } catch (err: any) {
    stats.errors += 1;
    console.error(`${logPrefix} setUserCounter(${userId}, likedCubesCount): ${err.message}`);
  }
};

const processSegment = async (
  segmentIndex: number,
  totalSegments: number,
  startKey: Record<string, any> | undefined,
  stats: Stats,
  onCheckpoint: (segment: number, lastKey: Record<string, any> | null | 'done') => void,
): Promise<void> => {
  const now = Date.now();
  let lastKey: Record<string, any> | undefined = startKey;
  let pageNum = 0;

  console.log(`[seg ${segmentIndex}/${totalSegments - 1}] starting${startKey ? ' (resuming from checkpoint)' : ''}…`);

  do {
    pageNum += 1;
    const pageStart = Date.now();
    const result = await documentClient.send(
      new ScanCommand({
        TableName: tableName,
        Segment: totalSegments > 1 ? segmentIndex : undefined,
        TotalSegments: totalSegments > 1 ? totalSegments : undefined,
        FilterExpression: '#sk = :sk AND begins_with(#pk, :pkPrefix)',
        ExpressionAttributeNames: {
          '#sk': 'SK',
          '#pk': 'PK',
        },
        ExpressionAttributeValues: {
          ':sk': 'USER',
          ':pkPrefix': 'USER#',
        },
        ExclusiveStartKey: lastKey,
      }),
    );

    const items = result.Items || [];
    const pageDuration = ((Date.now() - pageStart) / 1000).toFixed(2);

    if (pageNum % PAGE_LOG_INTERVAL === 0) {
      console.log(
        `[seg ${segmentIndex}] page ${pageNum}: ${items.length} users (${pageDuration}s). ` +
          `Cumulative — scanned: ${stats.usersScanned}, followers: ${stats.usersWithFollowers}, ` +
          `following: ${stats.usersWithFollowing}, likedCubes: ${stats.usersWithLikedCubes}, ` +
          `rows(follow): ${stats.followerRowsWritten}, rows(like): ${stats.likeRowsWritten}, errors: ${stats.errors}`,
      );
    }

    for (const row of items) {
      stats.usersScanned += 1;
      const userBody = row?.item || {};
      await processUserRow(userBody, stats, now, `[seg ${segmentIndex}]`);

      if (stats.usersScanned % ITEM_LOG_INTERVAL === 0) {
        console.log(
          `  [seg ${segmentIndex}] …${stats.usersScanned} scanned, ` +
            `${stats.usersWithFollowers} w/ followers, ${stats.usersWithFollowing} w/ following, ` +
            `${stats.usersWithLikedCubes} w/ likedCubes, errors: ${stats.errors}`,
        );
      }
    }

    lastKey = result.LastEvaluatedKey;
    onCheckpoint(segmentIndex, lastKey ?? 'done');
  } while (lastKey);

  console.log(`[seg ${segmentIndex}/${totalSegments - 1}] complete.`);
};

const runDryRun = async (): Promise<void> => {
  console.log(`--- DRY RUN: migrating only user ${DRY_RUN_USER_ID} ---`);
  const stats: Stats = {
    usersScanned: 0,
    usersWithFollowers: 0,
    usersWithFollowing: 0,
    usersWithLikedCubes: 0,
    followerRowsWritten: 0,
    likeRowsWritten: 0,
    errors: 0,
  };

  const result = await documentClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { PK: `USER#${DRY_RUN_USER_ID}`, SK: 'USER' },
    }),
  );

  if (!result.Item) {
    console.error(`User ${DRY_RUN_USER_ID} not found`);
    process.exit(1);
  }

  const userBody = (result.Item as any).item || {};
  const beforeFollowing = Array.isArray(userBody.following) ? userBody.following.length : 'absent';
  const beforeFollowedUsers = Array.isArray(userBody.followedUsers) ? userBody.followedUsers.length : 'absent';
  const beforeFollowedCubes = Array.isArray(userBody.followedCubes) ? userBody.followedCubes.length : 'absent';
  console.log(
    `Before — followerCount: ${userBody.followerCount}, followingCount: ${userBody.followingCount}, ` +
      `likedCubesCount: ${userBody.likedCubesCount}`,
  );
  console.log(
    `         following: ${beforeFollowing}, followedUsers: ${beforeFollowedUsers}, ` +
      `followedCubes: ${beforeFollowedCubes}`,
  );

  stats.usersScanned = 1;
  await processUserRow(userBody, stats, Date.now(), '[dry-run]');

  const after = await documentClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { PK: `USER#${DRY_RUN_USER_ID}`, SK: 'USER' },
    }),
  );
  const afterBody = (after.Item as any)?.item || {};
  console.log(
    `After  — followerCount: ${afterBody.followerCount}, followingCount: ${afterBody.followingCount}, ` +
      `likedCubesCount: ${afterBody.likedCubesCount}`,
  );

  console.log('\n=== Dry-Run Stats ===');
  console.log(stats);
  process.exit(stats.errors > 0 ? 1 : 0);
};

const main = async () => {
  if (!tableName) {
    console.error('DYNAMO_TABLE env var is required');
    process.exit(1);
  }

  if (DRY_RUN) {
    await runDryRun();
    return;
  }

  const checkpoints = new CheckpointManager('migrateUserFollows');
  const saved = checkpoints.load() as UserFollowsCheckpoint | null;

  let totalSegments = SEGMENTS;
  let segmentLastKeys: Array<Record<string, any> | null | 'done'>;
  const stats: Stats = saved?.stats ?? {
    usersScanned: 0,
    usersWithFollowers: 0,
    usersWithFollowing: 0,
    usersWithLikedCubes: 0,
    followerRowsWritten: 0,
    likeRowsWritten: 0,
    errors: 0,
  };

  if (saved) {
    if (saved.totalSegments !== SEGMENTS) {
      console.warn(
        `Checkpoint was written with ${saved.totalSegments} segments; current MIGRATE_USER_FOLLOWS_SEGMENTS=${SEGMENTS}. ` +
          `Reusing the checkpointed segmentation (${saved.totalSegments}). Delete the checkpoint to change segment count.`,
      );
    }
    totalSegments = saved.totalSegments;
    segmentLastKeys = saved.segmentLastKeys;
    const remaining = segmentLastKeys.filter((k) => k !== 'done').length;
    console.log(
      `Resuming: ${totalSegments} segment(s), ${remaining} not yet finished. ` +
        `usersScanned=${stats.usersScanned}.`,
    );
  } else {
    segmentLastKeys = Array.from({ length: totalSegments }, () => null);
    console.log(`Starting fresh migration with ${totalSegments} parallel segment(s).`);
  }

  const persistCheckpoint = (segment: number, lastKey: Record<string, any> | null | 'done') => {
    segmentLastKeys[segment] = lastKey;
    checkpoints.save({
      totalSegments,
      segmentLastKeys,
      stats,
      timestamp: Date.now(),
    } as any);
  };

  await Promise.all(
    Array.from({ length: totalSegments }, (_, i) => {
      const start = segmentLastKeys[i];
      if (start === 'done') {
        console.log(`[seg ${i}/${totalSegments - 1}] already complete from checkpoint, skipping.`);
        return Promise.resolve();
      }
      return processSegment(i, totalSegments, start ?? undefined, stats, persistCheckpoint);
    }),
  );

  console.log('\n=== User Follow Migration Complete ===');
  console.log(`Users scanned: ${stats.usersScanned}`);
  console.log(`Users with followers: ${stats.usersWithFollowers}`);
  console.log(`Users with following: ${stats.usersWithFollowing}`);
  console.log(`Users with liked cubes: ${stats.usersWithLikedCubes}`);
  console.log(`FOLLOWER rows written: ${stats.followerRowsWritten}`);
  console.log(`LIKE rows written: ${stats.likeRowsWritten}`);
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
