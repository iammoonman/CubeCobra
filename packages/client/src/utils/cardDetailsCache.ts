import { CardDetails } from '@utils/datatypes/Card';

// Persistent client-side cache for card details keyed by scryfall_id.
//
// Lookup goes IndexedDB → server in one shot. Concurrent callers within the
// same tick are coalesced into a single POST to /cube/api/getdetailsforcards,
// so a page with 50 components each asking for one card produces one round
// trip instead of 50.
//
// Each entry carries a `cachedAt` timestamp and expires after a week. Reads
// past TTL are treated as misses; the server refetch overwrites the entry on
// the way back through. Entries from before this scheme (no `cachedAt`) are
// likewise treated as expired so existing users get a one-time refresh.

const DB_NAME = 'cubecobra-card-details';
const DB_VERSION = 1;
const STORE = 'details';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CachedEntry {
  details: CardDetails;
  cachedAt: number;
}

const hasIndexedDB = typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';

let dbPromise: Promise<IDBDatabase> | null = null;
const openDb = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB open blocked'));
  }).catch((err) => {
    dbPromise = null;
    throw err;
  });
  return dbPromise;
};

const wrap = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const readMany = async (ids: string[]): Promise<Record<string, CardDetails | undefined>> => {
  const result: Record<string, CardDetails | undefined> = {};
  if (!hasIndexedDB) return result;
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const now = Date.now();
    await Promise.all(
      ids.map(async (id) => {
        const entry = (await wrap(store.get(id))) as CachedEntry | undefined;
        if (!entry || typeof entry.cachedAt !== 'number') return;
        if (now - entry.cachedAt > TTL_MS) return;
        result[id] = entry.details;
      }),
    );
  } catch {
    // fall through with empty result; caller fetches everything from the server
  }
  return result;
};

const writeMany = async (entries: Array<[string, CardDetails]>): Promise<void> => {
  if (!hasIndexedDB || entries.length === 0) return;
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const cachedAt = Date.now();
    for (const [id, value] of entries) {
      const entry: CachedEntry = { details: value, cachedAt };
      store.put(entry, id);
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // best-effort persistence; the in-memory result still resolves
  }
};

interface PendingRequest {
  id: string;
  resolve: (value: CardDetails | null) => void;
}

let pendingQueue: PendingRequest[] = [];
let pendingFlush: Promise<void> | null = null;

const flushPending = async (): Promise<void> => {
  const batch = pendingQueue;
  pendingQueue = [];
  pendingFlush = null;

  const uniqueIds = [...new Set(batch.map((r) => r.id))];
  const detailsById: Record<string, CardDetails | null> = {};

  try {
    const response = await fetch('/cube/api/getdetailsforcards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cards: uniqueIds }),
    });
    if (response.ok) {
      const json = await response.json();
      if (json.success === 'true' && Array.isArray(json.details)) {
        for (let i = 0; i < uniqueIds.length; i++) {
          detailsById[uniqueIds[i]] = json.details[i] ?? null;
        }
      }
    }
  } catch {
    // network error — every pending caller resolves to null below
  }

  const toPersist: Array<[string, CardDetails]> = [];
  for (const id of uniqueIds) {
    const value = detailsById[id];
    if (value) toPersist.push([id, value]);
  }
  if (toPersist.length > 0) {
    // Fire and forget — persistence shouldn't delay the response to consumers.
    writeMany(toPersist);
  }

  for (const request of batch) {
    request.resolve(detailsById[request.id] ?? null);
  }
};

const fetchFromServer = (id: string): Promise<CardDetails | null> =>
  new Promise<CardDetails | null>((resolve) => {
    pendingQueue.push({ id, resolve });
    if (!pendingFlush) {
      // Coalesce all calls scheduled in the same microtask into one POST.
      pendingFlush = Promise.resolve().then(flushPending);
    }
  });

export const getCardDetails = async (ids: string[]): Promise<Record<string, CardDetails | null>> => {
  if (ids.length === 0) return {};
  const uniqueIds = [...new Set(ids)];

  const cached = await readMany(uniqueIds);

  const result: Record<string, CardDetails | null> = {};
  const missing: string[] = [];
  for (const id of uniqueIds) {
    if (cached[id] !== undefined) {
      result[id] = cached[id]!;
    } else {
      missing.push(id);
    }
  }

  if (missing.length > 0) {
    const fetched = await Promise.all(missing.map((id) => fetchFromServer(id)));
    for (let i = 0; i < missing.length; i++) {
      result[missing[i]] = fetched[i];
    }
  }

  return result;
};

export const getCardDetail = async (id: string): Promise<CardDetails | null> => {
  const result = await getCardDetails([id]);
  return result[id] ?? null;
};

// Exposed for tests / debugging. Not used by app code.
export const clearCardDetailsCache = async (): Promise<void> => {
  if (!hasIndexedDB) return;
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).clear();
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};
