import { Share, Platform } from 'react-native';
import { generateDeepLink, getGameDisplayName } from './deepLinking';

/**
 * Generate share message for inviting players
 * @param {string} inviter - Name of the person inviting
 * @param {string} game - Game type (spy, codenames, alias, frequency, draw)
 * @returns {string} Share message
 */
export function generateShareMessage(inviter, game) {
  const gameName = getGameDisplayName(game);
  return `${inviter} invited you to play ${gameName}.\nTap the link to join!`;
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
    
    // Format the share content with the link on its own line
    // Putting the URL on a separate line helps messaging apps recognize it as a clickable link
    const shareContent = `${message}\n\n${link}`;
    
    // For React Native Share, use url parameter on iOS (if available) for better link recognition
    // On Android, include URL in message - most messaging apps will recognize it
    const shareOptions = {
      message: shareContent,
      title: 'Share Game Invite'
    };
    
    // On iOS, we can also include url parameter for better deep link handling
    // Note: url parameter is iOS-only, so we include link in message for cross-platform compatibility
    if (Platform.OS === 'ios') {
      shareOptions.url = link;
    }
    
    const result = await Share.share(shareOptions);
    
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

