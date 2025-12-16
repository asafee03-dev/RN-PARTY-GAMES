import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { ADS_ENABLED, BANNER_AD_UNIT_ID } from '../../../constants/adsConfig';

/**
 * Reusable Banner Ad Component
 * 
 * Displays a banner ad at the bottom of the screen with safe area support.
 * Only renders if ADS_ENABLED is true.
 * Uses the centralized ad unit ID from adsConfig.ts
 */
export default function BannerAdComponent() {
  const insets = useSafeAreaInsets();

  // Don't render if ads are disabled
  if (!ADS_ENABLED || !BANNER_AD_UNIT_ID) {
    return null;
  }

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <BannerAd
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

