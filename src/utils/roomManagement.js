import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';

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
 * Count active players in a room (works for all game types)
 * @param {Object} roomData - Room data from Firestore
 * @returns {number} - Number of active players
 */
function countActivePlayers(roomData) {
  let activePlayerCount = 0;
  
  // For games with players array (Spy, Draw, Frequency)
  if (roomData.players && Array.isArray(roomData.players)) {
    activePlayerCount = roomData.players.filter(p => {
      if (!p || !p.name) return false;
      // Only count players where active !== false (includes active: true and active: null/undefined)
      return p.active !== false;
    }).length;
  } 
  // For games with teams array (Alias)
  else if (roomData.teams && Array.isArray(roomData.teams)) {
    activePlayerCount = roomData.teams.reduce((count, team) => {
      if (!team.players || !Array.isArray(team.players)) {
        return count;
      }
      // Handle both string players and object players
      const teamPlayerCount = team.players.filter(p => {
        if (!p) return false;
        // If player is a string, count it (Alias uses string players)
        if (typeof p === 'string' && p.trim().length > 0) {
          return true;
        }
        // If player is an object with a name, check if active
        if (typeof p === 'object' && p.name) {
          return p.active !== false;
        }
        return false;
      }).length;
      return count + teamPlayerCount;
    }, 0);
    
    // Also count the host as a player if not already in a team
    if (roomData.host_name && typeof roomData.host_name === 'string' && roomData.host_name.trim().length > 0) {
      const hostInTeam = roomData.teams.some(team => 
        team.players && Array.isArray(team.players) && 
        team.players.some(p => {
          if (typeof p === 'string') return p === roomData.host_name;
          if (typeof p === 'object' && p.name) return p.name === roomData.host_name;
          return false;
        })
      );
      if (!hostInTeam) {
        activePlayerCount += 1;
      }
    }
  } 
  // For Codenames (red_team/blue_team structure)
  else if (roomData.red_team || roomData.blue_team) {
    const redGuessers = roomData.red_team?.guessers?.filter(g => g && g.trim().length > 0).length || 0;
    const blueGuessers = roomData.blue_team?.guessers?.filter(g => g && g.trim().length > 0).length || 0;
    const redSpymaster = (roomData.red_team?.spymaster && roomData.red_team.spymaster.trim().length > 0) ? 1 : 0;
    const blueSpymaster = (roomData.blue_team?.spymaster && roomData.blue_team.spymaster.trim().length > 0) ? 1 : 0;
    activePlayerCount = redGuessers + blueGuessers + redSpymaster + blueSpymaster;
  }
  
  return activePlayerCount;
}

/**
 * Setup listener to delete room when all players leave
 * Deletes room immediately when last active player leaves, regardless of game status
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
  
  // Use a debounce to prevent race conditions when multiple players leave simultaneously
  let deletionTimeout = null;
  
  const unsubscribe = onSnapshot(roomRef, async (snapshot) => {
    if (!snapshot.exists()) {
      // Room already deleted
      if (deletionTimeout) {
        clearTimeout(deletionTimeout);
        deletionTimeout = null;
      }
      return;
    }

    const roomData = snapshot.data();
    
    // Count only active players (active !== false)
    const activePlayerCount = countActivePlayers(roomData);

    // Delete room when no active players remain
    // Use a small delay to handle race conditions when multiple players leave at once
    if (activePlayerCount === 0) {
      // Clear any existing timeout
      if (deletionTimeout) {
        clearTimeout(deletionTimeout);
      }
      
      // Set a short delay before deletion to handle race conditions
      deletionTimeout = setTimeout(async () => {
        try {
          // Double-check room still exists and is still empty
          const verifySnapshot = await getDoc(roomRef);
          if (verifySnapshot.exists()) {
            const verifyData = verifySnapshot.data();
            const verifyActiveCount = countActivePlayers(verifyData);
            
            if (verifyActiveCount === 0) {
              console.log(`🗑️ Auto-deleting room ${roomId} - all active players have left`);
              // Set deletion signal to allow rules-based deletion even with residual player data
              try {
                await updateDoc(roomRef, { marked_for_deletion: true });
                console.log(`✅ Set deletion signal for room ${roomId}`);
              } catch (signalError) {
                console.warn(`⚠️ Could not set deletion signal for room ${roomId}:`, signalError);
                // Continue with deletion attempt even if signal fails
              }
              await deleteRoom(collectionName, roomId);
              unsubscribe(); // Stop listening after deletion
            } else {
              console.log(`ℹ️ Room ${roomId} has active players again, skipping deletion`);
            }
          }
        } catch (error) {
          console.error(`❌ Error in empty room deletion check:`, error);
        } finally {
          deletionTimeout = null;
        }
      }, 2000); // 2 second delay to handle race conditions
    } else {
      // Room has active players, clear any pending deletion
      if (deletionTimeout) {
        clearTimeout(deletionTimeout);
        deletionTimeout = null;
      }
    }
  }, (error) => {
    console.error(`❌ Error in empty room listener:`, error);
    if (deletionTimeout) {
      clearTimeout(deletionTimeout);
      deletionTimeout = null;
    }
  });

  // Return cleanup function that also clears the timeout
  return () => {
    if (deletionTimeout) {
      clearTimeout(deletionTimeout);
      deletionTimeout = null;
    }
    unsubscribe();
  };
}

/**
 * Setup timer to delete room after 3 hours
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
  const threeHours = 3 * 60 * 60 * 1000; // 3 hours in milliseconds
  
  // If room is already older than 3 hours, delete immediately
  if (age >= threeHours) {
    console.log(`🗑️ Room ${roomId} is already older than 3 hours, deleting immediately`);
    deleteRoom(collectionName, roomId);
    return () => {};
  }

  // Otherwise, set timer for remaining time
  const remainingTime = threeHours - age;
  const remainingMinutes = Math.round(remainingTime / 1000 / 60);
  console.log(`⏰ Setting up age-based auto-deletion for room ${roomId} in ${collectionName} (${remainingMinutes} minutes remaining, ~${Math.round(remainingMinutes / 60)} hours)`);
  
  const timeoutId = setTimeout(async () => {
    // Double-check room still exists before deleting
    try {
      const roomRef = doc(db, collectionName, roomId);
      const snapshot = await getDoc(roomRef);
      
      if (snapshot.exists()) {
        console.log(`🗑️ Auto-deleting room ${roomId} - room is older than 3 hours`);
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

