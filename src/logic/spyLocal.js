/**
 * Spy - single phone mode. Pure dealing logic (no React, no Firestore).
 * Same rules as SpyRoomScreen.startGame: random spies (at most half of the
 * players), every other player gets the location + a role, or in word mode
 * the same word.
 */
import { REPEAT_SPY_WEIGHT, shuffle, weightedSample } from '../utils/random';

export const GAME_SECONDS = 360;

export const maxSpiesFor = (playerCount) => Math.max(1, Math.floor(playerCount / 2));

/**
 * Roles for the non-spies: different roles while the location has enough,
 * then repeats (still in random order).
 */
export function dealRoles(roles, count) {
  const out = [];
  let deck = [];
  for (let i = 0; i < count; i++) {
    if (deck.length === 0) deck = shuffle(roles);
    out.push(deck.pop());
  }
  return out;
}

/**
 * @param {string[]} names
 * @param {number} numSpies
 * @param {'locations'|'word'} mode
 * @param {{location?: {location: string, roles: string[]}, word?: string}} content
 * @param {string[]} previousSpies last game's spies (less likely, not excluded)
 * @returns {{mode, secret: string, players: Array<{name, isSpy, location, role}>}}
 */
export function dealSpyGame(names, numSpies, mode, content, previousSpies = []) {
  if (!names || names.length < 3) throw new Error('Need at least 3 players');
  const previous = new Set(previousSpies || []);
  const spies = new Set(
    weightedSample(names, Math.min(numSpies, maxSpiesFor(names.length)), (n) => (previous.has(n) ? REPEAT_SPY_WEIGHT : 1))
  );
  const secret = mode === 'word' ? content.word : content.location.location;
  const roles = mode === 'word' ? [] : dealRoles(content.location.roles, names.length - spies.size);
  const players = names.map((name) => {
    if (spies.has(name)) return { name, isSpy: true, location: '', role: '' };
    if (mode === 'word') return { name, isSpy: false, location: secret, role: '' };
    return { name, isSpy: false, location: secret, role: roles.pop() };
  });
  return { mode, secret, players };
}
