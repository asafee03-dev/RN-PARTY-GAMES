import { gameThemes } from '../../theme';

// Codenames team look. Every team always pairs its color with an icon
// (flame = red, drop = blue) and a name, so color is never the only cue.
const T = gameThemes.codenames.teams;

export const getTeamStyle = (team) => (team === 'red' ? T.red : T.blue);
export const ASSASSIN = gameThemes.codenames.assassin;
export const NEUTRAL = gameThemes.codenames.neutral;
