import { colors } from '../theme';

const channel = (v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex) => {
  const h = (hex || '#888888').replace('#', '');
  const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h.padEnd(6, '8');
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const ratio = (a, b) => {
  const [hi, lo] = luminance(a) > luminance(b) ? [a, b] : [b, a];
  return (luminance(hi) + 0.05) / (luminance(lo) + 0.05);
};

/**
 * Text/icon color (ink or white) with the better contrast on an arbitrary
 * background - for user-chosen colors such as team colors.
 */
export const readableOn = (background) =>
  ratio(colors.ink, background) >= ratio(colors.white, background) ? colors.ink : colors.white;

export default readableOn;
