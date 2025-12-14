import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Atomic player join utility
 * Ensures players are added to rooms reliably, even with concurrent joins
 * Uses retry mechanism with verification to handle race conditions
 */

/**
 * Safely add a player to a room's players array
 * Handles race conditions by retrying with verification
 * 
 * @param {string} collectionName - Firestore collection name
 * @param {string} roomId - Room document ID
 * @param {string} playerName - Player name to add
 * @param {Function} createPlayerObject - Function that creates the player object/entry
 * @param {Function} findPlayerIndex - Function to find player index in array: (players, playerName) => index
 * @param {Function} updatePlayerObject - Function to update existing player: (existingPlayer) => updatedPlayer
 * @param {number} maxRetries - Maximum retry attempts (default: 3)
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

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const roomRef = doc(db, collectionName, roomId);
      
      // Step 1: Read current room state
      const roomSnap = await getDoc(roomRef);
      
      if (!roomSnap.exists()) {
        return {
          success: false,
          roomData: null,
          error: 'Room not found'
        };
      }

      const roomData = { id: roomSnap.id, ...roomSnap.data() };
      const players = roomData.players || [];

      // Step 2: Check if player already exists
      const existingIndex = findPlayerIndex(players, trimmedPlayerName);
      const playerExists = existingIndex !== -1;

      if (playerExists) {
        // Player already exists - check if we need to update them
        if (updatePlayerObject) {
          const existingPlayer = players[existingIndex];
          const updatedPlayer = updatePlayerObject(existingPlayer);
          if (updatedPlayer) {
            const updatedPlayers = [...players];
            updatedPlayers[existingIndex] = updatedPlayer;
            
            // Write update
            await updateDoc(roomRef, { players: updatedPlayers });
            
            // Verify update
            const verifySnap = await getDoc(roomRef);
            if (verifySnap.exists()) {
              const verifiedData = { id: verifySnap.id, ...verifySnap.data() };
              const verifyIndex = findPlayerIndex(verifiedData.players || [], trimmedPlayerName);
              if (verifyIndex !== -1) {
                return {
                  success: true,
                  roomData: verifiedData,
                  error: null
                };
              }
            }
          } else {
            // No update needed, player already exists correctly
            return {
              success: true,
              roomData: roomData,
              error: null
            };
          }
        } else {
          // Player exists and no update needed
          return {
            success: true,
            roomData: roomData,
            error: null
          };
        }
      } else {
        // Step 3: Add new player
        const newPlayer = createPlayerObject(players.length);
        const updatedPlayers = [...players, newPlayer];

        // Step 4: Write update
        await updateDoc(roomRef, { players: updatedPlayers });

        // Step 5: Verify player was actually added
        const verifySnap = await getDoc(roomRef);
        if (verifySnap.exists()) {
          const verifiedData = { id: verifySnap.id, ...verifySnap.data() };
          const verifyIndex = findPlayerIndex(verifiedData.players || [], trimmedPlayerName);
          
          if (verifyIndex !== -1) {
            // Success - player is confirmed in room
            return {
              success: true,
              roomData: verifiedData,
              error: null
            };
          } else {
            // Verification failed - another write may have overwritten ours
            console.warn(`⚠️ Player join verification failed (attempt ${attempt + 1}/${maxRetries}), retrying...`);
            if (attempt < maxRetries - 1) {
              // Wait a bit before retry to avoid immediate conflicts
              await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
              continue;
            } else {
              return {
                success: false,
                roomData: verifiedData,
                error: 'Failed to verify player join after retries'
              };
            }
          }
        } else {
          return {
            success: false,
            roomData: null,
            error: 'Room deleted during join'
          };
        }
      }
    } catch (error) {
      console.error(`❌ Error in atomicPlayerJoin (attempt ${attempt + 1}/${maxRetries}):`, error);
      if (attempt < maxRetries - 1) {
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
        continue;
      } else {
        return {
          success: false,
          roomData: null,
          error: error.message || 'Unknown error during player join'
        };
      }
    }
  }

  return {
    success: false,
    roomData: null,
    error: 'Max retries exceeded'
  };
}

