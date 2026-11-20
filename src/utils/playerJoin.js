import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Atomic player join utility.
 *
 * Adds (or updates) a player in a room's `players` array inside a Firestore
 * transaction. The transaction re-reads the room and is retried automatically
 * by Firestore if another write lands in between, so concurrent joins can no
 * longer overwrite each other (previously a plain read-then-write could drop
 * a player who joined at the same moment).
 *
 * @param {string} collectionName - Firestore collection name
 * @param {string} roomId - Room document ID
 * @param {string} playerName - Player name to add
 * @param {Function} createPlayerObject - (currentPlayerCount) => new player entry. May be null for rejoin-only calls.
 * @param {Function} findPlayerIndex - (players, playerName) => index
 * @param {Function} updatePlayerObject - (existingPlayer) => updatedPlayer, or null/undefined for "no change"
 * @param {number} maxRetries - Max transaction attempts (Firestore retries on contention)
 * @returns {Promise<{success: boolean, roomData: object|null, error: string|null}>}
 */
export async function atomicPlayerJoin(
  collectionName,
  roomId,
  playerName,
  createPlayerObject,
  findPlayerIndex,
  updatePlayerObject = null,
  maxRetries = 3
) {
  if (!collectionName || !roomId || !playerName || !playerName.trim()) {
    return {
      success: false,
      roomData: null,
      error: 'Missing required parameters'
    };
  }

  const trimmedPlayerName = playerName.trim();
  const roomRef = doc(db, collectionName, roomId);

  try {
    const roomData = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(roomRef);
      if (!snap.exists()) {
        throw new Error('Room not found');
      }

      const data = { id: snap.id, ...snap.data() };
      const players = Array.isArray(data.players) ? data.players : [];
      const existingIndex = findPlayerIndex(players, trimmedPlayerName);

      if (existingIndex !== -1) {
        const updatedPlayer = updatePlayerObject ? updatePlayerObject(players[existingIndex]) : null;
        if (!updatedPlayer) {
          return data; // Already in the room, nothing to change
        }
        const updatedPlayers = [...players];
        updatedPlayers[existingIndex] = updatedPlayer;
        transaction.update(roomRef, { players: updatedPlayers });
        return { ...data, players: updatedPlayers };
      }

      if (!createPlayerObject) {
        throw new Error('Player not found in room');
      }

      const updatedPlayers = [...players, createPlayerObject(players.length)];
      transaction.update(roomRef, { players: updatedPlayers });
      return { ...data, players: updatedPlayers };
    }, { maxAttempts: Math.max(5, maxRetries) }); // Several friends often join at once

    return { success: true, roomData, error: null };
  } catch (error) {
    console.error('❌ Error in atomicPlayerJoin:', error);
    return {
      success: false,
      roomData: null,
      error: error?.message || 'Unknown error during player join'
    };
  }
}
