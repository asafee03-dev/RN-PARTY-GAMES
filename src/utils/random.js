/**
 * Random helpers. Use these instead of `list.sort(() => Math.random() - 0.5)`:
 * that is NOT a fair shuffle. Its bias depends on the engine's sort algorithm
 * and is strong on short lists (on Hermes the first player was picked as the
 * spy far more often than the others).
 */

/** Integer in [0, n). */
export const randomInt = (n) => Math.floor(Math.random() * n);

/** Unbiased Fisher-Yates shuffle; returns a new array. */
export function shuffle(list) {
  const a = [...(list || [])];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Uniform random element (undefined for an empty list). */
export const pickRandom = (list) => (list && list.length ? list[randomInt(list.length)] : undefined);

/**
 * Random element that is not among the recent picks (by key), so the same
 * location/topic/word doesn't come back a few rounds in a row. Falls back to
 * the whole list when everything is recent.
 */
export function pickFresh(list, recent = [], keyOf = (x) => x) {
  const recentSet = new Set(recent || []);
  const fresh = (list || []).filter((x) => !recentSet.has(keyOf(x)));
  return pickRandom(fresh.length > 0 ? fresh : list);
}

/**
 * Removes duplicates by key, keeping the first of each. Content collections
 * hold the same word in more than one document, which used to let a word
 * come back even when it was "already used".
 */
export function uniqueBy(list, keyOf = (x) => x) {
  const seen = new Set();
  return (list || []).filter((x) => {
    const k = keyOf(x);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Hard cap on a room's used list, so it can never grow towards Firestore's
 * 1 MiB document limit even if a content pool becomes very large
 * (500 keys of up to ~60 bytes is ~30 KB).
 */
export const MAX_USED_KEYS = 500;

/**
 * Picks an item that was not used yet in this game.
 *
 * - Normal case: a random item whose key is not in `used`. The caller adds
 *   the key to the room's used list (arrayUnion).
 * - Pool exhausted (every item used, or the list hit MAX_USED_KEYS): a new
 *   cycle starts. Picks from the whole pool except `avoidKey` (the item that
 *   was just played), and the caller REPLACES the used list with [key].
 *
 * Returns { item, key, exhausted } or null for an empty pool.
 */
export function pickUnused(pool, used = [], { keyOf = (x) => x, avoidKey = null, maxUsed = MAX_USED_KEYS } = {}) {
  const items = uniqueBy(pool, keyOf);
  if (items.length === 0) return null;
  const usedSet = new Set(used || []);
  const fresh = usedSet.size < maxUsed ? items.filter((x) => !usedSet.has(keyOf(x))) : [];
  if (fresh.length > 0) {
    const item = pickRandom(fresh);
    return { item, key: keyOf(item), exhausted: false };
  }
  const others = items.filter((x) => keyOf(x) !== avoidKey);
  const item = pickRandom(others.length > 0 ? others : items);
  return { item, key: keyOf(item), exhausted: true };
}

/**
 * Next word/topic for a room game, against the room's used list.
 *   used       - the room's used list; undefined for rooms created before the
 *                list existed (then the current item counts as used)
 *   currentKey - key of the item being played now (never picked right after
 *                itself, even when a new cycle starts)
 *   newGame    - a new game: the used list starts over
 * Returns { item, key, append, nextUsed } or null for an empty pool. Write
 * arrayUnion(key) when `append` is true, otherwise write `nextUsed`
 * (a fresh list after a new game, a new cycle, or for an old room).
 */
export function pickForGame(pool, { used, currentKey = null, newGame = false, keyOf = (x) => x } = {}) {
  const known = newGame ? [] : (Array.isArray(used) ? used : (currentKey ? [currentKey] : []));
  const pick = pickUnused(pool, known, { keyOf, avoidKey: currentKey });
  if (!pick) return null;
  const restart = newGame || pick.exhausted;
  return {
    item: pick.item,
    key: pick.key,
    append: !restart && Array.isArray(used),
    nextUsed: restart ? [pick.key] : [...known, pick.key],
  };
}

/** Adds `item` to the front of a recent-picks list, capped at `max`. */
export const remember = (recent, item, max = 10) =>
  [item, ...(recent || []).filter((x) => x !== item)].slice(0, max);

/**
 * Picks `k` different items, each with probability proportional to its weight.
 * Used for spies: last game's spies get a lower weight so the same person is
 * less likely to be the spy again, but it stays possible (nobody can rule
 * themselves out).
 */
export function weightedSample(list, k, weightOf = () => 1) {
  const pool = [...(list || [])];
  const picked = [];
  while (picked.length < k && pool.length > 0) {
    const total = pool.reduce((sum, x) => sum + weightOf(x), 0);
    let r = Math.random() * total;
    let i = 0;
    for (; i < pool.length - 1; i++) {
      r -= weightOf(pool[i]);
      if (r < 0) break;
    }
    picked.push(pool.splice(i, 1)[0]);
  }
  return picked;
}

/** Weight for someone who was the spy in the previous game. */
export const REPEAT_SPY_WEIGHT = 0.4;
