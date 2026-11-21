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
