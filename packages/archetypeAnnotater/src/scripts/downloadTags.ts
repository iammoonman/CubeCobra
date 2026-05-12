import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import 'dotenv/config';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(currentDir, '..', '..', 'data', 'tags');
const OUT_PATH = path.join(OUT_DIR, 'oracleTags.json');
const START_URL = 'https://api.scryfall.com/private/tags/oracle';

interface ScryfallTag {
  object: 'tag';
  id: string;
  label: string;
  type: string;
  description?: string | null;
  oracle_ids?: string[];
}

interface ScryfallList {
  object: 'list';
  has_more: boolean;
  next_page?: string;
  data: ScryfallTag[];
}

const HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'CubeCobra-archetypeAnnotater/0.1 (+https://cubecobra.com)',
};

async function fetchPage(url: string): Promise<ScryfallList> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) {
      return (await res.json()) as ScryfallList;
    }
    if (res.status === 429 || res.status >= 500) {
      const wait = 1000 * (attempt + 1);
      console.warn(`  ${res.status} from ${url}, retrying in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    throw new Error(`Scryfall returned ${res.status} for ${url}`);
  }
  throw new Error(`Gave up after retries on ${url}`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const all: ScryfallTag[] = [];
  let url: string | undefined = START_URL;
  let page = 0;

  while (url) {
    page += 1;
    process.stdout.write(`Page ${page}: ${url}\n`);
    const list: ScryfallList = await fetchPage(url);
    for (const tag of list.data) {
      if (tag.type && tag.type !== 'oracle') continue;
      all.push(tag);
    }
    url = list.has_more ? list.next_page : undefined;
    // Scryfall asks for ~50-100ms between requests
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`Fetched ${all.length} oracle tags across ${page} page(s).`);
  fs.writeFileSync(OUT_PATH, JSON.stringify(all));
  console.log(`Wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error('Tag download failed:', err);
  process.exit(1);
});
