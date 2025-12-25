/**
 * Ads Abstraction Layer - Platform-agnostic entry point
 * 
 * This file conditionally imports from platform-specific implementations:
 * - Ads.native.tsx on iOS/Android
 * - Ads.web.tsx on Web
 * 
 * Uses require() to prevent web builds from trying to bundle native ad libraries.
 */

import { Platform } from 'react-native';

// Use require() to conditionally import based on platform
// This prevents web builds from trying to import react-native-google-mobile-ads
let adsModule: any;

if (Platform.OS === 'web') {
  // Web platform - use web stubs (no ads)
  adsModule = require('./Ads.web');
} else {
  // Native platforms (iOS/Android) - use native implementation
  adsModule = require('./Ads.native');
}

// Re-export the functions
export const areAdsEnabled: () => boolean = adsModule.areAdsEnabled;
export const showInterstitialIfAvailable: (onDone: () => void) => Promise<void> = adsModule.showInterstitialIfAvailable;
export default adsModule.default;

