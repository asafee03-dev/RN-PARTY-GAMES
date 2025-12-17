/**
 * Ads Abstraction Layer - Web
 * 
 * This module provides null stubs for Web platform.
 * Native version is in Ads.native.tsx
 */

/**
 * Determines if ads should be enabled based on platform and environment
 * Always returns false on Web
 */
export function areAdsEnabled(): boolean {
  return false;
}

/**
 * Banner Ad Component
 * 
 * Returns null on Web (ads not supported)
 */
export default function BannerAd() {
  return null;
}

/**
 * Shows an interstitial ad if available
 * 
 * On Web, this immediately calls the callback without showing any ads.
 * 
 * @param onDone - Callback to execute immediately
 */
export async function showInterstitialIfAvailable(onDone: () => void): Promise<void> {
  // Silently skip and call callback immediately on Web
  onDone();
}

