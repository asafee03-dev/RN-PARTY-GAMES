/**
 * Spy - single phone mode. Pure dealing logic (no React, no Firestore).
 * Same rules as SpyRoomScreen.startGame: random spies (at most half of the
 * players), every other player gets the location + a random role, or in word
 * mode the same word.
 */

export const GAME_SECONDS = 360;

export const maxSpiesFor = (playerCount) => Math.max(1, Math.floor(playerCount / 2));

/**
 * @param {string[]} names
 * @param {number} numSpies
 * @param {'locations'|'word'} mode
 * @param {{location?: {location: string, roles: string[]}, word?: string}} content
 * @returns {{mode, secret: string, players: Array<{name, isSpy, location, role}>}}
 */
export function dealSpyGame(names, numSpies, mode, content) {
  if (!names || names.length < 3) throw new Error('Need at least 3 players');
  const spies = new Set(
    [...names].sort(() => Math.random() - 0.5).slice(0, Math.min(numSpies, maxSpiesFor(names.length)))
  );
  const secret = mode === 'word' ? content.word : content.location.location;
  const players = names.map((name) => {
    if (spies.has(name)) return { name, isSpy: true, location: '', role: '' };
    if (mode === 'word') return { name, isSpy: false, location: secret, role: '' };
    const roles = content.location.roles;
    return { name, isSpy: false, location: secret, role: roles[Math.floor(Math.random() * roles.length)] };
  });
  return { mode, secret, players };
}
