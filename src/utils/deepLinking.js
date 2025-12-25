/**
 * Deep Linking Utilities
 * Generates HTTPS web URLs for sharing and handles both Universal Links (https://) and custom scheme deep links (partygames://)
 * 
 * Primary format (for sharing): https://party-games-app.com/join?game=spy&roomId=ABC123&inviter=Asaf
 * Custom scheme (backward compatibility only): partygames://join?game=spy&roomId=ABC123&inviter=Asaf
 */

/**
 * Generate a web URL for joining a game room
 * @param {string} game - Game type (spy, codenames, alias, frequency, draw)
 * @param {string} roomId - Room code
 * @param {string} inviter - Name of the person inviting
 * @returns {string} HTTPS web URL
 */
export function generateDeepLink(game, roomId, inviter) {
  const params = new URLSearchParams({
    game: game.toLowerCase(),
    roomId: roomId.toUpperCase(),
    inviter: inviter
  });
  return `https://party-games-app.com/join?${params.toString()}`;
}

/**
 * Parse a deep link URL and extract parameters
 * Supports both Universal Links (https://party-games-app.com) and custom scheme (partygames://) for backward compatibility
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

    // Handle Universal Links: https://party-games-app.com/join?game=spy&roomId=ABC123
    // Support both www and non-www versions
    if (url.startsWith('https://party-games-app.com/') || url.startsWith('https://www.party-games-app.com/')) {
      const urlObj = new URL(url);
      path = urlObj.pathname;
      queryString = urlObj.search.substring(1); // Remove leading '?'
    }
    // Handle custom scheme: partygames://join?game=spy&roomId=ABC123
    // (Still supported for backward compatibility, but not used in shares)
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

