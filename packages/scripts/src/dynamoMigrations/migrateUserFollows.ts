/**
 * One-off migration: expands every user's deprecated `following` (followers of this
 * user) and `followedUsers` (users this user follows) arrays into per-relationship
 * hash rows, and stamps the denormalized counters (`followerCount`, `followingCount`).
 *
 * Run AFTER deploying the user-follow refactor code. After this is run, the legacy
 * arrays are no longer read from anywhere and can be dropped in a follow-up cleanup.
 *
 * Idempotent: rewriting a hash row with the same SK is a no-op; counters are stamped
 * to the exact array length each pass.
 */
import { userDao } from '@server/dynamo/daos';
import documentClient from '@server/dynamo/documentClient';

import 'dotenv/config';
import { ScanCommand, UpdateCommand } from '../../../server/node_modules/@aws-sdk/lib-dynamodb';

interface Stats {
  usersScanned: number;
  usersWithFollowers: number;
  usersWithFollowing: number;
  followRowsWritten: number;
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

const setUserCounter = async (
  userId: string,
  field: 'followerCount' | 'followingCount',
  count: number,
): Promise<void> => {
  await documentClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { PK: `USER#${userId}`, SK: 'USER' },
      UpdateExpression: 'SET #item.#field = :v',
      ExpressionAttributeNames: { '#item': 'item', '#field': field },
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
    usersWithFollowers: 0,
    usersWithFollowing: 0,
    followRowsWritten: 0,
    errors: 0,
  };

  const now = Date.now();

  for await (const item of scanAllUsers()) {
    stats.usersScanned += 1;
    const userBody = item.item || {};
    const userId: string | undefined = userBody.id;
    if (!userId) continue;

    // Legacy fields:
    //   user.following     = userIds who follow this user (this user's followers)
    //   user.followedUsers = userIds this user follows
    const followers: string[] = userBody.following || [];
    const followedUsers: string[] = userBody.followedUsers || [];

    if (followers.length > 0) {
      stats.usersWithFollowers += 1;
      for (const followerId of followers) {
        try {
          // followerId follows userId  →  write row on userId's hash partition.
          await userDao.writeFollow(followerId, userId, now);
          stats.followRowsWritten += 1;
        } catch (err: any) {
          stats.errors += 1;
          console.error(`Failed to write FOLLOW(${followerId} → ${userId}): ${err.message}`);
        }
      }
    }

    if (followedUsers.length > 0) {
      stats.usersWithFollowing += 1;
      for (const followedId of followedUsers) {
        try {
          // userId follows followedId  →  write row on followedId's hash partition.
          await userDao.writeFollow(userId, followedId, now);
          stats.followRowsWritten += 1;
        } catch (err: any) {
          stats.errors += 1;
          console.error(`Failed to write FOLLOW(${userId} → ${followedId}): ${err.message}`);
        }
      }
    }

    try {
      await setUserCounter(userId, 'followerCount', followers.length);
      await setUserCounter(userId, 'followingCount', followedUsers.length);
    } catch (err: any) {
      stats.errors += 1;
      console.error(`Failed to stamp counters for user ${userId}: ${err.message}`);
    }

    if (stats.usersScanned % 100 === 0) {
      console.log(
        `Users scanned: ${stats.usersScanned}, follow rows written: ${stats.followRowsWritten}, errors: ${stats.errors}`,
      );
    }
  }

  console.log('\n=== User Follow Migration Complete ===');
  console.log(`Users scanned: ${stats.usersScanned}`);
  console.log(`Users with followers: ${stats.usersWithFollowers}`);
  console.log(`Users with following: ${stats.usersWithFollowing}`);
  console.log(`Follow rows written: ${stats.followRowsWritten}`);
  console.log(`Errors: ${stats.errors}`);

  process.exit(stats.errors > 0 ? 1 : 0);
};

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
