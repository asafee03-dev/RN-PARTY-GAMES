/**
 * Interstitial Ad Utility (Re-export from abstraction layer)
 * 
 * This file maintains backward compatibility with existing imports.
 * Automatically uses the correct platform-specific implementation:
 * - Native (iOS/Android): Ads.native.tsx
 * - Web: Ads.web.tsx (no-op stub)
 * 
 * Metro bundler will automatically resolve to the correct platform file.
 */
export { showInterstitialIfAvailable } from './Ads';
