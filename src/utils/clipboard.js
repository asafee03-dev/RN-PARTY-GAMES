import * as Clipboard from 'expo-clipboard';
import { Platform, Alert } from 'react-native';

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @param {string} successMessage - Optional success message to show
 * @returns {Promise<boolean>} - True if copy was successful
 */
export const copyToClipboard = async (text, successMessage = null) => {
  try {
    await Clipboard.setStringAsync(text);
    if (successMessage) {
      Alert.alert('הצלחה', successMessage);
    }
    return true;
  } catch (error) {
    console.error('Error copying to clipboard:', error);
    Alert.alert('שגיאה', 'לא הצלחנו להעתיק');
    return false;
  }
};

/**
 * Generate a room join link
 * @param {string} roomCode - Room code
 * @param {string} gameType - Type of game (alias, spy, frequency, draw, codenames)
 * @param {string} inviter - Optional name of the person inviting
 * @returns {string} - HTTPS web URL for joining the room
 */
export const generateRoomLink = (roomCode, gameType = 'alias', inviter = '') => {
  const params = new URLSearchParams({
    game: gameType.toLowerCase(),
    roomId: roomCode.toUpperCase()
  });
  
  if (inviter) {
    params.set('inviter', inviter);
  }
  
  return `https://party-games-app.com/join?${params.toString()}`;
};

/**
 * Copy room code to clipboard
 * @param {string} roomCode - Room code to copy
 * @returns {Promise<boolean>} - True if copy was successful
 */
export const copyRoomCode = async (roomCode) => {
  return await copyToClipboard(roomCode, `קוד החדר ${roomCode} הועתק`);
};

/**
 * Copy room link to clipboard
 * @param {string} roomCode - Room code
 * @param {string} gameType - Type of game
 * @returns {Promise<boolean>} - True if copy was successful
 */
export const copyRoomLink = async (roomCode, gameType = 'alias') => {
  const link = generateRoomLink(roomCode, gameType);
  return await copyToClipboard(link, 'קישור החדר הועתק');
};

