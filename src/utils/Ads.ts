/**
 * Ads Abstraction Layer - Platform-agnostic entry point
 * 
 * Metro bundler will automatically resolve platform-specific files:
 * - On iOS/Android: resolves to Ads.native.tsx
 * - On Web: resolves to Ads.web.tsx
 * 
 * This file conditionally imports based on platform to ensure web builds work correctly.
 */

import { Platform } from 'react-native';

// Conditionally import based on platform
// TypeScript needs both imports, but Metro will only bundle the correct one
// @ts-ignore - Metro bundler will only bundle the correct platform file during build
import * as nativeAds from './Ads.native';
// @ts-ignore - Metro bundler will only bundle the correct platform file during build
import * as webAds from './Ads.web';

// Export based on platform
// Metro bundler will tree-shake the unused import during build
export const areAdsEnabled = Platform.OS === 'web' ? webAds.areAdsEnabled : nativeAds.areAdsEnabled;
export const showInterstitialIfAvailable = Platform.OS === 'web' ? webAds.showInterstitialIfAvailable : nativeAds.showInterstitialIfAvailable;
export default Platform.OS === 'web' ? webAds.default : nativeAds.default;

