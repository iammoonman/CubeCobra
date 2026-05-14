import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PRIVATE = path.join(currentDir, '..', '..', '..', '..', 'packages', 'server', 'private');

interface CardRecord {
  oracle_id?: string;
  type?: string;
}

/**
 * Returns the set of export-side card indices that correspond to basic lands
 * (including snow-covered basics and Wastes). Used to strip basics out of deck
 * mainboards before clustering so that mana base doesn't dominate the signal.
 */
export function loadBasicLandIndices(exportIndexToOracle: Record<string, string>): Set<number> {
  const carddict: Record<string, CardRecord> = JSON.parse(
    fs.readFileSync(path.join(SERVER_PRIVATE, 'carddict.json'), 'utf8'),
  );

  const basicOracleIds = new Set<string>();
  for (const card of Object.values(carddict)) {
    const t = card.type;
    if (typeof t === 'string' && t.includes('Basic') && t.includes('Land') && card.oracle_id) {
      basicOracleIds.add(card.oracle_id);
    }
  }

  const basicIndices = new Set<number>();
  for (const [indexStr, oracleId] of Object.entries(exportIndexToOracle)) {
    if (basicOracleIds.has(oracleId)) {
      basicIndices.add(parseInt(indexStr, 10));
    }
  }

  return basicIndices;
}
