import { Platform } from 'react-native';
import { TestIds } from 'react-native-google-mobile-ads';

/**
 * Centralized Ads Configuration
 * 
 * This file controls all ad behavior across the app.
 * All Ad Unit IDs should be defined here and imported where needed.
 */

// Global flag to enable/disable all ads from one place
export const ADS_ENABLED = true;

// Flag to switch between test ads and production ads
// Set to true only when ready to use production ad units
// Keep false during development and testing
const USE_PRODUCTION_ADS = true;

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
 */
export const BANNER_AD_UNIT_ID = Platform.select({
  android: __DEV__ || !USE_PRODUCTION_ADS 
    ? TestIds.BANNER 
    : ANDROID_BANNER_PROD_ID,
  ios: __DEV__ || !USE_PRODUCTION_ADS 
    ? TestIds.BANNER 
    : IOS_BANNER_PROD_ID,
  default: TestIds.BANNER,
});

/**
 * Interstitial Ad Unit ID
 * Uses test IDs in development, production IDs when USE_PRODUCTION_ADS is true
 */
export const INTERSTITIAL_AD_UNIT_ID = Platform.select({
  android: __DEV__ || !USE_PRODUCTION_ADS 
    ? TestIds.INTERSTITIAL 
    : ANDROID_INTERSTITIAL_PROD_ID,
  ios: __DEV__ || !USE_PRODUCTION_ADS 
    ? TestIds.INTERSTITIAL 
    : IOS_INTERSTITIAL_PROD_ID,
  default: TestIds.INTERSTITIAL,
});

