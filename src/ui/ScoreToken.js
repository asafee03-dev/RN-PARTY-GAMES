import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { colors, motion, radii, spacing, useGameTheme } from '../theme';
import AppText from './AppText';

/**
 * A score shown as a round game token. Gives a small "pop" when the value
 * goes up (skipped when the user prefers reduced motion).
 */
export default function ScoreToken({ value, label, size = 56, style }) {
  const theme = useGameTheme();
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const previous = useRef(value);

  useEffect(() => {
    if (!reducedMotion && typeof value === 'number' && typeof previous.current === 'number' && value > previous.current) {
      scale.value = withSequence(withTiming(1.18, { duration: motion.quick }), withTiming(1, { duration: motion.base }));
    }
    previous.current = value;
  }, [value, reducedMotion, scale]);

  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const display = typeof value === 'number' && !Number.isInteger(value) ? value.toFixed(1) : value;

  return (
    <View style={[styles.wrap, style]} accessible accessibilityLabel={`${label ? label + ' ' : ''}${display}`}>
      <Animated.View
        style={[
          styles.token,
          { width: size, height: size, backgroundColor: theme.accent, borderColor: theme.accentDeep },
          animated,
        ]}
      >
        <AppText variant="title" color={theme.onAccent} align="center" maxScale={1.3}>
          {display}
        </AppText>
      </Animated.View>
      {label ? (
        <AppText variant="caption" color={colors.inkSoft} align="center">
          {label}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  token: {
    borderRadius: radii.pill,
    borderWidth: 3,
    borderBottomWidth: 6, // Thicker bottom rim reads as a stacked chip
    alignItems: 'center',
    justifyContent: 'center',
  },
});
