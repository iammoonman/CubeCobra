/**
 * One-off migration: expands every user's deprecated `followedCubes: string[]`
 * field into per-relationship hash rows on the cube's hash partition, and
 * recomputes the denormalized counters (user.likedCubesCount, cube.likeCount).
 *
 * Run AFTER deploying the cube-like refactor code. After this is run, the legacy
 * `followedCubes` / `cube.following` arrays are no longer read from anywhere and
 * can be dropped in a follow-up cleanup.
 *
 * Idempotent: rewriting a hash row with the same SK is a no-op; recomputing
 * counters from the source-of-truth (followedCubes / fresh COUNT) is deterministic.
 */
import { cubeDao, userDao } from '@server/dynamo/daos';
import documentClient from '@server/dynamo/documentClient';

import 'dotenv/config';
import { ScanCommand, UpdateCommand } from '../../../server/node_modules/@aws-sdk/lib-dynamodb';

interface Stats {
  usersScanned: number;
  usersWithLikes: number;
  likeRowsWritten: number;
  cubesCountSet: number;
  errors: number;
}

const tableName = process.env.DYNAMO_TABLE!;

const scanAllUsers = async function* (): AsyncGenerator<any> {
  let lastKey: Record<string, any> | undefined;
  do {
    const result = await documentClient.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: '#sk = :sk',
        ExpressionAttributeNames: { '#sk': 'SK' },
        ExpressionAttributeValues: { ':sk': 'USER' },
        ExclusiveStartKey: lastKey,
      }),
    );
    for (const item of result.Items || []) {
      yield item;
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
};

const setUserLikedCubesCount = async (userId: string, count: number): Promise<void> => {
  await documentClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { PK: `USER#${userId}`, SK: 'USER' },
      UpdateExpression: 'SET #item.#field = :v',
      ExpressionAttributeNames: { '#item': 'item', '#field': 'likedCubesCount' },
      ExpressionAttributeValues: { ':v': count },
    }),
  );
};

const setCubeLikeCount = async (cubeId: string, count: number): Promise<void> => {
  await documentClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { PK: `CUBE#${cubeId}`, SK: 'CUBE' },
      UpdateExpression: 'SET #item.#field = :v',
      ExpressionAttributeNames: { '#item': 'item', '#field': 'likeCount' },
      ExpressionAttributeValues: { ':v': count },
    }),
  );
};

const main = async () => {
  if (!tableName) {
    console.error('DYNAMO_TABLE env var is required');
    process.exit(1);
  }

  const stats: Stats = {
    usersScanned: 0,
    usersWithLikes: 0,
    likeRowsWritten: 0,
    cubesCountSet: 0,
    errors: 0,
  };

  // Phase 1: expand each user's followedCubes into hash rows on the cube side,
  // and stamp the user's likedCubesCount counter.
  const touchedCubeIds = new Set<string>();

  for await (const item of scanAllUsers()) {
    stats.usersScanned += 1;
    const userBody = item.item || {};
    const userId = userBody.id;
    const followedCubes: string[] = userBody.followedCubes || [];

    if (!userId) continue;

    if (followedCubes.length === 0) {
      try {
        await setUserLikedCubesCount(userId, 0);
      } catch (err: any) {
        stats.errors += 1;
        console.error(`Failed to zero likedCubesCount for user ${userId}: ${err.message}`);
      }
      continue;
    }

    stats.usersWithLikes += 1;

    // Use the cube's dateCreated as a stable timestamp when available, falling
    // back to now (the actual like time isn't stored anywhere — best effort).
    const now = Date.now();
    for (const cubeId of followedCubes) {
      try {
        await cubeDao.writeLike(cubeId, userId, now);
        stats.likeRowsWritten += 1;
        touchedCubeIds.add(cubeId);
      } catch (err: any) {
        stats.errors += 1;
        console.error(`Failed to write LIKE(${cubeId}, ${userId}): ${err.message}`);
      }
    }

    try {
      await setUserLikedCubesCount(userId, followedCubes.length);
    } catch (err: any) {
      stats.errors += 1;
      console.error(`Failed to set likedCubesCount for ${userId}: ${err.message}`);
    }

    if (stats.usersScanned % 100 === 0) {
      console.log(
        `Users scanned: ${stats.usersScanned} (${stats.usersWithLikes} with likes), rows: ${stats.likeRowsWritten}`,
      );
    }
  }

  // Phase 2: stamp cube.likeCount on every touched cube by counting its like rows.
  console.log(`\nPhase 2: setting likeCount on ${touchedCubeIds.size} cubes…`);
  for (const cubeId of touchedCubeIds) {
    try {
      const count = await cubeDao.countLikersOfCube(cubeId);
      await setCubeLikeCount(cubeId, count);
      stats.cubesCountSet += 1;
      if (stats.cubesCountSet % 100 === 0) {
        console.log(`  …${stats.cubesCountSet}/${touchedCubeIds.size} cubes stamped`);
      }
    } catch (err: any) {
      stats.errors += 1;
      console.error(`Failed to set likeCount for cube ${cubeId}: ${err.message}`);
    }
  }

  console.log('\n=== Cube Like Migration Complete ===');
  console.log(`Users scanned: ${stats.usersScanned}`);
  console.log(`Users with likes: ${stats.usersWithLikes}`);
  console.log(`Like rows written: ${stats.likeRowsWritten}`);
  console.log(`Cube likeCounts set: ${stats.cubesCountSet}`);
  console.log(`Errors: ${stats.errors}`);

  process.exit(stats.errors > 0 ? 1 : 0);
};

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
