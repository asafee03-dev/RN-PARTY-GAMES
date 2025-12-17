import { Platform } from 'react-native';

/**
 * Centralized Ads Configuration
 * 
 * This file controls all ad behavior across the app.
 * All Ad Unit IDs should be defined here and imported where needed.
 * 
 * Note: This file does NOT import react-native-google-mobile-ads directly.
 * All ad library imports are handled dynamically in src/utils/Ads.tsx
 */

// Flag to switch between test ads and production ads
// Set to true only when ready to use production ad units
// Keep false during development and testing
export const USE_PRODUCTION_ADS = true;

// Test Ad Unit IDs (from AdMob documentation)
// These are used when USE_PRODUCTION_ADS is false or in __DEV__ mode
const TEST_BANNER_ID = 'ca-app-pub-3940256099942544/6300978111';
const TEST_INTERSTITIAL_ID = 'ca-app-pub-3940256099942544/1033173712';

// Production Ad Unit IDs
// Android IDs
const ANDROID_BANNER_PROD_ID = 'ca-app-pub-2071998287051065/5723056731';
const ANDROID_INTERSTITIAL_PROD_ID = 'ca-app-pub-2071998287051065/5116552075';

// iOS IDs
const IOS_BANNER_PROD_ID = 'ca-app-pub-2071998287051065/6238062053';
const IOS_INTERSTITIAL_PROD_ID = 'ca-app-pub-2071998287051065/7464332052';

/**
 * Banner Ad Unit ID
 * Uses test IDs in development, production IDs when USE_PRODUCTION_ADS is true
 * Returns null on Web (ads are disabled there)
 */
export const BANNER_AD_UNIT_ID = Platform.select({
  android: __DEV__ || !USE_PRODUCTION_ADS 
    ? TEST_BANNER_ID 
    : ANDROID_BANNER_PROD_ID,
  ios: __DEV__ || !USE_PRODUCTION_ADS 
    ? TEST_BANNER_ID 
    : IOS_BANNER_PROD_ID,
  default: null, // Web or other platforms - ads disabled
});

/**
 * Interstitial Ad Unit ID
 * Uses test IDs in development, production IDs when USE_PRODUCTION_ADS is true
 * Returns null on Web (ads are disabled there)
 */
export const INTERSTITIAL_AD_UNIT_ID = Platform.select({
  android: __DEV__ || !USE_PRODUCTION_ADS 
    ? TEST_INTERSTITIAL_ID 
    : ANDROID_INTERSTITIAL_PROD_ID,
  ios: __DEV__ || !USE_PRODUCTION_ADS 
    ? TEST_INTERSTITIAL_ID 
    : IOS_INTERSTITIAL_PROD_ID,
  default: null, // Web or other platforms - ads disabled
});

