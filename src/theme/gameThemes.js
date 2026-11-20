/**
 * Per-game accent themes, layered on the shared tokens.
 *
 * accent      - fills with WHITE text on top (all >= 5:1)
 * accentDeep  - the tactile "edge" under accent buttons, pressed borders
 * accentInk   - accent-colored TEXT on paper/card (>= 4.5:1)
 * tint        - light background behind INK text (>= 10:1)
 * onAccent    - text/icon color on accent
 *
 * Contrast values are noted next to each color (vs white or vs paper).
 */

export const gameThemes = {
  // Neutral app chrome (home screen, shared screens)
  app: {
    key: 'app',
    accent: '#8A5A2B', // white 5.9
    accentDeep: '#5E3C1C',
    accentInk: '#8A5A2B', // paper 5.0
    tint: '#EFDFC8',
    onAccent: '#FFFFFF',
  },

  // Alias - "tabletop blue"
  alias: {
    key: 'alias',
    accent: '#2F6FB5', // white 5.2
    accentDeep: '#1F4E82',
    accentInk: '#245A94', // paper 6.0
    tint: '#DCEAF8',
    onAccent: '#FFFFFF',
  },

  // Codenames - "teak wood", with two team colors that always come with an icon
  codenames: {
    key: 'codenames',
    accent: '#8A5A2B', // white 5.9
    accentDeep: '#5E3C1C',
    accentInk: '#8A5A2B', // paper 5.0
    tint: '#EFDFC8',
    onAccent: '#FFFFFF',
    teams: {
      red: { fill: '#C2453A', deep: '#8F2F27', ink: '#A8382E', tint: '#F6DCD8', icon: 'team-red' }, // white 5.0 / paper 5.5
      blue: { fill: '#2F6FB5', deep: '#1F4E82', ink: '#245A94', tint: '#DCEAF8', icon: 'team-blue' }, // white 5.2 / paper 6.0
    },
    assassin: { fill: '#2B2522', deep: '#14110F', icon: 'assassin' }, // white 15.1
    neutral: { fill: '#E8D9BF', deep: '#CDB894', icon: 'neutral' }, // ink 9.8
  },

  // Spy - "detective green"
  spy: {
    key: 'spy',
    accent: '#3F7D3A', // white 5.0
    accentDeep: '#2B5A28',
    accentInk: '#2F6A2B', // paper 5.5
    tint: '#DDEFD6',
    onAccent: '#FFFFFF',
  },

  // Frequency - "radio night", with a signal orange for needle/target
  frequency: {
    key: 'frequency',
    accent: '#22335C', // white 12.4
    accentDeep: '#141F3B',
    accentInk: '#22335C', // paper 10.5
    tint: '#DCE2F0',
    onAccent: '#FFFFFF',
    signal: '#E8742A', // Decorative, or with ink text (4.5) - never white text
  },

  // Draw - "crayon purple"
  draw: {
    key: 'draw',
    accent: '#7A4FC2', // white 5.6
    accentDeep: '#573591',
    accentInk: '#6A3FB3', // paper 6.0
    tint: '#EBE0FA',
    onAccent: '#FFFFFF',
  },
};

export const getGameTheme = (key) => gameThemes[key] || gameThemes.app;
