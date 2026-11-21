// Draw stroke write queue: order, merging, undo/clear, error isolation
const path = require('path');
const { test, assert, eq, ROOT } = require('./run.cjs');
const { createCoalescingQueue } = require(path.join(ROOT, 'src/logic/draw.js'));

// Fake server: one "transaction" per batch that applies the ops to the stored
// strokes, with a delay like a network round trip
function fakeServer({ delay = 20, failOn = -1 } = {}) {
  const srv = { strokes: [], writes: 0, batchSizes: [] };
  srv.runBatch = async (ops) => {
    const n = srv.writes++;
    await new Promise((r) => setTimeout(r, delay));
    if (n === failOn) throw new Error('write failed');
    srv.batchSizes.push(ops.length);
    srv.strokes = ops.reduce((s, op) => op(s), srv.strokes);
  };
  return srv;
}
const ctx = { key: 'room|0|1000|Dana' };
const add = (id) => (s) => [...s, id];

test('draw queue: a single stroke is written right away, alone', async () => {
  const srv = fakeServer(); const q = createCoalescingQueue(srv.runBatch);
  await q.push(add('a'), ctx);
  eq(srv.strokes, ['a'], 'stored'); eq(srv.writes, 1, 'writes');
});

test('draw queue: strokes finished during a save go out in one write, in order', async () => {
  const srv = fakeServer(); const q = createCoalescingQueue(srv.runBatch);
  const done = [q.push(add('a'), ctx)];
  for (const id of ['b', 'c', 'd', 'e']) done.push(q.push(add(id), ctx));
  await Promise.all(done);
  eq(srv.strokes, ['a', 'b', 'c', 'd', 'e'], 'order kept');
  eq(srv.batchSizes, [1, 4], 'first alone, the rest merged');
});

test('draw queue: undo and clear compose correctly inside a merged write', async () => {
  const srv = fakeServer(); const q = createCoalescingQueue(srv.runBatch);
  const ps = [q.push(add('a'), ctx), q.push(add('b'), ctx), q.push((s) => s.slice(0, -1), ctx), q.push(add('c'), ctx)];
  await Promise.all(ps);
  eq(srv.strokes, ['a', 'c'], 'undo removed b');
  await Promise.all([q.push(add('x'), ctx), q.push(() => [], ctx), q.push(add('y'), ctx)]);
  eq(srv.strokes, ['y'], 'clear then draw');
});

test('draw queue: a failed write does not block or lose later strokes', async () => {
  const srv = fakeServer({ failOn: 0 }); const errors = [];
  const q = createCoalescingQueue(srv.runBatch, (e) => errors.push(e.message));
  const p1 = q.push(add('a'), ctx);
  const p2 = q.push(add('b'), ctx);
  await Promise.all([p1, p2]);
  eq(errors, ['write failed'], 'error reported');
  eq(srv.strokes, ['b'], 'later stroke saved');
});

test('draw queue: operations of different turns are never merged', async () => {
  const srv = fakeServer(); const q = createCoalescingQueue(srv.runBatch);
  const other = { key: 'room|1|2000|Avi' };
  await Promise.all([q.push(add('a'), ctx), q.push(add('b'), ctx), q.push(add('z'), other), q.push(add('c'), ctx)]);
  // a is written alone; then b (turn 1) | z (turn 2) | c (turn 1): never mixed
  eq(srv.batchSizes, [1, 1, 1, 1], 'batches split by turn');
  eq(srv.strokes, ['a', 'b', 'z', 'c'], 'order kept');
});

test('draw queue: fewer writes for a fast drawer (20 strokes, 1 every 5ms, 20ms saves)', async () => {
  const srv = fakeServer({ delay: 20 }); const q = createCoalescingQueue(srv.runBatch);
  const ps = [];
  for (let i = 0; i < 20; i++) { ps.push(q.push(add(i), ctx)); await new Promise((r) => setTimeout(r, 5)); }
  await Promise.all(ps);
  eq(srv.strokes.length, 20, 'all strokes saved');
  assert(srv.writes < 20, `writes: ${srv.writes}`);
  console.log(`   (20 strokes -> ${srv.writes} writes)`);
});
