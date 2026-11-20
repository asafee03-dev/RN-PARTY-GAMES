import { I18nManager, Platform } from 'react-native';

/**
 * Layout direction helpers.
 *
 * Native: RTL is forced via I18nManager at startup (see src/setup/rtl.js).
 * Web: react-native-web follows the `dir` attribute on <html>, which we set
 * to "rtl" at startup; I18nManager.isRTL is not meaningful there.
 */
export const isRTL = () => {
  if (Platform.OS === 'web') {
    return typeof document !== 'undefined' && document.documentElement?.dir === 'rtl';
  }
  return I18nManager.isRTL;
};

/**
 * Logical text alignment. On native with RTL, RN already treats 'left' as
 * "start" and 'right' as "end"; on web, CSS logical values do the same.
 */
export const textAlignFor = (align) => {
  if (align === 'center') return 'center';
  const web = Platform.OS === 'web';
  if (align === 'end') return web ? 'end' : 'right';
  return web ? 'start' : 'left';
};
