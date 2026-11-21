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

const hexToRgb = (hex) => {
  const h = (hex || '#888888').replace('#', '');
  const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h.padEnd(6, '8');
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};
const mix = (hex, target, t) => {
  const [r, g, b] = hexToRgb(hex);
  const m = (v) => Math.round(v + (target - v) * t).toString(16).padStart(2, '0');
  return `#${m(r)}${m(g)}${m(b)}`;
};
const bestRatio = (bg) => Math.max(ratio(colors.ink, bg), ratio(colors.white, bg));

/**
 * A user-chosen color (e.g. an Alias team color) shifted just enough - same
 * hue, darker or lighter - that readableOn() text on it reaches `min`:1
 * contrast (WCAG AA for normal text). Colors that already pass are returned
 * unchanged. Pair it with a second cue (number / icon) as usual.
 */
export const accessibleSurface = (background, min = 4.5) => {
  if (typeof background !== 'string' || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(background)) return background;
  if (bestRatio(background) >= min) return background;
  let dark = null;
  let light = null;
  for (let t = 0.05; t <= 1.001 && (!dark || !light); t += 0.05) {
    if (!dark) { const c = mix(background, 0, t); if (ratio(colors.white, c) >= min) dark = { c, t }; }
    if (!light) { const c = mix(background, 255, t); if (ratio(colors.ink, c) >= min) light = { c, t }; }
  }
  if (dark && light) return dark.t <= light.t ? dark.c : light.c;
  return (dark || light).c;
};
