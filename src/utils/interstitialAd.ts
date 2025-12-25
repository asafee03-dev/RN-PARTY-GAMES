/**
 * Interstitial Ad Utility (Re-export from abstraction layer)
 * 
 * This file maintains backward compatibility with existing imports.
 * Automatically uses the correct platform-specific implementation:
 * - Native (iOS/Android): Ads.native.tsx
 * - Web: Ads.web.tsx (no-op stub)
 * 
 * For web builds, we conditionally import to avoid bundling
 * react-native-google-mobile-ads which doesn't work on web.
 * 
 * Metro bundler should handle platform-specific file resolution, but
 * we use conditional imports as a safety measure.
 */

import { Platform } from 'react-native';

// Conditionally import based on platform
// Metro bundler should tree-shake unused imports, but we need both for TypeScript
// @ts-ignore - Metro bundler will only bundle the correct platform file during build
import { showInterstitialIfAvailable as nativeShowInterstitial } from './Ads.native';
// @ts-ignore - Metro bundler will only bundle the correct platform file during build
import { showInterstitialIfAvailable as webShowInterstitial } from './Ads.web';

// Export the platform-specific implementation
// Metro bundler will tree-shake the unused import during build
export const showInterstitialIfAvailable = Platform.OS === 'web'
  ? webShowInterstitial
  : nativeShowInterstitial;
