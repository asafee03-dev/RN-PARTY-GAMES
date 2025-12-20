import { Share } from 'react-native';
import { generateDeepLink, getGameDisplayName } from './deepLinking';

/**
 * Generate share message for inviting players
 * @param {string} inviter - Name of the person inviting
 * @param {string} game - Game type (spy, codenames, alias, frequency, draw)
 * @returns {string} Share message
 */
export function generateShareMessage(inviter, game) {
  const gameName = getGameDisplayName(game);
  return `${inviter} invited you to play ${gameName}.\nTap to join if you have the app installed. If not, please install it.`;
}

/**
 * Share a game room link using native Share API
 * @param {string} game - Game type (spy, codenames, alias, frequency, draw)
 * @param {string} roomId - Room code
 * @param {string} inviter - Name of the person inviting
 * @returns {Promise<boolean>} True if sharing was successful
 */
export async function shareGameLink(game, roomId, inviter) {
  try {
    const link = generateDeepLink(game, roomId, inviter);
    const message = generateShareMessage(inviter, game);
    
    // Combine message and link
    const shareContent = `${message}\n\n${link}`;
    
    const result = await Share.share({
      message: shareContent,
      title: 'Share Game Invite'
    });
    
    // Share.share returns { action: Share.sharedAction } on success
    // or { action: Share.dismissedAction } if user dismissed
    if (result.action === Share.sharedAction) {
      return true;
    } else {
      // User dismissed the share sheet
      return false;
    }
  } catch (error) {
    console.error('Error sharing game link:', error);
    return false;
  }
}

