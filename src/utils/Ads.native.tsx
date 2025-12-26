import Constants from 'expo-constants';
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { AdEventType, BannerAdSize, InterstitialAd, BannerAd as RNBannerAd } from 'react-native-google-mobile-ads';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BANNER_AD_UNIT_ID, INTERSTITIAL_AD_UNIT_ID } from '../../constants/adsConfig';

/**
 * Ads Abstraction Layer - Native (iOS/Android)
 * 
 * This module provides ads interface for native platforms only.
 * Web version is in Ads.web.tsx
 */

/**
 * Determines if ads should be enabled based on platform and environment
 */
export function areAdsEnabled(): boolean {
  // Disable in Expo Go (storeClient execution environment)
  if (Constants.executionEnvironment === 'storeClient') {
    return false;
  }

  // Enable on native iOS/Android (standalone builds)
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

/**
 * Banner Ad Component
 * 
 * Renders a banner ad at the bottom of the screen with safe area support.
 * Returns null silently when ads are disabled (Expo Go, or config disabled).
 */
export default function BannerAd() {
  const insets = useSafeAreaInsets();
  const adsEnabled = areAdsEnabled();

  // Silently return null if ads are disabled
  if (!adsEnabled || !BANNER_AD_UNIT_ID) {
    return null;
  }

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <RNBannerAd
        unitId={BANNER_AD_UNIT_ID}
        size={BannerAdSize.BANNER}
        requestOptions={{
          requestNonPersonalizedAdsOnly: false,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingTop: 8,
  },
});

/**
 * Singleton interstitial ad instance
 * This must persist across calls to enable proper AdMob frequency capping
 */
let adInstance: InterstitialAd | null = null;

/**
 * Tracks if an ad is currently being loaded
 * Prevents multiple simultaneous load attempts
 */
let isLoading = false;

/**
 * Preloads an interstitial ad in the background
 * 
 * This function:
 * - Only starts loading if an ad is not already loaded and not currently loading
 * - Adds listeners to handle success or failure of the load
 * - Ensures removeAllListeners() is called after the load attempt finishes
 * - Uses the persistent singleton adInstance for AdMob frequency capping
 * - Silently skips on Expo Go or if ads are disabled
 */
export function preloadInterstitial(): void {
  // Check if ads are enabled
  if (!areAdsEnabled() || !INTERSTITIAL_AD_UNIT_ID) {
    return;
  }

  // Only load if not already loaded and not currently loading
  if (isLoading || (adInstance?.loaded === true)) {
    return;
  }

  try {
    // Create ad instance only if it doesn't exist (singleton pattern)
    // This ensures AdMob frequency capping works correctly
    if (!adInstance) {
      adInstance = InterstitialAd.createForAdRequest(INTERSTITIAL_AD_UNIT_ID, {
        requestNonPersonalizedAdsOnly: false,
      });
    }

    // Remove all existing listeners before attaching new ones
    try {
      adInstance.removeAllListeners();
    } catch (error) {
      // Ignore errors silently
    }

    // Mark as loading
    isLoading = true;

    // Listen for ad loaded event
    const loadedListener = adInstance.addAdEventListener(AdEventType.LOADED, () => {
      isLoading = false;
      // Clean up listeners after load completes
      try {
        if (adInstance) {
          adInstance.removeAllListeners();
        }
      } catch (error) {
        // Ignore errors during cleanup
      }
    });

    // Listen for ad errors (including frequency capping)
    const errorListener = adInstance.addAdEventListener(AdEventType.ERROR, () => {
      isLoading = false;
      // Clean up listeners after load attempt finishes (success or failure)
      try {
        if (adInstance) {
          adInstance.removeAllListeners();
        }
      } catch (error) {
        // Ignore errors during cleanup
      }
    });

    // Start loading the ad
    // AdMob will decide if an ad is available based on frequency capping
    // load() is synchronous and triggers events (LOADED or ERROR)
    adInstance.load();
  } catch (error) {
    // On any error, mark as not loading
    isLoading = false;
    // Silently fail - AdMob frequency capping will handle availability
  }
}

/**
 * Shows an interstitial ad if available
 * 
 * This function:
 * - Checks if ad is already loaded (adInstance?.loaded)
 * - If loaded: Shows the ad immediately, uses CLOSED/ERROR events to call onDone() and preload next
 * - If NOT loaded: Immediately calls onDone() and triggers preloadInterstitial()
 * - NEVER waits for a load to happen - user proceeds instantly if ad not ready
 * - Uses AdMob frequency capping only (no manual timers or cooldowns)
 * - Uses a persistent singleton ad instance for proper frequency capping
 * - Silently skips on Expo Go
 * 
 * UX Goal: User should NEVER wait for a "Loading..." state. Either the ad is ready
 * to show instantly, or the game proceeds immediately.
 * 
 * @param onDone - Callback to execute when ad is closed, fails, or if ad is not available
 */
export async function showInterstitialIfAvailable(onDone: () => void): Promise<void> {
  // Check if ads are enabled
  if (!areAdsEnabled() || !INTERSTITIAL_AD_UNIT_ID) {
    // Silently skip and call callback immediately
    onDone();
    // Preload for next time
    preloadInterstitial();
    return;
  }

  // Guard to ensure onDone() is called exactly once
  let finished = false;
  let closedListener: any = null;
  let errorListener: any = null;

  const cleanup = () => {
    // Remove all listeners from the singleton instance to prevent memory leaks
    try {
      if (adInstance) {
        adInstance.removeAllListeners();
      }
    } catch (error) {
      // Ignore errors during cleanup - fail silently
    }
    
    // Clear listener references
    closedListener = null;
    errorListener = null;
  };

  const finish = () => {
    // Strong guard: ensure onDone() is called exactly once
    if (finished) {
      return;
    }
    finished = true;
    
    // Cleanup first, then call callback
    cleanup();
    
    // Call onDone() - this triggers navigation
    try {
      onDone();
    } catch (error) {
      console.error('❌ Error in onDone callback:', error);
    }
    
    // Preload next ad after current interaction completes
    preloadInterstitial();
  };

  try {
    // Create ad instance only if it doesn't exist (singleton pattern)
    // This ensures AdMob frequency capping works correctly
    if (!adInstance) {
      adInstance = InterstitialAd.createForAdRequest(INTERSTITIAL_AD_UNIT_ID, {
        requestNonPersonalizedAdsOnly: false,
      });
    }

    // Remove all existing listeners before attaching new ones
    try {
      adInstance.removeAllListeners();
    } catch (error) {
      // Ignore errors silently - fail gracefully
    }

    // CRITICAL: Check if ad is already loaded
    // If loaded, show immediately. If not, proceed immediately without waiting.
    if (adInstance.loaded === true) {
      // Ad is ready - show it immediately
      try {
        // Set up listeners for when ad closes or errors
        closedListener = adInstance.addAdEventListener(AdEventType.CLOSED, () => {
          if (!finished) {
            finish();
          }
        });

        errorListener = adInstance.addAdEventListener(AdEventType.ERROR, () => {
          if (!finished) {
            finish();
          }
        });

        // Show the ad
        adInstance.show();
        
        // Log analytics event for ad impression
        import('../utils/analytics').then(({ logAdImpression }) => {
          logAdImpression('interstitial');
        }).catch(() => {
          // Ignore analytics errors
        });
      } catch (error) {
        // If show() fails, continue navigation silently
        if (!finished) {
          finish();
        }
      }
    } else {
      // Ad is NOT loaded - proceed immediately without waiting
      // This ensures user never waits for a loading state
      finish();
    }
  } catch (error) {
    // On any error, continue navigation immediately and silently
    if (!finished) {
      finish();
    }
  }
}

