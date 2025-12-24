/**
 * Deep Linking Utilities
 * Handles both custom scheme deep links (partygames://) and Universal Links (https://)
 * 
 * Custom scheme: partygames://join?game=spy&roomId=ABC123&inviter=Asaf
 * Universal Link: https://www.party-games-app.com/join?game=spy&roomId=ABC123&inviter=Asaf
 */

/**
 * Generate a deep link URL for joining a game room
 * @param {string} game - Game type (spy, codenames, alias, frequency, draw)
 * @param {string} roomId - Room code
 * @param {string} inviter - Name of the person inviting
 * @returns {string} Deep link URL
 */
export function generateDeepLink(game, roomId, inviter) {
  const params = new URLSearchParams({
    game: game.toLowerCase(),
    roomId: roomId.toUpperCase(),
    inviter: inviter
  });
  return `partygames://join?${params.toString()}`;
}

/**
 * Parse a deep link URL and extract parameters
 * Supports both custom scheme (partygames://) and Universal Links (https://www.party-games-app.com)
 * @param {string} url - Deep link URL
 * @returns {Object|null} Parsed parameters { game, roomId, inviter } or null if invalid
 */
export function parseDeepLink(url) {
  try {
    if (!url || typeof url !== 'string') {
      return null;
    }

    let path = '';
    let queryString = '';

    // Handle Universal Links: https://www.party-games-app.com/join?game=spy&roomId=ABC123
    if (url.startsWith('https://www.party-games-app.com/')) {
      const urlObj = new URL(url);
      path = urlObj.pathname;
      queryString = urlObj.search.substring(1); // Remove leading '?'
    }
    // Handle custom scheme: partygames://join?game=spy&roomId=ABC123
    else if (url.startsWith('partygames://')) {
      // Remove the scheme prefix
      const withoutScheme = url.replace('partygames://', '');
      // Parse the path and query string
      [path, queryString] = withoutScheme.split('?');
    } else {
      // Not a supported URL format
      return null;
    }

    // Normalize path (remove leading/trailing slashes)
    path = path.replace(/^\/+|\/+$/g, '');
    
    // Check if path is 'join'
    if (path !== 'join') {
      return null;
    }

    // Parse query parameters
    const params = new URLSearchParams(queryString || '');
    const game = params.get('game');
    const roomId = params.get('roomId');
    const inviter = params.get('inviter');
    
    if (game && roomId) {
      return {
        game: game.toLowerCase(),
        roomId: roomId.toUpperCase(),
        inviter: inviter || ''
      };
    }
    
    return null;
  } catch (error) {
    console.warn('Error parsing deep link:', error);
    return null;
  }
}

/**
 * Get display name for a game
 * @param {string} game - Game type (spy, codenames, alias, frequency, draw)
 * @returns {string} Display name
 */
export function getGameDisplayName(game) {
  const gameNames = {
    spy: 'Spy',
    codenames: 'Codenames',
    alias: 'Alias',
    frequency: 'Frequency',
    draw: 'Draw'
  };
  return gameNames[game.toLowerCase()] || game;
}

