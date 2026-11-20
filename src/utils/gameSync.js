/**
 * Helpers for keeping multiplayer rooms consistent across devices.
 *
 * Rule of thumb used by the game screens:
 * - Any write that moves the game forward (end round, next turn, start game)
 *   runs in a Firestore transaction that re-reads the room and checks it is
 *   still in the state the player saw. Duplicate presses become no-ops.
 * - Time-based / "advance" actions are driven by a single acting host so two
 *   devices never race to pick different random words/topics.
 */
import { Alert, Platform } from 'react-native';
import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';

export const getActivePlayers = (roomData) =>
  (roomData?.players || []).filter(p => p && p.name && p.active !== false);

/**
 * The single client allowed to drive round transitions: the host, or - if the
 * host has left - the first active player, so the game never gets orphaned.
 */
export const getActingHostName = (roomData) => {
  const active = getActivePlayers(roomData);
  if (active.some(p => p.name === roomData?.host_name)) {
    return roomData.host_name;
  }
  return active[0]?.name || roomData?.host_name || '';
};

/**
 * Index (in the full players array) of the next active player after
 * `currentIndex`, wrapping around. Returns -1 if nobody is active.
 */
export const getNextActiveIndex = (players, currentIndex) => {
  const list = players || [];
  const n = list.length;
  for (let step = 1; step <= n; step++) {
    const i = ((currentIndex ?? -1) + step + n) % n;
    const p = list[i];
    if (p && p.name && p.active !== false) {
      return i;
    }
  }
  return -1;
};

/** Index of the first active player, or -1. */
export const getFirstActiveIndex = (players) =>
  (players || []).findIndex(p => p && p.name && p.active !== false);

/**
 * Mark a player inactive without clobbering concurrent changes to the
 * players array (scores, joins) with a stale local copy.
 */
export const markPlayerInactive = async (collectionName, roomId, playerName) => {
  if (!collectionName || !roomId || !playerName) return;
  const roomRef = doc(db, collectionName, roomId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(roomRef);
    if (!snap.exists()) return;
    const players = snap.data().players;
    if (!Array.isArray(players)) return;
    if (!players.some(p => p && p.name === playerName && p.active !== false)) return;
    transaction.update(roomRef, {
      players: players.map(p => (p && p.name === playerName ? { ...p, active: false } : p))
    });
  });
};

/** Confirmation dialog that also works on web (Alert buttons are a no-op there). */
export const confirmAction = (title, message, onConfirm) => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: 'ביטול', style: 'cancel' },
    { text: 'אישור', style: 'destructive', onPress: onConfirm }
  ]);
};
