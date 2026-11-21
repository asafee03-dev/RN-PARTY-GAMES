/**
 * Design tokens - the single source of truth for the app's look.
 *
 * "Cozy board game night": warm paper & cardboard surfaces, dark-brown ink,
 * chunky rounded shapes and tactile depth. Game-specific accent colors live
 * in gameThemes.js on top of these.
 *
 * Contrast (WCAG): ink on paper 11.6:1, inkSoft on paper 6.0:1,
 * white on success 5.3:1, white on danger 5.6:1, ink on gold 6.2:1.
 */

export const colors = {
  paper: '#F6EBDD', // App background
  card: '#FFFDF8', // Cards, sheets, dialogs
  cardboard: '#E9D3B4', // Secondary surfaces, board frames
  cardboardDeep: '#D4B48A', // Depth edge under cardboard surfaces
  line: '#D9C2A3', // Borders, dividers
  ink: '#3B2A1E', // Primary text
  inkSoft: '#6B5443', // Secondary text
  inkFaint: '#85705E', // Placeholders (4.6:1 on card)
  white: '#FFFFFF',

  success: '#2E7A43',
  successDeep: '#1F5A30',
  successTint: '#DCEEDF',
  danger: '#B83E33',
  dangerDeep: '#8A2C24',
  dangerTint: '#F6DCD8',
  gold: '#E0A526', // Golden squares, crowns, highlights - use ink text on it
  goldDeep: '#B07E12',
  goldTint: '#FBEFCF',

  scrim: 'rgba(59, 42, 30, 0.55)', // Behind dialogs (ink-tinted, not pure black)
  shadow: '#5A3E26', // Warm shadow color
};

// 4-pt spacing scale
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

// Chunky, rounded shapes
export const radii = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
};

// Minimum touch target (dp)
export const touch = {
  min: 48,
};

// Rubik, three bundled weights. On Android a custom font family can't be
// "bolded" with fontWeight, so each weight is its own family.
export const fonts = {
  regular: 'Rubik-Regular',
  medium: 'Rubik-Medium',
  bold: 'Rubik-Bold',
};

/**
 * Type scale. Sizes respect the system font scale (allowFontScaling stays on);
 * body text never goes below 16.
 */
export const typography = {
  display: { fontFamily: fonts.bold, fontSize: 36, lineHeight: 44 },
  heading: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 36 },
  title: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 30 },
  subtitle: { fontFamily: fonts.medium, fontSize: 19, lineHeight: 26 },
  body: { fontFamily: fonts.regular, fontSize: 17, lineHeight: 25 },
  bodyStrong: { fontFamily: fonts.medium, fontSize: 17, lineHeight: 25 },
  label: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 22 },
  button: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24 },
  caption: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22 },
};

/**
 * Tactile depth: pressables sit on a darker "edge" this many dp tall and
 * travel down by `press` when pressed, like a physical button.
 */
export const depth = {
  edge: 4,
  press: 3,
  edgeSmall: 3,
  pressSmall: 2,
};

// Soft paper shadow for cards (iOS/web shadow + Android elevation)
export const shadows = {
  card: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 3,
  },
  raised: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 6,
  },
};

// Motion durations (ms) - short and subtle; never block input
export const motion = {
  press: 90,
  quick: 160,
  base: 240,
  slow: 380,
};

// Border widths
export const borders = {
  hairline: 1,
  card: 1.5,
  thick: 2.5,
};
