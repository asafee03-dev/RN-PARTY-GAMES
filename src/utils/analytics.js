/**
 * Analytics Utility
 * Lightweight Firebase Analytics (GA4) integration
 * 
 * Events tracked:
 * - app_open: When app initializes
 * - create_room: When a game room is created
 * - join_room: When a player joins a room
 * - game_start: When a game starts
 * - ad_impression: When an ad is shown
 */

import { Platform } from 'react-native';
import { getAnalytics, logEvent, isSupported } from 'firebase/analytics';
import { app } from '../firebase';

let analyticsInstance = null;
let analyticsInitialized = false;
let analyticsInitPromise = null;

/**
 * Initialize Analytics (lazy initialization)
 * Only initializes once, safe to call multiple times
 */
const initializeAnalytics = async () => {
  if (analyticsInitialized) {
    return analyticsInstance;
  }

  // If initialization is in progress, return the same promise
  if (analyticsInitPromise) {
    return analyticsInitPromise;
  }

  analyticsInitPromise = (async () => {
    try {
      // Check if Analytics is supported on this platform
      const supported = await isSupported();
      if (!supported) {
        analyticsInitialized = true;
        return null;
      }

      // Initialize Analytics
      analyticsInstance = getAnalytics(app);
      analyticsInitialized = true;
      return analyticsInstance;
    } catch (error) {
      // Silently fail - don't break app if analytics fails
      analyticsInitialized = true;
      return null;
    }
  })();

  return analyticsInitPromise;
};

/**
 * Log an analytics event
 * @param {string} eventName - Name of the event
 * @param {Object} params - Event parameters
 */
export const logAnalyticsEvent = async (eventName, params = {}) => {
  try {
    // Initialize if needed
    if (!analyticsInitialized) {
      await initializeAnalytics();
    }

    if (!analyticsInstance) {
      // Analytics not available, silently skip
      return;
    }

    // Log the event
    logEvent(analyticsInstance, eventName, params);
  } catch (error) {
    // Silently fail - don't break app if analytics fails
  }
};

/**
 * Log app_open event
 * Should be called once when app initializes
 */
export const logAppOpen = async () => {
  await logAnalyticsEvent('app_open');
};

/**
 * Log create_room event
 * @param {string} game - Game type (draw, spy, alias, codenames, frequency)
 * @param {string} roomId - Room code/ID
 */
export const logCreateRoom = async (game, roomId) => {
  await logAnalyticsEvent('create_room', {
    game: game.toLowerCase(),
    room_id: roomId?.toUpperCase() || ''
  });
};

/**
 * Log join_room event
 * @param {string} game - Game type (draw, spy, alias, codenames, frequency)
 * @param {string} roomId - Room code/ID
 */
export const logJoinRoom = async (game, roomId) => {
  await logAnalyticsEvent('join_room', {
    game: game.toLowerCase(),
    room_id: roomId?.toUpperCase() || ''
  });
};

/**
 * Log game_start event
 * @param {string} game - Game type (draw, spy, alias, codenames, frequency)
 * @param {string} roomId - Room code/ID
 */
export const logGameStart = async (game, roomId) => {
  await logAnalyticsEvent('game_start', {
    game: game.toLowerCase(),
    room_id: roomId?.toUpperCase() || ''
  });
};

/**
 * Log ad_impression event
 * @param {string} adType - Type of ad (interstitial, banner)
 */
export const logAdImpression = async (adType = 'interstitial') => {
  await logAnalyticsEvent('ad_impression', {
    ad_type: adType
  });
};

