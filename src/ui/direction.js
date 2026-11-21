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

/**
 * For things that must stay PHYSICALLY ordered left-to-right regardless of
 * language (e.g. the two ends of a dial whose 0° is on the left): a row that
 * does not flip in RTL. For absolute positioning over a drawing, draw inside
 * the SVG instead - SVG coordinates are physical on every platform.
 */
export const physicalRow = () => (isRTL() ? 'row-reverse' : 'row');

/**
 * Physical "distance from the left edge" for drawings that must not mirror
 * with the language (board games, dials). Native RN swaps left/right in RTL
 * (so ask for `right`), react-native-web keeps `left` physical.
 */
export const physicalLeft = (x) => (Platform.OS !== 'web' && I18nManager.isRTL ? { right: x } : { left: x });
