import React from 'react';
import { I18nManager, Platform } from 'react-native';
import { reloadAppAsync } from 'expo';

/**
 * Enable real right-to-left layout (the app is Hebrew).
 *
 * Native: I18nManager.forceRTL is persisted by the OS but only applies to a
 * fresh JS instance, so on the very first launch we reload once.
 * Web: set dir/lang on <html> (flex rows, text, inputs follow it) - see also
 * <RTLRoot> below for styles.
 *
 * Call before the root component renders.
 */
export function setupRTL() {
  if (Platform.OS === 'web') {
    if (typeof document !== 'undefined') {
      document.documentElement.dir = 'rtl';
      document.documentElement.lang = 'he';
    }
    return;
  }

  I18nManager.allowRTL(true);
  if (!I18nManager.isRTL) {
    I18nManager.forceRTL(true);
    reloadAppAsync('Enable RTL layout').catch((error) => {
      // If reload isn't available, RTL takes effect on the next app start
      console.warn('⚠️ Could not reload to apply RTL:', error?.message || error);
    });
  }
}

/**
 * Web only: react-native-web resolves start/end (and swaps left/right, like
 * native RN does in RTL) in StyleSheet styles from its own locale context,
 * which defaults to LTR regardless of <html dir>. Its provider is internal,
 * so it's loaded defensively; if a future version moves it, we fall back to
 * rendering children unchanged.
 */
let WebLocaleProvider = null;
if (Platform.OS === 'web') {
  try {
    WebLocaleProvider = require('react-native-web/dist/modules/useLocale').LocaleProvider;
  } catch {
    console.warn('⚠️ react-native-web LocaleProvider not found; RTL styles on web may be off');
  }
}

export function RTLRoot({ children }) {
  if (WebLocaleProvider) {
    return (
      <WebLocaleProvider direction="rtl" locale="he">
        {children}
      </WebLocaleProvider>
    );
  }
  return children;
}
