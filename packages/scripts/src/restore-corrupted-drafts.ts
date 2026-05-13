/**
 * Restore Corrupted Drafts (one-off recovery script)
 *
 * Background:
 *   A regression in transfer-ownership.ts (commit fdfd2560, 2026-03-28) wrote
 *   empty arrays to S3 for every draft of the transferred user, wiping out
 *   `seats/{id}.json` and `cardlist/{id}.json`. The DynamoDB metadata for those
 *   drafts now has empty `seatNames` and a `name` starting with "undefined ".
 *
 *   The data bucket has versioning enabled, so the previous (good) versions
 *   of both S3 objects are recoverable. This script walks the version history
 *   for a given draft id, finds the most recent version of each file whose
 *   contents actually carry deck data (seats with non-empty mainboards, cards
 *   array with cardIDs), optionally writes that content back as the current
 *   version, then triggers `draftDao.update()` so the DynamoDB row
 *   (name + seatNames) is recomputed from the restored seats.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register --project tsconfig.json \
 *     src/restore-corrupted-drafts.ts \
 *       [--id <draftId>]... [--ids <id1,id2,...>] \
 *       [--cube <cubeIdOrShortId>] [--owner <userIdOrUsername>] \
 *       [--concurrency 10] [--apply]
 *
 *   --id <id>       Draft id to restore. May be repeated.
 *   --ids <list>    Comma-separated list of draft ids.
 *   --cube <id>     Cube id (full or shortId). Restores every draft for that cube.
 *   --owner <id>    User id or username. Restores every draft for every cube
 *                   the user owns (uses queryByCubeOwnerUnhydrated).
 *   --concurrency N Max drafts to process in parallel (default 10).
 *   --apply         Actually perform the writes. Default is dry-run.
 */
import 'dotenv/config';

import { NativeAttributeValue } from '@aws-sdk/lib-dynamodb';

import { cubeDao, draftDao, userDao } from '../../server/src/dynamo/daos';
import {
  getBucketName,
  getObject,
  getObjectVersion,
  listObjectVersions,
  putObject,
} from '../../server/src/dynamo/s3client';
import { initializeCardDb } from '../../server/src/serverutils/cardCatalog';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface Args {
  ids: string[];
  cube: string | null;
  owner: string | null;
  concurrency: number;
  apply: boolean;
}

function parseArgs(argv: string[]): Args {
  const ids: string[] = [];
  let cube: string | null = null;
  let owner: string | null = null;
  let concurrency = 10;
  let apply = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--id' && argv[i + 1]) {
      ids.push(argv[i + 1]!);
      i++;
    } else if (arg === '--ids' && argv[i + 1]) {
      ids.push(...argv[i + 1]!.split(',').map((s) => s.trim()).filter(Boolean));
      i++;
    } else if (arg === '--cube' && argv[i + 1]) {
      cube = argv[i + 1]!;
      i++;
    } else if (arg === '--owner' && argv[i + 1]) {
      owner = argv[i + 1]!;
      i++;
    } else if (arg === '--concurrency' && argv[i + 1]) {
      const n = parseInt(argv[i + 1]!, 10);
      if (Number.isFinite(n) && n > 0) concurrency = n;
      i++;
    } else if (arg === '--apply') {
      apply = true;
    } else if (arg === '--dry-run') {
      apply = false;
    }
  }
  return { ids, cube, owner, concurrency, apply };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg: string) {
  console.log(`  ${msg}`);
}
function header(msg: string) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${msg}`);
  console.log('='.repeat(70));
}

interface SeatsPayload {
  seats: { mainboard?: number[][][]; sideboard?: number[][][]; [k: string]: unknown }[];
  basics?: unknown[];
  InitialState?: unknown;
}

/** "Good" seats data: at least one seat must have a non-empty mainboard. */
function seatsAreGood(data: any): data is SeatsPayload {
  if (!data || !Array.isArray(data.seats) || data.seats.length === 0) return false;
  return data.seats.some((seat: any) => {
    if (!seat?.mainboard || !Array.isArray(seat.mainboard)) return false;
    // mainboard is number[][][]; check any actual indices live in it
    return (seat.mainboard.flat(2) as unknown[]).length > 0;
  });
}

/** "Good" cards data: array with at least one entry that has a cardID. */
function cardsAreGood(data: any): data is unknown[] {
  return Array.isArray(data) && data.some((c: any) => !!c?.cardID);
}

/**
 * Walks versions newest→oldest and returns the first one whose content passes
 * the predicate, along with the parsed content. Returns null if no version
 * qualifies.
 */
async function findGoodVersion<T>(
  bucket: string,
  key: string,
  isGood: (data: any) => data is T,
): Promise<{ versionId: string; lastModified: Date; data: T; latestIsCorrupt: boolean } | null> {
  const versions = await listObjectVersions(bucket, key);
  if (versions.length === 0) return null;

  // Inspect current (latest) version first to confirm corruption.
  const latestRaw = await getObject(bucket, key);
  const latestIsCorrupt = !isGood(latestRaw);

  for (const version of versions) {
    const data = await getObjectVersion(bucket, key, version.versionId);
    if (isGood(data)) {
      return {
        versionId: version.versionId,
        lastModified: version.lastModified,
        data,
        latestIsCorrupt,
      };
    }
  }
  return null;
}

/** Run an async fn over inputs with a concurrency cap. */
async function pMap<I, O>(inputs: I[], concurrency: number, fn: (input: I, index: number) => Promise<O>): Promise<O[]> {
  const results: O[] = new Array(inputs.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, inputs.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= inputs.length) return;
      results[i] = await fn(inputs[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// ID resolution
// ---------------------------------------------------------------------------

async function resolveDraftIdsForCube(cubeArg: string): Promise<string[]> {
  const cube = await cubeDao.getById(cubeArg);
  if (!cube) {
    throw new Error(`Cube not found: ${cubeArg}`);
  }
  const ids: string[] = [];
  let lastKey: Record<string, NativeAttributeValue> | undefined;
  do {
    const page = await draftDao.queryByCubeUnhydrated(cube.id, lastKey);
    for (const d of page.items) ids.push(d.id);
    lastKey = page.lastKey;
  } while (lastKey);
  console.log(`Cube ${cube.id} (${cube.name}): found ${ids.length} draft(s)`);
  return ids;
}

async function resolveDraftIdsForOwner(ownerArg: string): Promise<string[]> {
  console.log(`Looking up user ${ownerArg}...`);
  const user = await userDao.getByIdOrUsername(ownerArg);
  if (!user) {
    throw new Error(`User not found: ${ownerArg}`);
  }
  console.log(`Resolved to ${user.id} (${user.username}). Paginating drafts...`);
  const ids: string[] = [];
  let lastKey: Record<string, NativeAttributeValue> | undefined;
  let pages = 0;
  do {
    const page = await draftDao.queryByCubeOwnerUnhydrated(user.id, lastKey);
    for (const d of page.items) ids.push(d.id);
    lastKey = page.lastKey;
    pages += 1;
    console.log(`  page ${pages}: +${page.items.length} (running total ${ids.length}${lastKey ? ', more…' : ', done'})`);
  } while (lastKey);
  console.log(`Owner ${user.id} (${user.username}): found ${ids.length} draft(s) across their cubes`);
  return ids;
}

// ---------------------------------------------------------------------------
// Per-draft restore
// ---------------------------------------------------------------------------

interface DraftResult {
  id: string;
  status: 'restored' | 'refreshed' | 'dry-run' | 'already-good' | 'skipped' | 'error';
  reason?: string;
  seatVersion?: string;
  cardsVersion?: string;
  seatCount?: number;
  cardCount?: number;
  resultName?: string;
}

/** DynamoDB row needs a metadata refresh if the buggy update wiped its seat names. */
function metadataLooksBad(draft: { name?: string; seatNames?: string[] }): boolean {
  if (!draft.seatNames || draft.seatNames.length === 0) return true;
  if (draft.seatNames.every((n) => !n || n === 'C')) return true;
  if (draft.name?.startsWith('undefined ')) return true;
  return false;
}

async function restoreDraft(id: string, apply: boolean): Promise<DraftResult> {
  const bucket = getBucketName();
  const seatsKey = `seats/${id}.json`;
  const cardsKey = `cardlist/${id}.json`;

  // Fetch seats- and cards-version metadata in parallel.
  const [seatsHit, cardsHit] = await Promise.all([
    findGoodVersion(bucket, seatsKey, seatsAreGood),
    findGoodVersion(bucket, cardsKey, cardsAreGood),
  ]);

  if (!seatsHit) {
    return { id, status: 'skipped', reason: 'no-good-seats-version' };
  }
  if (!cardsHit) {
    return { id, status: 'skipped', reason: 'no-good-cards-version' };
  }

  const seatCount = Array.isArray(seatsHit.data.seats) ? seatsHit.data.seats.length : 0;
  const cardCount = Array.isArray(cardsHit.data) ? cardsHit.data.length : 0;
  const s3NeedsRestore = seatsHit.latestIsCorrupt || cardsHit.latestIsCorrupt;

  if (!apply) {
    if (s3NeedsRestore) {
      return {
        id,
        status: 'dry-run',
        seatVersion: seatsHit.versionId,
        cardsVersion: cardsHit.versionId,
        seatCount,
        cardCount,
      };
    }
    return { id, status: 'already-good', seatCount, cardCount };
  }

  // Apply mode: write S3 back if needed, then check DynamoDB metadata.
  if (s3NeedsRestore) {
    await Promise.all([putObject(bucket, seatsKey, seatsHit.data), putObject(bucket, cardsKey, cardsHit.data)]);
  }

  const draft = await draftDao.getById(id);
  if (!draft) {
    return { id, status: 'error', reason: 'draft-not-in-dynamo' };
  }

  // If S3 was restored OR the existing DynamoDB row has bad seat names (empty,
  // all-'C', or "undefined ..." name from the buggy update), recompute via update().
  if (!s3NeedsRestore && !metadataLooksBad(draft)) {
    return { id, status: 'already-good', seatCount, cardCount };
  }

  await draftDao.update(draft);

  return {
    id,
    status: s3NeedsRestore ? 'restored' : 'refreshed',
    seatVersion: seatsHit.versionId,
    cardsVersion: cardsHit.versionId,
    seatCount,
    cardCount,
    resultName: draft.name,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function formatResult(r: DraftResult): string {
  const base = `${r.id}: ${r.status.toUpperCase()}`;
  switch (r.status) {
    case 'dry-run':
      return `${base} (would restore seats v${r.seatVersion}/${r.seatCount} seats, cards v${r.cardsVersion}/${r.cardCount} cards)`;
    case 'restored':
      return `${base} (${r.seatCount} seats, ${r.cardCount} cards, new name="${r.resultName}")`;
    case 'refreshed':
      return `${base} (S3 already good; recomputed metadata, new name="${r.resultName}")`;
    case 'already-good':
      return `${base} (${r.seatCount} seats, ${r.cardCount} cards)`;
    case 'skipped':
      return `${base} (${r.reason})`;
    case 'error':
      return `${base} (${r.reason})`;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Required so cardFromId / assessColors return real cards instead of placeholders
  // (otherwise every restored seat would compute as colorless and fall back to 'C').
  await initializeCardDb('../server/private');

  const ids = [...args.ids];
  if (args.cube) ids.push(...(await resolveDraftIdsForCube(args.cube)));
  if (args.owner) ids.push(...(await resolveDraftIdsForOwner(args.owner)));

  if (ids.length === 0) {
    console.error('No drafts to restore. Provide --id / --ids / --cube / --owner.');
    process.exit(1);
  }

  const uniqueIds = Array.from(new Set(ids));

  console.log(`Mode: ${args.apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Bucket: ${getBucketName()}`);
  console.log(`Drafts: ${uniqueIds.length}`);
  console.log(`Concurrency: ${args.concurrency}`);

  let processed = 0;
  const startedAt = Date.now();
  const results = await pMap(uniqueIds, args.concurrency, async (id) => {
    let result: DraftResult;
    try {
      result = await restoreDraft(id, args.apply);
    } catch (err) {
      result = { id, status: 'error', reason: (err as Error).message };
    }
    processed += 1;
    log(`[${processed}/${uniqueIds.length}] ${formatResult(result)}`);
    return result;
  });

  header('Summary');
  const buckets: Record<DraftResult['status'], number> = {
    restored: 0,
    refreshed: 0,
    'dry-run': 0,
    'already-good': 0,
    skipped: 0,
    error: 0,
  };
  for (const r of results) buckets[r.status] += 1;
  for (const [k, v] of Object.entries(buckets)) console.log(`  ${k}: ${v}`);
  console.log(`  total elapsed: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);

  const failures = buckets.error + buckets.skipped;
  process.exit(failures > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
