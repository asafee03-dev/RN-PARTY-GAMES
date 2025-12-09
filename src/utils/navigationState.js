import storage from './storage';

const NAVIGATION_STATE_KEY = 'navigationState';
const CURRENT_ROOM_KEY = 'currentRoom';

/**
 * Save navigation state to persistent storage
 */
export async function saveNavigationState(state) {
  try {
    if (state) {
      const stateJson = JSON.stringify(state);
      await storage.setItem(NAVIGATION_STATE_KEY, stateJson);
    }
  } catch (error) {
    console.warn('⚠️ Error saving navigation state:', error);
  }
}

/**
 * Load navigation state from persistent storage
 */
export async function loadNavigationState() {
  try {
    const stateJson = await storage.getItem(NAVIGATION_STATE_KEY);
    if (stateJson) {
      return JSON.parse(stateJson);
    }
  } catch (error) {
    console.warn('⚠️ Error loading navigation state:', error);
  }
  return null;
}

/**
 * Clear navigation state
 */
export async function clearNavigationState() {
  try {
    await storage.removeItem(NAVIGATION_STATE_KEY);
    await storage.removeItem(CURRENT_ROOM_KEY);
  } catch (error) {
    console.warn('⚠️ Error clearing navigation state:', error);
  }
}

/**
 * Save current room info for reconnection
 */
export async function saveCurrentRoom(gameType, roomCode, params = {}) {
  try {
    const roomInfo = {
      gameType,
      roomCode,
      params,
      timestamp: Date.now()
    };
    await storage.setItem(CURRENT_ROOM_KEY, JSON.stringify(roomInfo));
  } catch (error) {
    console.warn('⚠️ Error saving current room:', error);
  }
}

/**
 * Load current room info for reconnection
 */
export async function loadCurrentRoom() {
  try {
    const roomJson = await storage.getItem(CURRENT_ROOM_KEY);
    if (roomJson) {
      const roomInfo = JSON.parse(roomJson);
      // Check if room info is not too old (24 hours)
      const maxAge = 24 * 60 * 60 * 1000;
      if (Date.now() - roomInfo.timestamp < maxAge) {
        return roomInfo;
      } else {
        // Clear stale room info
        await clearNavigationState();
      }
    }
  } catch (error) {
    console.warn('⚠️ Error loading current room:', error);
  }
  return null;
}

/**
 * Clear current room info
 */
export async function clearCurrentRoom() {
  try {
    await storage.removeItem(CURRENT_ROOM_KEY);
  } catch (error) {
    console.warn('⚠️ Error clearing current room:', error);
  }
}

