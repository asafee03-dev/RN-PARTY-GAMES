import React, { createContext, useContext, useMemo } from 'react';
import { getGameTheme } from './gameThemes';

const GameThemeContext = createContext(getGameTheme('app'));

/**
 * Wrap a game's screens so every shared component picks up that game's
 * accent automatically: <GameThemeProvider game="spy">...</GameThemeProvider>
 */
export function GameThemeProvider({ game = 'app', children }) {
  const theme = useMemo(() => getGameTheme(game), [game]);
  return <GameThemeContext.Provider value={theme}>{children}</GameThemeContext.Provider>;
}

export const useGameTheme = () => useContext(GameThemeContext);
