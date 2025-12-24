/**
 * Interstitial Ad Utility (Re-export from abstraction layer)
 * 
 * This file maintains backward compatibility with existing imports.
 * All ad logic is in src/utils/Ads.native.tsx (iOS/Android) or Ads.web.tsx (Web)
 * 
 * @deprecated Import directly from './Ads.native' or './Ads.web' instead
 */
export { showInterstitialIfAvailable } from './Ads.native';
