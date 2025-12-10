import { db } from '../firebase';
import { doc, deleteDoc, getDoc, query, collection, where, getDocs, onSnapshot } from 'firebase/firestore';

/**
 * Room deletion utility functions
 * Handles automatic room cleanup in various scenarios
 */

/**
 * Safely delete a room document
 * @param {string} collectionName - The Firestore collection name (e.g., 'GameRoom', 'CodenamesRoom')
 * @param {string} roomId - The room document ID
 * @returns {Promise<boolean>} - True if deletion was successful
 */
export async function deleteRoom(collectionName, roomId) {
  if (!roomId || !collectionName) {
    console.warn('⚠️ Cannot delete room: missing roomId or collectionName');
    return false;
  }

  try {
    const roomRef = doc(db, collectionName, roomId);
    const snapshot = await getDoc(roomRef);
    
    if (!snapshot.exists()) {
      console.log(`ℹ️ Room ${roomId} in ${collectionName} already deleted`);
      return true;
    }

    await deleteDoc(roomRef);
    console.log(`✅ Successfully deleted room ${roomId} from ${collectionName}`);
    return true;
  } catch (error) {
    console.error(`❌ Error deleting room ${roomId} from ${collectionName}:`, error);
    return false;
  }
}

/**
 * Check if a room code is unique for a given game collection
 * @param {string} collectionName - The Firestore collection name
 * @param {string} roomCode - The room code to check
 * @returns {Promise<boolean>} - True if code is unique (doesn't exist)
 */
export async function isRoomCodeUnique(collectionName, roomCode) {
  if (!roomCode || !collectionName) {
    return false;
  }

  try {
    // Check by document ID
    const roomRef = doc(db, collectionName, roomCode);
    const snapshot = await getDoc(roomRef);
    
    if (snapshot.exists()) {
      return false;
    }

    // Also check by room_code field (in case document ID is different)
    const q = query(collection(db, collectionName), where('room_code', '==', roomCode));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.empty;
  } catch (error) {
    console.error(`❌ Error checking room code uniqueness:`, error);
    return false;
  }
}

/**
 * Generate a unique room code for a given game collection
 * @param {string} collectionName - The Firestore collection name
 * @param {Function} generateCode - Function that generates a room code
 * @param {number} maxRetries - Maximum number of retries (default: 10)
 * @returns {Promise<string|null>} - Unique room code or null if failed
 */
export async function generateUniqueRoomCode(collectionName, generateCode, maxRetries = 10) {
  for (let i = 0; i < maxRetries; i++) {
    const code = generateCode().trim().toUpperCase();
    const isUnique = await isRoomCodeUnique(collectionName, code);
    
    if (isUnique) {
      return code;
    }
    
    console.log(`⚠️ Room code ${code} already exists in ${collectionName}, retrying... (${i + 1}/${maxRetries})`);
  }
  
  console.error(`❌ Failed to generate unique room code after ${maxRetries} attempts`);
  return null;
}

/**
 * Setup auto-deletion timer for game end state
 * If "New Game" is not pressed within grace period, delete the room
 * @param {string} collectionName - The Firestore collection name
 * @param {string} roomId - The room document ID
 * @param {number} gracePeriodMs - Grace period in milliseconds (default: 5 minutes)
 * @returns {Function} - Cleanup function to cancel the timer
 */
export function setupGameEndAutoDeletion(collectionName, roomId, gracePeriodMs = 5 * 60 * 1000) {
  if (!roomId || !collectionName) {
    return () => {};
  }

  console.log(`⏰ Setting up auto-deletion for room ${roomId} in ${collectionName} (grace period: ${gracePeriodMs}ms)`);
  
  const timeoutId = setTimeout(async () => {
    // Check if room still exists and is still in finished state
    try {
      const roomRef = doc(db, collectionName, roomId);
      const snapshot = await getDoc(roomRef);
      
      if (snapshot.exists()) {
        const roomData = snapshot.data();
        // Only delete if still in finished state (not reset to lobby)
        if (roomData.game_status === 'finished') {
          console.log(`🗑️ Auto-deleting room ${roomId} - game ended without "New Game" being pressed`);
          await deleteRoom(collectionName, roomId);
        } else {
          console.log(`ℹ️ Room ${roomId} was reset, skipping auto-deletion`);
        }
      }
    } catch (error) {
      console.error(`❌ Error in auto-deletion check:`, error);
    }
  }, gracePeriodMs);

  return () => {
    clearTimeout(timeoutId);
    console.log(`✅ Cancelled auto-deletion timer for room ${roomId}`);
  };
}

/**
 * Setup listener to delete room when all players leave
 * @param {string} collectionName - The Firestore collection name
 * @param {string} roomId - The room document ID
 * @returns {Function} - Cleanup function to unsubscribe
 */
export function setupEmptyRoomAutoDeletion(collectionName, roomId) {
  if (!roomId || !collectionName) {
    return () => {};
  }

  console.log(`👥 Setting up empty room auto-deletion for room ${roomId} in ${collectionName}`);
  
  const roomRef = doc(db, collectionName, roomId);
  
  const unsubscribe = onSnapshot(roomRef, async (snapshot) => {
    if (!snapshot.exists()) {
      // Room already deleted
      return;
    }

    const roomData = snapshot.data();
    
    // Check if room is empty (no players)
    let playerCount = 0;
    
    if (roomData.players && Array.isArray(roomData.players)) {
      playerCount = roomData.players.filter(p => p && p.name).length;
    } else if (roomData.teams && Array.isArray(roomData.teams)) {
      // For games with teams (like Alias)
      playerCount = roomData.teams.reduce((count, team) => {
        return count + (team.players && Array.isArray(team.players) ? team.players.filter(p => p && p.name).length : 0);
      }, 0);
    } else if (roomData.red_team || roomData.blue_team) {
      // For Codenames
      const redPlayers = roomData.red_team?.guessers?.length || 0;
      const bluePlayers = roomData.blue_team?.guessers?.length || 0;
      const redSpymaster = roomData.red_team?.spymaster ? 1 : 0;
      const blueSpymaster = roomData.blue_team?.spymaster ? 1 : 0;
      playerCount = redPlayers + bluePlayers + redSpymaster + blueSpymaster;
    }

    if (playerCount === 0) {
      console.log(`🗑️ Auto-deleting room ${roomId} - all players left`);
      await deleteRoom(collectionName, roomId);
      unsubscribe(); // Stop listening after deletion
    }
  }, (error) => {
    console.error(`❌ Error in empty room listener:`, error);
  });

  return unsubscribe;
}

/**
 * Setup timer to delete room after 1 hour
 * @param {string} collectionName - The Firestore collection name
 * @param {string} roomId - The room document ID
 * @param {number} createdAt - Timestamp when room was created (Date.now() or ISO string)
 * @returns {Function} - Cleanup function to cancel the timer
 */
export function setupRoomAgeAutoDeletion(collectionName, roomId, createdAt) {
  if (!roomId || !collectionName || !createdAt) {
    return () => {};
  }

  const createdTime = typeof createdAt === 'string' ? new Date(createdAt).getTime() : createdAt;
  const now = Date.now();
  const age = now - createdTime;
  const oneHour = 60 * 60 * 1000;
  
  // If room is already older than 1 hour, delete immediately
  if (age >= oneHour) {
    console.log(`🗑️ Room ${roomId} is already older than 1 hour, deleting immediately`);
    deleteRoom(collectionName, roomId);
    return () => {};
  }

  // Otherwise, set timer for remaining time
  const remainingTime = oneHour - age;
  console.log(`⏰ Setting up age-based auto-deletion for room ${roomId} in ${collectionName} (${Math.round(remainingTime / 1000 / 60)} minutes remaining)`);
  
  const timeoutId = setTimeout(async () => {
    // Double-check room still exists before deleting
    try {
      const roomRef = doc(db, collectionName, roomId);
      const snapshot = await getDoc(roomRef);
      
      if (snapshot.exists()) {
        console.log(`🗑️ Auto-deleting room ${roomId} - room is older than 1 hour`);
        await deleteRoom(collectionName, roomId);
      }
    } catch (error) {
      console.error(`❌ Error in age-based auto-deletion:`, error);
    }
  }, remainingTime);

  return () => {
    clearTimeout(timeoutId);
    console.log(`✅ Cancelled age-based auto-deletion timer for room ${roomId}`);
  };
}

/**
 * Setup all auto-deletion mechanisms for a room
 * @param {string} collectionName - The Firestore collection name
 * @param {string} roomId - The room document ID
 * @param {Object} options - Configuration options
 * @param {number} options.gracePeriodMs - Grace period for game end (default: 5 minutes)
 * @param {number|string} options.createdAt - Room creation timestamp
 * @returns {Object} - Cleanup functions { cancelGameEnd, cancelEmptyRoom, cancelAge }
 */
export function setupAllAutoDeletions(collectionName, roomId, options = {}) {
  const { gracePeriodMs = 5 * 60 * 1000, createdAt } = options;
  
  const cleanup = {
    cancelGameEnd: () => {},
    cancelEmptyRoom: () => {},
    cancelAge: () => {},
  };

  // Setup empty room deletion (always active)
  cleanup.cancelEmptyRoom = setupEmptyRoomAutoDeletion(collectionName, roomId);
  
  // Setup age-based deletion if createdAt is provided
  if (createdAt) {
    cleanup.cancelAge = setupRoomAgeAutoDeletion(collectionName, roomId, createdAt);
  }

  return cleanup;
}

/**
 * Setup game end auto-deletion (call this when game status becomes 'finished')
 * @param {string} collectionName - The Firestore collection name
 * @param {string} roomId - The room document ID
 * @param {number} gracePeriodMs - Grace period in milliseconds (default: 5 minutes)
 * @returns {Function} - Cleanup function to cancel the timer
 */
export function setupGameEndDeletion(collectionName, roomId, gracePeriodMs = 5 * 60 * 1000) {
  return setupGameEndAutoDeletion(collectionName, roomId, gracePeriodMs);
}

