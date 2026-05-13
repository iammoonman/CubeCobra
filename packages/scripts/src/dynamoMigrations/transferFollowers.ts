/**
 * One-shot: move every "follower of source" relationship onto destination.
 *
 *   For each FOLLOWER#{X} row on HASH#USER#{source}:
 *     - If X === dest, drop the source row (no self-follow on dest).
 *     - If FOLLOWER#{X} already exists on HASH#USER#{dest}, drop the source
 *       row (the follow already exists on dest).
 *     - Otherwise, write FOLLOWER#{X} on HASH#USER#{dest} (preserving the
 *       original followedAt timestamp), then delete the source row.
 *
 * After all rows are processed, both users' `item.followerCount` are
 * reconciled with `userDao.countFollowersOf`. Individual followers'
 * `followingCount` is intentionally NOT touched — collapsed duplicates will
 * drift by +1 until the next `migrate-user-follows --recount` pass.
 *
 * Usage:
 *   npm run transfer-followers -- --from <sourceUserId> --to <destUserId> [--dry-run]
 */
import { DeleteCommand, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { userDao } from '@server/dynamo/daos';
import documentClient from '@server/dynamo/documentClient';

import 'dotenv/config';

interface Stats {
  sourceFollowersFound: number;
  rowsMovedToDest: number;
  duplicatesDropped: number;
  selfFollowsSkipped: number;
  errors: number;
}

const tableName = process.env.DYNAMO_TABLE!;

const argFor = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  if (i === -1) return undefined;
  return process.argv[i + 1];
};

const DRY_RUN = process.argv.includes('--dry-run');
const SOURCE = argFor('--from');
const DEST = argFor('--to');

const userKey = (userId: string) => ({ PK: `USER#${userId}`, SK: 'USER' });
const followerSK = (followerId: string) => `FOLLOWER#${followerId}`;
const userHashPK = (userId: string) => `HASH#USER#${userId}`;

const getUser = async (userId: string): Promise<any | null> => {
  const result = await documentClient.send(
    new GetCommand({ TableName: tableName, Key: userKey(userId) }),
  );
  return result.Item ?? null;
};

const setFollowerCount = async (userId: string, count: number): Promise<void> => {
  await documentClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: userKey(userId),
      UpdateExpression: 'SET #item.#followerCount = :v',
      ExpressionAttributeNames: { '#item': 'item', '#followerCount': 'followerCount' },
      ExpressionAttributeValues: { ':v': count },
    }),
  );
};

const main = async () => {
  if (!tableName) {
    console.error('DYNAMO_TABLE env var is required');
    process.exit(1);
  }
  if (!SOURCE || !DEST) {
    console.error('Usage: transferFollowers --from <sourceUserId> --to <destUserId> [--dry-run]');
    process.exit(1);
  }
  if (SOURCE === DEST) {
    console.error('--from and --to must be different user IDs');
    process.exit(1);
  }

  const [sourceUser, destUser] = await Promise.all([getUser(SOURCE), getUser(DEST)]);
  if (!sourceUser) {
    console.error(`Source user ${SOURCE} not found`);
    process.exit(1);
  }
  if (!destUser) {
    console.error(`Destination user ${DEST} not found`);
    process.exit(1);
  }

  const sourceUsername = sourceUser.item?.username ?? '(no username)';
  const destUsername = destUser.item?.username ?? '(no username)';
  const sourceBefore = sourceUser.item?.followerCount ?? '(unset)';
  const destBefore = destUser.item?.followerCount ?? '(unset)';

  console.log(`Source: ${SOURCE} (${sourceUsername}) — followerCount=${sourceBefore}`);
  console.log(`Dest:   ${DEST} (${destUsername}) — followerCount=${destBefore}`);
  console.log(DRY_RUN ? '\n--- DRY RUN: no writes will be issued ---\n' : '');

  const stats: Stats = {
    sourceFollowersFound: 0,
    rowsMovedToDest: 0,
    duplicatesDropped: 0,
    selfFollowsSkipped: 0,
    errors: 0,
  };

  let lastKey: Record<string, any> | undefined;
  let pageNum = 0;

  do {
    pageNum += 1;
    const result = await documentClient.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: {
          ':pk': userHashPK(SOURCE),
          ':prefix': 'FOLLOWER#',
        },
        ExclusiveStartKey: lastKey,
      }),
    );

    const items = result.Items || [];
    console.log(`Page ${pageNum}: ${items.length} follower row(s)`);

    for (const row of items) {
      stats.sourceFollowersFound += 1;
      const followerId: string | undefined = row.followerId;
      const followedAt: number | undefined = row.followedAt;

      if (!followerId) {
        stats.errors += 1;
        console.error(`  Row missing followerId: ${JSON.stringify(row)}`);
        continue;
      }

      // Self-follow guard: dest can't follow itself.
      if (followerId === DEST) {
        stats.selfFollowsSkipped += 1;
        console.log(`  ${followerId} → skip (dest user, would self-follow); deleting source row`);
        if (!DRY_RUN) {
          try {
            await documentClient.send(
              new DeleteCommand({
                TableName: tableName,
                Key: { PK: userHashPK(SOURCE), SK: followerSK(followerId) },
              }),
            );
          } catch (err: any) {
            stats.errors += 1;
            console.error(`    delete source row failed: ${err.message}`);
          }
        }
        continue;
      }

      // Already follows dest? Then just drop the source row.
      let destExists = false;
      try {
        destExists = await userDao.getFollow(followerId, DEST);
      } catch (err: any) {
        stats.errors += 1;
        console.error(`  ${followerId} → getFollow(dest) failed: ${err.message}`);
        continue;
      }

      if (destExists) {
        stats.duplicatesDropped += 1;
        console.log(`  ${followerId} → already follows dest; deleting source row`);
        if (!DRY_RUN) {
          try {
            await documentClient.send(
              new DeleteCommand({
                TableName: tableName,
                Key: { PK: userHashPK(SOURCE), SK: followerSK(followerId) },
              }),
            );
          } catch (err: any) {
            stats.errors += 1;
            console.error(`    delete source row failed: ${err.message}`);
          }
        }
        continue;
      }

      // Write new follow on dest (preserving original timestamp), then delete source.
      console.log(`  ${followerId} → moving to dest (followedAt=${followedAt ?? 'now'})`);
      if (!DRY_RUN) {
        try {
          await userDao.writeFollow(followerId, DEST, followedAt ?? Date.now());
        } catch (err: any) {
          stats.errors += 1;
          console.error(`    writeFollow(${followerId} → ${DEST}) failed: ${err.message}`);
          continue;
        }
        try {
          await documentClient.send(
            new DeleteCommand({
              TableName: tableName,
              Key: { PK: userHashPK(SOURCE), SK: followerSK(followerId) },
            }),
          );
        } catch (err: any) {
          stats.errors += 1;
          console.error(`    delete source row failed (dest write succeeded): ${err.message}`);
          continue;
        }
      }
      stats.rowsMovedToDest += 1;
    }

    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  // Reconcile both users' followerCount.
  if (!DRY_RUN) {
    try {
      const [sourceCount, destCount] = await Promise.all([
        userDao.countFollowersOf(SOURCE),
        userDao.countFollowersOf(DEST),
      ]);
      await Promise.all([setFollowerCount(SOURCE, sourceCount), setFollowerCount(DEST, destCount)]);
      console.log(`\nReconciled followerCount — source=${sourceCount}, dest=${destCount}`);
    } catch (err: any) {
      stats.errors += 1;
      console.error(`Failed to reconcile followerCount: ${err.message}`);
    }
  } else {
    const [sourceCount, destCount] = await Promise.all([
      userDao.countFollowersOf(SOURCE),
      userDao.countFollowersOf(DEST),
    ]);
    console.log(`\nDRY RUN — current followerCount (no writes): source=${sourceCount}, dest=${destCount}`);
  }

  console.log('\n=== Transfer Followers Complete ===');
  console.log(`Source follower rows found:        ${stats.sourceFollowersFound}`);
  console.log(`Rows moved to dest:                ${stats.rowsMovedToDest}`);
  console.log(`Duplicates dropped (already followed dest): ${stats.duplicatesDropped}`);
  console.log(`Self-follows skipped (X = dest):   ${stats.selfFollowsSkipped}`);
  console.log(`Errors:                            ${stats.errors}`);

  process.exit(stats.errors > 0 ? 1 : 0);
};

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
