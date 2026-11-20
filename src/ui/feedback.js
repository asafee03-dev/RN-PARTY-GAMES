import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Small haptic helpers. Never throw, and a no-op on web (no haptics there).
 * Use sparingly: taps on primary actions, reveals, and round results.
 */
const run = (fn) => {
  if (Platform.OS === 'web') return;
  try {
    fn()?.catch?.(() => {});
  } catch {
    // Haptics unavailable on this device - ignore
  }
};

export const feedback = {
  // Light tap - pressing buttons, picking a tile
  tap: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  // Firmer tap - flipping a card, revealing a word
  reveal: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  // Selection change - dragging a needle across a step, toggles
  select: () => run(() => Haptics.selectionAsync()),
  // Round results
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};

export default feedback;
