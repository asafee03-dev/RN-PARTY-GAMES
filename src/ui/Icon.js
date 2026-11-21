import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../theme';
import { isRTL } from './direction';

/**
 * Semantic icon names -> MaterialCommunityIcons glyphs.
 * Screens use semantic names only, so the icon set can be swapped here.
 *
 * `flip: true` marks direction-sensitive glyphs (arrows, "exit", "skip"),
 * which are mirrored automatically in RTL.
 */
const ICONS = {
  // App chrome
  back: { glyph: 'arrow-left', flip: true }, // Points toward "start" side visually in each direction
  forward: { glyph: 'chevron-right', flip: true },
  exit: { glyph: 'logout', flip: true },
  share: { glyph: 'share-variant' },
  link: { glyph: 'link-variant' },
  copy: { glyph: 'content-copy' },
  check: { glyph: 'check' },
  checkCircle: { glyph: 'check-circle' },
  close: { glyph: 'close' },
  plus: { glyph: 'plus' },
  minus: { glyph: 'minus' },
  rules: { glyph: 'book-open-variant' },
  help: { glyph: 'help-circle-outline' },
  info: { glyph: 'information-outline' },
  alert: { glyph: 'alert-circle-outline' },
  home: { glyph: 'home-variant' },
  settings: { glyph: 'cog' },
  play: { glyph: 'play' },
  skip: { glyph: 'skip-next', flip: true },
  undo: { glyph: 'undo-variant', flip: true },
  trash: { glyph: 'delete-outline' },
  eye: { glyph: 'eye' },
  eyeOff: { glyph: 'eye-off' },
  timer: { glyph: 'timer-outline' },
  join: { glyph: 'door-open' },
  addPlayer: { glyph: 'account-plus' },
  gesture: { glyph: 'gesture-swipe-horizontal' },
  hourglass: { glyph: 'timer-sand' },
  medal: { glyph: 'medal' },
  podium: { glyph: 'podium' },

  // People & status
  player: { glyph: 'account' },
  players: { glyph: 'account-group' },
  crown: { glyph: 'crown' },
  trophy: { glyph: 'trophy' },
  star: { glyph: 'star' },
  golden: { glyph: 'star-four-points' },
  drink: { glyph: 'glass-mug-variant' },
  party: { glyph: 'party-popper' },
  vote: { glyph: 'vote' },
  target: { glyph: 'target' },
  finish: { glyph: 'flag-checkered' },
  pawn: { glyph: 'chess-pawn' },

  // Games
  alias: { glyph: 'chat-processing-outline' },
  codenames: { glyph: 'cards-outline' },
  spy: { glyph: 'incognito' },
  frequency: { glyph: 'radio' },
  wave: { glyph: 'sine-wave' },
  draw: { glyph: 'brush' },
  pencil: { glyph: 'pencil' },
  eraser: { glyph: 'eraser' },
  palette: { glyph: 'palette' },
  location: { glyph: 'map-marker' },
  clue: { glyph: 'lightbulb-on-outline' },
  card: { glyph: 'card-text-outline' },
  dice: { glyph: 'dice-5' },
  roles: { glyph: 'drama-masks' },

  // Codenames teams - always shown with their color, never color alone
  'team-red': { glyph: 'fire' },
  'team-blue': { glyph: 'water' },
  assassin: { glyph: 'skull' },
  neutral: { glyph: 'minus' },
};

export const iconNames = Object.keys(ICONS);

/**
 * Decorative by default (hidden from screen readers). Pass `label` when the
 * icon carries meaning on its own (e.g. an icon-only status).
 */
export default function Icon({ name, size = 24, color = colors.ink, label, style }) {
  const def = ICONS[name];
  if (!def) {
    if (__DEV__) console.warn(`Icon: unknown name "${name}"`);
    return null;
  }
  const mirror = def.flip && isRTL();
  return (
    <MaterialCommunityIcons
      name={def.glyph}
      size={size}
      color={color}
      style={[mirror ? { transform: [{ scaleX: -1 }] } : null, style]}
      accessible={!!label}
      accessibilityLabel={label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
    />
  );
}

export const iconFont = MaterialCommunityIcons.font;
