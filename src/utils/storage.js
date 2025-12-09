import { Platform } from 'react-native';

// In-memory fallback storage
const memoryStorage = {};

// Platform-specific storage implementation
let storageImpl = null;

if (Platform.OS === 'web') {
  // Use localStorage on web
  storageImpl = {
    async getItem(key) {
      try {
        if (typeof localStorage !== 'undefined') {
          return localStorage.getItem(key);
        }
        return memoryStorage[key] || null;
      } catch (error) {
        console.warn(`⚠️ Error reading from localStorage (${key}):`, error);
        return memoryStorage[key] || null;
      }
    },
    async setItem(key, value) {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(key, value);
        }
        memoryStorage[key] = value; // Also store in memory as backup
      } catch (error) {
        console.warn(`⚠️ Error writing to localStorage (${key}):`, error);
        memoryStorage[key] = value; // Fallback to memory
      }
    },
    async removeItem(key) {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(key);
        }
        delete memoryStorage[key];
      } catch (error) {
        console.warn(`⚠️ Error removing from localStorage (${key}):`, error);
        delete memoryStorage[key];
      }
    }
  };
} else {
  // Use AsyncStorage on native platforms (iOS, Android)
  // Dynamically import to avoid module resolution errors on web
  let AsyncStorage = null;
  try {
    AsyncStorage = require('@react-native-async-storage/async-storage').default;
  } catch (error) {
    console.warn('⚠️ AsyncStorage module not found, using in-memory storage:', error.message);
  }

  if (AsyncStorage) {
    storageImpl = {
      async getItem(key) {
        try {
          return await AsyncStorage.getItem(key);
        } catch (error) {
          console.warn(`⚠️ Error reading from AsyncStorage (${key}):`, error);
          return memoryStorage[key] || null;
        }
      },
      async setItem(key, value) {
        try {
          await AsyncStorage.setItem(key, value);
          memoryStorage[key] = value; // Also store in memory as backup
        } catch (error) {
          console.warn(`⚠️ Error writing to AsyncStorage (${key}):`, error);
          memoryStorage[key] = value; // Fallback to memory
        }
      },
      async removeItem(key) {
        try {
          await AsyncStorage.removeItem(key);
          delete memoryStorage[key];
        } catch (error) {
          console.warn(`⚠️ Error removing from AsyncStorage (${key}):`, error);
          delete memoryStorage[key];
        }
      }
    };
  } else {
    // Fallback to in-memory storage if AsyncStorage is not available
    storageImpl = {
      async getItem(key) {
        return memoryStorage[key] || null;
      },
      async setItem(key, value) {
        memoryStorage[key] = value;
      },
      async removeItem(key) {
        delete memoryStorage[key];
      }
    };
  }
}

// Shared storage utility for the entire app
const storage = {
  async getItem(key) {
    return await storageImpl.getItem(key);
  },
  async setItem(key, value) {
    await storageImpl.setItem(key, value);
  },
  async removeItem(key) {
    await storageImpl.removeItem(key);
  }
};

export default storage;
