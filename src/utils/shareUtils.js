import * as Sharing from 'expo-sharing';
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
 * Share a game room link
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
    
    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(shareContent, {
        mimeType: 'text/plain',
        dialogTitle: 'Share Game Invite'
      });
      return true;
    } else {
      console.warn('Sharing is not available on this platform');
      return false;
    }
  } catch (error) {
    console.error('Error sharing game link:', error);
    return false;
  }
}

