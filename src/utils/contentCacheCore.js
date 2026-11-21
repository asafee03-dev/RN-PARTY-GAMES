/**
 * Content cache core (pure: no Firestore/React imports, so it can be unit
 * tested with fakes). Wired to Firestore in contentCache.js.
 *
 * The word lists (WordCard ~800 docs, DrawWord, FrequencyTopic, SpyLocation)
 * used to be read in full on every game screen / turn. Now each list is:
 * 1. kept in memory for the app session (no reads after the first use),
 * 2. saved on the device, so the next launch doesn't read it again,
 * 3. checked once per session with a small freshness check:
 *    - a `<Collection>/_meta` doc with a `version` field: refresh when the
 *      version differs from the cached one (bump it after editing words);
 *    - without `_meta`: refresh when the doc count differs (one aggregate
 *      read), or when the saved copy is older than maxAgeMs.
 * 4. When offline or on errors, the saved copy is used.
 */

export const CONTENT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const contentStorageKey = (name) => `contentCache:v1:${name}`;

/**
 * deps:
 *   fetchMeta(name)  -> { version } | null   (1 read)
 *   fetchCount(name) -> number               (1 read, aggregate)
 *   fetchAll(name)   -> Array<doc data>      (1 read per doc)
 *   storage          -> { getItem, setItem } (strings)
 *   now()            -> ms
 */
export function createContentCache({
  fetchMeta,
  fetchCount,
  fetchAll,
  storage,
  now = () => Date.now(),
  maxAgeMs = CONTENT_MAX_AGE_MS,
  log = () => {},
}) {
  const memory = new Map(); // name -> docs verified this session
  const inflight = new Map(); // name -> Promise<docs>

  const readStored = async (name) => {
    try {
      const raw = await storage.getItem(contentStorageKey(name));
      const entry = raw ? JSON.parse(raw) : null;
      return entry && Array.isArray(entry.docs) ? entry : null;
    } catch {
      return null;
    }
  };

  const writeStored = async (name, entry) => {
    try {
      await storage.setItem(contentStorageKey(name), JSON.stringify(entry));
    } catch {
      // Storage full/unavailable: the memory copy still works this session
    }
  };

  // { fresh, version }. Throws on network errors (caller falls back).
  const checkFreshness = async (name, stored) => {
    const meta = await fetchMeta(name);
    if (meta && meta.version !== undefined && meta.version !== null) {
      return { fresh: !!stored && stored.version === meta.version, version: meta.version };
    }
    // No _meta doc: count check, plus a maximum age
    if (!stored || stored.version != null || now() - (stored.savedAt || 0) > maxAgeMs) {
      return { fresh: false, version: null };
    }
    const count = await fetchCount(name);
    return { fresh: stored.count === count, version: null };
  };

  // { docs, verified }: verified = checked against the server this session
  const load = async (name) => {
    const stored = await readStored(name);
    let check;
    try {
      check = await checkFreshness(name, stored);
    } catch (error) {
      if (stored) {
        log(`⚠️ [CONTENT] ${name}: check failed (offline?), using the saved copy`);
        return { docs: stored.docs, verified: false };
      }
      throw error;
    }
    if (check.fresh) {
      log(`✅ [CONTENT] ${name}: saved copy is current (${stored.docs.length})`);
      return { docs: stored.docs, verified: true };
    }
    try {
      const docs = await fetchAll(name);
      if (docs.length > 0) {
        await writeStored(name, { version: check.version, count: docs.length, savedAt: now(), docs });
      }
      log(`✅ [CONTENT] ${name}: loaded ${docs.length} docs from the server`);
      return { docs, verified: docs.length > 0 };
    } catch (error) {
      if (stored) {
        log(`⚠️ [CONTENT] ${name}: load failed, using the saved copy`);
        return { docs: stored.docs, verified: false };
      }
      throw error;
    }
  };

  return {
    /** All docs of collection `name` (data objects with `id`). */
    get(name) {
      if (memory.has(name)) return Promise.resolve(memory.get(name));
      if (inflight.has(name)) return inflight.get(name);
      const promise = load(name)
        .then(({ docs, verified }) => {
          // An unverified (offline) copy is not remembered, so the next
          // call checks the server again
          if (verified) memory.set(name, docs);
          return docs;
        })
        .finally(() => inflight.delete(name));
      inflight.set(name, promise);
      return promise;
    },
  };
}
