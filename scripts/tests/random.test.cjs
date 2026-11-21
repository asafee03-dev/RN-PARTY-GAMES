// pickForGame regression: no repeats within a game, restart without the last item
const path = require('path');
const { test, assert, eq, ROOT } = require('./run.cjs');
const R = require(path.join(ROOT, 'src/utils/random.js'));

const POOL = Array.from({ length: 30 }, (_, i) => `w${i}`).concat(['w1', 'w2']); // with duplicates

test('pickForGame: no repeats until the pool is used up, then a clean restart', () => {
  let used = [];
  let current = null;
  const seen = new Set();
  for (let r = 0; r < 30; r++) {
    const res = R.pickForGame(POOL, { used, currentKey: current, newGame: r === 0 });
    assert(!seen.has(res.key), `repeat ${res.key} in round ${r}`);
    seen.add(res.key);
    used = res.append ? [...used, res.key] : res.nextUsed;
    current = res.key;
  }
  const next = R.pickForGame(POOL, { used, currentKey: current });
  assert(!next.append && next.nextUsed.length === 1, 'restart after exhaustion');
  assert(next.key !== current, 'not the item just played');
});

test('pickForGame: new game starts a clean list; old rooms count the current item', () => {
  eq(R.pickForGame(POOL, { used: ['w0', 'w3'], newGame: true }).nextUsed.length, 1, 'new game list');
  const legacy = R.pickForGame(POOL, { used: undefined, currentKey: 'w5' });
  assert(legacy.key !== 'w5' && legacy.nextUsed.includes('w5') && !legacy.append, 'legacy room');
});
