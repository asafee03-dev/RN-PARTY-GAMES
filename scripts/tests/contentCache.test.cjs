// contentCacheCore with a fake Firestore (counts billed reads) and fake storage
const path = require('path');
const { test, assert, eq, ROOT } = require('./run.cjs');
const { createContentCache, contentStorageKey, CONTENT_MAX_AGE_MS } = require(path.join(ROOT, 'src/utils/contentCacheCore.js'));

const WORDS = Array.from({ length: 800 }, (_, i) => ({ id: `w${i}`, word: `word${i}` }));

// Fake backend: a collection of docs, an optional _meta doc, an online flag.
// reads = what Firestore would bill (getDoc 1, count aggregate 1, getDocs 1/doc).
function fakeBackend({ docs = WORDS, meta = null } = {}) {
  const b = {
    docs, meta, online: true, reads: 0, fetchAllCalls: 0,
    fetchMeta: async () => { if (!b.online) throw new Error('offline'); b.reads += 1; return b.meta; },
    fetchCount: async () => { if (!b.online) throw new Error('offline'); b.reads += 1; return b.docs.length + (b.meta ? 1 : 0); },
    fetchAll: async () => {
      if (!b.online) throw new Error('offline');
      b.fetchAllCalls += 1;
      const all = b.meta ? [...b.docs, { id: '_meta', ...b.meta }] : b.docs;
      b.reads += all.length;
      await new Promise((r) => setTimeout(r, 5));
      return all;
    },
  };
  return b;
}
const fakeStorage = () => {
  const m = new Map();
  return { m, getItem: async (k) => (m.has(k) ? m.get(k) : null), setItem: async (k, v) => { m.set(k, v); } };
};
const make = (backend, storage, now = () => 1000) => createContentCache({ ...backend, storage, now });
const words = (docs) => docs.filter((d) => d.word).length;

test('content: first load reads the list once, then memory (0 reads)', async () => {
  const b = fakeBackend(); const s = fakeStorage(); const c = make(b, s);
  const first = await c.get('WordCard');
  eq(words(first), 800, 'words loaded');
  const readsAfterFirst = b.reads;
  assert(readsAfterFirst <= 802, `first load reads ${readsAfterFirst}`);
  await c.get('WordCard'); await c.get('WordCard');
  eq(b.reads, readsAfterFirst, 'no reads after the first load');
});

test('content: parallel calls share one load', async () => {
  const b = fakeBackend(); const c = make(b, fakeStorage());
  await Promise.all([c.get('WordCard'), c.get('WordCard'), c.get('WordCard'), c.get('WordCard')]);
  eq(b.fetchAllCalls, 1, 'full loads');
});

test('content: next app launch uses the saved copy (no _meta): 2 reads instead of 800', async () => {
  const b = fakeBackend(); const s = fakeStorage();
  await make(b, s).get('WordCard');
  b.reads = 0;
  const docs = await make(b, s, () => 2000).get('WordCard'); // new session, same device
  eq(words(docs), 800, 'words from saved copy');
  eq(b.reads, 2, 'meta check + count check');
  eq(b.fetchAllCalls, 1, 'no second full load');
});

test('content: with _meta, next launch costs 1 read; version bump refreshes', async () => {
  const b = fakeBackend({ meta: { version: 1 } }); const s = fakeStorage();
  await make(b, s).get('WordCard');
  b.reads = 0;
  await make(b, s).get('WordCard');
  eq(b.reads, 1, 'only the _meta read');
  b.meta = { version: 2 }; b.docs = [...WORDS, { id: 'new', word: 'brandnew' }];
  b.reads = 0;
  const docs = await make(b, s).get('WordCard');
  assert(docs.some((d) => d.word === 'brandnew'), 'new word after version bump');
  eq(b.fetchAllCalls, 2, 'reloaded once after the bump');
});

test('content: added/removed docs (count change) refresh without _meta', async () => {
  const b = fakeBackend(); const s = fakeStorage();
  await make(b, s).get('WordCard');
  b.docs = WORDS.slice(0, 790);
  const docs = await make(b, s).get('WordCard');
  eq(words(docs), 790, 'refreshed after removal');
});

test('content: saved copy older than the max age is refreshed (no _meta)', async () => {
  const b = fakeBackend(); const s = fakeStorage();
  await make(b, s, () => 0).get('WordCard');
  await make(b, s, () => CONTENT_MAX_AGE_MS + 1).get('WordCard');
  eq(b.fetchAllCalls, 2, 'reloaded after max age');
});

test('content: offline uses the saved copy, and retries next time', async () => {
  const b = fakeBackend(); const s = fakeStorage();
  await make(b, s).get('WordCard');
  b.online = false;
  const c = make(b, s);
  const docs = await c.get('WordCard');
  eq(words(docs), 800, 'saved copy offline');
  b.online = true; b.reads = 0;
  await c.get('WordCard');
  assert(b.reads > 0, 'checked the server again once back online');
});

test('content: offline with nothing saved fails like before (caller shows its alert)', async () => {
  const b = fakeBackend(); b.online = false;
  let threw = false;
  try { await make(b, fakeStorage()).get('WordCard'); } catch { threw = true; }
  assert(threw, 'should throw');
});

test('content: an empty result is not saved; corrupt storage is ignored', async () => {
  const b = fakeBackend({ docs: [] }); const s = fakeStorage();
  await make(b, s).get('DrawWord');
  assert(!s.m.has(contentStorageKey('DrawWord')), 'empty list not persisted');
  s.m.set(contentStorageKey('WordCard'), '{not json');
  const docs = await make(fakeBackend(), s).get('WordCard');
  eq(words(docs), 800, 'loaded despite corrupt saved copy');
});

test('content: lists are cached separately', async () => {
  const b = fakeBackend(); const c = make(b, fakeStorage());
  await c.get('WordCard'); await c.get('DrawWord');
  eq(b.fetchAllCalls, 2, 'one load per list');
});
