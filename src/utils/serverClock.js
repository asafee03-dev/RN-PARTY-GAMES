/**
 * Shared clock for game timers.
 *
 * Timers compare "now" with start times written by another device
 * (turn_start_time, game_start_time, round_start_time). Using each phone's
 * own Date.now() meant a phone whose clock was a few seconds off showed a
 * different countdown and awarded time-based points differently.
 *
 * We estimate this device's offset from the Firestore server clock once per
 * session, and use serverNow() both when writing start times / timestamps
 * and when computing elapsed time. Until the sync completes (or if it
 * fails) the offset is 0, which is exactly the previous behavior.
 */
import { doc, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

let offsetMs = 0;
let synced = false;
let syncPromise = null;

// Samples per sync. The first one often includes opening the connection
// (slow and lopsided), so we keep the sample with the shortest round trip.
const SAMPLES = 3;
const START_DELAY_MS = 2000;

// Each device writes its own probe field (clock_probes.<id>, a few bytes, left
// in place to save a write), so two phones syncing at the same moment can't
// read each other's server timestamp. Probe writes are kept few: every write
// to the room makes a join/move transaction running at that moment retry.
const sessionId = Math.random().toString(36).slice(2, 10);

/** Current time on the shared (server) clock, in ms. */
export const serverNow = () => Date.now() + offsetMs;

export const isServerClockSynced = () => synced;

/** Whole seconds left on a countdown of `durationSec` that started at `startTime` (server clock). */
export const secondsLeft = (startTime, durationSec) =>
  Math.max(0, durationSec - Math.floor((serverNow() - startTime) / 1000));

/**
 * Calls `tick` now, then right after each whole second of the countdown that
 * started at `startTime`, on the server clock. A plain 1s setInterval ticks at
 * a different point within the second on each phone, so the shown number
 * changed up to a second apart between players even with synced clocks.
 * Each delay is recomputed, so the ticks realign when the clock sync finishes.
 * Returns a function that stops the ticker.
 */
export function startSecondTicker(startTime, tick) {
  let timer = null;
  let stopped = false;
  const run = () => {
    if (stopped) return;
    tick();
    if (stopped) return;
    const intoSecond = (((serverNow() - startTime) % 1000) + 1000) % 1000;
    timer = setTimeout(run, 1000 - intoSecond + 15); // Just past the boundary
  };
  run();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

/**
 * Measure the offset by writing a serverTimestamp() to the room document and
 * reading it back from the server. The server stamped the write somewhere between sending
 * it and the write resolving, so the midpoint is a good local estimate (error
 * at most half the round trip). Several samples are taken and the one with
 * the shortest round trip wins, which keeps the error to a few tens of ms
 * even when the first request has to open the connection.
 *
 * Runs once per app session; later calls return the same promise.
 */
export const syncServerClock = (collectionName, roomId) => {
  if (synced || !collectionName || !roomId) return Promise.resolve(offsetMs);
  if (syncPromise) return syncPromise;

  syncPromise = (async () => {
    const roomRef = doc(db, collectionName, roomId);
    const probeField = `clock_probes.${sessionId}`;
    let best = null; // { rtt, offset }
    try {
      // Let the room join/load finish first: probe writes landing during the
      // join transaction made it retry (slower joins). Timers start later anyway.
      await new Promise((resolve) => setTimeout(resolve, START_DELAY_MS));
      for (let i = 0; i < SAMPLES; i++) {
        const sentAt = Date.now();
        await updateDoc(roomRef, { [probeField]: serverTimestamp() });
        const ackAt = Date.now();

        // Read back through a transaction: it always reads from the server.
        // getDocFromServer was answered from the room listener's local view,
        // where the timestamp was still pending (null), so the sync silently
        // failed and every phone used its own clock.
        const stamp = await runTransaction(db, async (transaction) => {
          const snap = await transaction.get(roomRef);
          return snap.exists() ? snap.data().clock_probes?.[sessionId] : null;
        });
        if (stamp && typeof stamp.toMillis === 'function') {
          const rtt = ackAt - sentAt;
          if (!best || rtt < best.rtt) best = { rtt, offset: Math.round(stamp.toMillis() - (sentAt + ackAt) / 2) };
        }
      }
    } catch (error) {
      console.warn('⚠️ Could not sync server clock, using device clock:', error?.message || error);
    }
    if (best) {
      offsetMs = best.offset;
      synced = true;
      console.log(`🕒 Server clock offset: ${offsetMs}ms (best round trip ${best.rtt}ms)`);
    } else {
      syncPromise = null; // Allow a retry from the next room
    }
    return offsetMs;
  })();

  return syncPromise;
};
