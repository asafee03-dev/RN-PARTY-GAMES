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
 * Timeout in milliseconds for ad loading/display
 * If ad doesn't load or show within this time, continue navigation
 */
const AD_TIMEOUT_MS = 3000;

/**
 * Singleton interstitial ad instance
 * This must persist across calls to enable proper AdMob frequency capping
 */
let adInstance: InterstitialAd | null = null;

/**
 * Shows an interstitial ad if available
 * 
 * This function:
 * - Attempts to load and show an interstitial ad ONCE per call
 * - Has a timeout fallback to prevent blocking navigation
 * - Always calls onDone() callback exactly once when finished
 * - Uses AdMob frequency capping only (no custom logic)
 * - Uses a persistent singleton ad instance for proper frequency capping (20-minute limit)
 * - Ensures all listeners and timers are cleaned up reliably
 * - Handles errors silently - if ad fails to load or is frequency-capped, user proceeds immediately
 * - Silently skips on Expo Go
 * 
 * @param onDone - Callback to execute when ad is closed, fails, or times out
 */
export async function showInterstitialIfAvailable(onDone: () => void): Promise<void> {
  // Check if ads are enabled
  if (!areAdsEnabled() || !INTERSTITIAL_AD_UNIT_ID) {
    // Silently skip and call callback immediately
    onDone();
    return;
  }

  // Guard to ensure onDone() is called exactly once
  let finished = false;
  let timeoutId: NodeJS.Timeout | null = null;
  let loadedListener: any = null;
  let closedListener: any = null;
  let errorListener: any = null;

  const cleanup = () => {
    // Clear timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    
    // Remove all listeners from the singleton instance to prevent memory leaks
    try {
      if (adInstance) {
        adInstance.removeAllListeners();
      }
    } catch (error) {
      // Ignore errors during cleanup - fail silently
    }
    
    // Clear listener references
    loadedListener = null;
    closedListener = null;
    errorListener = null;
    
    // Note: adInstance is NOT cleared here - it's a persistent singleton
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
  };

  try {
    // Create ad instance only if it doesn't exist (singleton pattern)
    // This ensures AdMob frequency capping works correctly
    if (!adInstance) {
      adInstance = InterstitialAd.createForAdRequest(INTERSTITIAL_AD_UNIT_ID, {
        requestNonPersonalizedAdsOnly: false,
      });
    }

    // Remove all existing listeners before attaching new ones to avoid duplicates
    // This is done in cleanup, but we do it here too to ensure clean state
    try {
      adInstance.removeAllListeners();
    } catch (error) {
      // Ignore errors silently - fail gracefully
    }

    // Set up timeout - if ad doesn't show within timeout, continue navigation
    timeoutId = setTimeout(() => {
      if (!finished) {
        finish();
      }
    }, AD_TIMEOUT_MS);

    // Listen for ad loaded event
    loadedListener = adInstance.addAdEventListener(AdEventType.LOADED, () => {
      // Check if we've already finished (race condition protection)
      if (finished) {
        return;
      }
      
      // Cancel timeout since ad loaded successfully
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      
      // Show the ad immediately when loaded
      try {
        // Double-check we haven't finished before showing
        if (!finished && adInstance) {
          adInstance.show();
          
          // Log analytics event for ad impression
          import('../utils/analytics').then(({ logAdImpression }) => {
            logAdImpression('interstitial');
          });
        }
      } catch (error) {
        // If show() fails, continue navigation silently
        if (!finished) {
          finish();
        }
      }
    });

    // Listen for ad closed event
    closedListener = adInstance.addAdEventListener(AdEventType.CLOSED, () => {
      if (!finished) {
        finish();
      }
    });

    // Listen for ad errors (including frequency capping)
    // On error or frequency cap, immediately continue navigation silently
    errorListener = adInstance.addAdEventListener(AdEventType.ERROR, () => {
      if (!finished) {
        finish();
      }
    });

    // Load the ad - this is a one-time attempt
    // AdMob will decide if an ad is available based on frequency capping
    await adInstance.load();
  } catch (error) {
    // On any error (including load failures), continue navigation immediately and silently
    if (!finished) {
      finish();
    }
  }
}

