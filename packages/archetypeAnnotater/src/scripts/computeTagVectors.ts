import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import 'dotenv/config';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const TAGS_PATH = path.join(currentDir, '..', '..', 'data', 'tags', 'oracleTags.json');
const EXPORTS_DIR = path.join(currentDir, '..', '..', 'data', 'exports');
const OUT_DIR = path.join(currentDir, '..', '..', 'data', 'tagVectors');
const TAG_TO_INDEX_PATH = path.join(OUT_DIR, 'tagToIndex.json');
const ORACLE_TO_TAGS_PATH = path.join(OUT_DIR, 'oracleToTagIndices.json');
const VECTORS_PATH = path.join(OUT_DIR, 'tagVectors.ndjson');

interface ScryfallTag {
  id: string;
  label: string;
  type?: string;
  oracle_ids?: string[];
}

interface DeckExport {
  id: string;
  cube: string;
  owner: string;
  mainboard: number[];
  sideboard: number[];
  basics: number[];
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Load Scryfall oracle tags
  console.log(`Loading tags from ${TAGS_PATH}...`);
  const tags: ScryfallTag[] = JSON.parse(fs.readFileSync(TAGS_PATH, 'utf8'));
  console.log(`  ${tags.length} tags`);

  // Filter to tags with a usable label, sort by label for stable ordering
  const usable = tags.filter((t) => typeof t.label === 'string' && t.label.length > 0);
  if (usable.length < tags.length) {
    console.warn(`  ${tags.length - usable.length} tags dropped for missing label`);
  }
  const sorted = [...usable].sort((a, b) => a.label.localeCompare(b.label));
  const tagToIndex: Record<string, number> = {};
  sorted.forEach((tag, i) => {
    tagToIndex[tag.label] = i;
  });
  const numTags = sorted.length;

  // Build oracle id -> tag indices
  const oracleToTagIndices: Record<string, number[]> = {};
  for (const tag of sorted) {
    const idx = tagToIndex[tag.label];
    for (const oracleId of tag.oracle_ids ?? []) {
      const arr = oracleToTagIndices[oracleId];
      if (arr) arr.push(idx);
      else oracleToTagIndices[oracleId] = [idx];
    }
  }
  console.log(`  ${Object.keys(oracleToTagIndices).length} oracle ids have at least one tag`);

  fs.writeFileSync(TAG_TO_INDEX_PATH, JSON.stringify(tagToIndex));
  fs.writeFileSync(ORACLE_TO_TAGS_PATH, JSON.stringify(oracleToTagIndices));
  console.log(`Wrote ${TAG_TO_INDEX_PATH}`);
  console.log(`Wrote ${ORACLE_TO_TAGS_PATH}`);

  // Load card index -> oracle id (export-side mapping; matches deck mainboard ints)
  const exportIndexToOracle: Record<string, string> = JSON.parse(
    fs.readFileSync(path.join(EXPORTS_DIR, 'indexToOracleMap.json'), 'utf8'),
  );
  const numCards = Object.keys(exportIndexToOracle).length;
  console.log(`  ${numCards} export card indices`);

  // Pre-resolve each card index -> tag indices (avoids re-hashing per card per deck)
  const cardIndexToTags: (number[] | undefined)[] = new Array(numCards);
  let cardsWithTags = 0;
  for (let i = 0; i < numCards; i += 1) {
    const oracleId = exportIndexToOracle[String(i)];
    if (!oracleId) continue;
    const tagIdx = oracleToTagIndices[oracleId];
    if (tagIdx && tagIdx.length > 0) {
      cardIndexToTags[i] = tagIdx;
      cardsWithTags += 1;
    }
  }
  console.log(`  ${cardsWithTags}/${numCards} card indices resolved to >=1 tag`);

  // Walk deck export files, emit one normalized tag vector per deck
  const decksDir = path.join(EXPORTS_DIR, 'decks');
  const deckFiles = fs
    .readdirSync(decksDir)
    .filter((f) => f.endsWith('.json'))
    .sort((a, b) => parseInt(a) - parseInt(b));
  console.log(`Found ${deckFiles.length} deck batch files.`);

  const outStream = fs.createWriteStream(VECTORS_PATH);
  const seenIds = new Set<string>();
  let written = 0;
  let skippedEmpty = 0;
  let totalDecks = 0;

  for (const file of deckFiles) {
    const batch: DeckExport[] = JSON.parse(fs.readFileSync(path.join(decksDir, file), 'utf8'));
    for (const deck of batch) {
      totalDecks += 1;
      if (seenIds.has(deck.id)) continue;
      seenIds.add(deck.id);

      const counts = new Float32Array(numTags);
      let cardCount = 0;
      for (const cardIdx of deck.mainboard) {
        const tagIdx = cardIndexToTags[cardIdx];
        cardCount += 1;
        if (!tagIdx) continue;
        for (const t of tagIdx) counts[t] += 1;
      }

      if (cardCount === 0) {
        skippedEmpty += 1;
        continue;
      }

      const inv = 1 / cardCount;
      const vector: number[] = new Array(numTags);
      for (let t = 0; t < numTags; t += 1) {
        // Round to 4 decimals to keep file size manageable
        vector[t] = Math.round(counts[t] * inv * 10000) / 10000;
      }

      outStream.write(JSON.stringify({ deckId: deck.id, embedding: vector }) + '\n');
      written += 1;
      if (written % 100000 === 0) console.log(`  ${written} vectors written...`);
    }
  }

  await new Promise<void>((resolve) => {
    outStream.on('error', (err) => {
      console.warn('Stream close warning:', err.message);
      resolve();
    });
    outStream.end(() => resolve());
  });

  console.log(
    `Done. Processed ${totalDecks} deck rows, ${seenIds.size} unique decks; ` +
      `wrote ${written}, skipped ${skippedEmpty} empty.`,
  );
  console.log(`Output: ${VECTORS_PATH}`);
}

main().catch((err) => {
  console.error('Tag-vector computation failed:', err);
  process.exit(1);
});
