import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { borders, colors, depth, motion, radii, touch, useGameTheme } from '../theme';
import Icon from './Icon';
import { feedback } from './feedback';

/**
 * Round tactile icon-only button (48dp). `label` is required: it is what
 * screen readers announce, since there's no visible text.
 *
 * variant: 'paper' (card surface, accent icon) | 'accent' (filled)
 */
export default function IconButton({ icon, label, onPress, variant = 'paper', size = touch.min, disabled = false, style }) {
  const theme = useGameTheme();
  const reducedMotion = useReducedMotion();
  const pressed = useSharedValue(0);

  const filled = variant === 'accent';
  const faceStyle = useAnimatedStyle(() => ({ transform: [{ translateY: pressed.value * depth.pressSmall }] }));
  const animateTo = (v) => {
    pressed.value = reducedMotion ? v : withTiming(v, { duration: motion.press });
  };

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      onPressIn={() => {
        if (disabled) return;
        animateTo(1);
        feedback.tap();
      }}
      onPressOut={() => animateTo(0)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[disabled && styles.disabled, style]}
    >
      <View
        style={{
          borderRadius: radii.pill,
          paddingBottom: depth.edgeSmall,
          backgroundColor: filled ? theme.accentDeep : colors.cardboardDeep,
        }}
      >
        <Animated.View
          style={[
            styles.face,
            {
              width: size,
              height: size,
              backgroundColor: filled ? theme.accent : colors.card,
              borderColor: filled ? theme.accent : colors.line,
            },
            faceStyle,
          ]}
        >
          <Icon name={icon} size={Math.round(size * 0.5)} color={filled ? theme.onAccent : theme.accentInk} />
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  face: {
    borderRadius: radii.pill,
    borderWidth: borders.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
});
