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
import { doc, getDocFromServer, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

let offsetMs = 0;
let synced = false;
let syncPromise = null;

/** Current time on the shared (server) clock, in ms. */
export const serverNow = () => Date.now() + offsetMs;

export const isServerClockSynced = () => synced;

/**
 * Measure the offset by writing a serverTimestamp() to the room document and
 * reading it back. The server stamped the write somewhere between sending
 * it and the write resolving, so the midpoint is a good local estimate
 * (error is at most half the round trip, typically well under a second).
 *
 * Runs once per app session; later calls return the same promise.
 */
export const syncServerClock = (collectionName, roomId) => {
  if (synced || !collectionName || !roomId) return Promise.resolve(offsetMs);
  if (syncPromise) return syncPromise;

  syncPromise = (async () => {
    try {
      const roomRef = doc(db, collectionName, roomId);
      const sentAt = Date.now();
      await updateDoc(roomRef, { clock_probe: serverTimestamp() });
      const ackAt = Date.now();

      const snap = await getDocFromServer(roomRef);
      const stamp = snap.exists() ? snap.data().clock_probe : null;
      if (stamp && typeof stamp.toMillis === 'function') {
        offsetMs = Math.round(stamp.toMillis() - (sentAt + ackAt) / 2);
        synced = true;
        console.log(`🕒 Server clock offset: ${offsetMs}ms (round trip ${ackAt - sentAt}ms)`);
      }
    } catch (error) {
      console.warn('⚠️ Could not sync server clock, using device clock:', error?.message || error);
    } finally {
      if (!synced) syncPromise = null; // Allow a retry from the next room
    }
    return offsetMs;
  })();

  return syncPromise;
};
