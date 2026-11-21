import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { borders, colors, depth, motion, radii, spacing, touch, useGameTheme } from '../theme';
import AppText from './AppText';
import Icon from './Icon';
import { feedback } from './feedback';

/**
 * Tactile button: the face sits on a darker "edge" and travels down when
 * pressed, like a chunky physical game button.
 *
 * variant: 'primary' (game accent) | 'secondary' (paper + accent border)
 *          | 'success' | 'danger' | 'ghost' (text only, no depth)
 * size:    'md' | 'sm' (both keep a >= 48dp touch target)
 */
export default function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'start',
  loading = false,
  disabled = false,
  fullWidth = false,
  haptic = true,
  accessibilityLabel,
  accessibilityHint,
  style,
}) {
  const theme = useGameTheme();
  const reducedMotion = useReducedMotion();
  const pressed = useSharedValue(0);

  const palette = getPalette(variant, theme);
  const isGhost = variant === 'ghost';
  const edge = isGhost ? 0 : size === 'sm' ? depth.edgeSmall : depth.edge;
  const travel = isGhost ? 0 : size === 'sm' ? depth.pressSmall : depth.press;
  const inactive = disabled || loading;

  const faceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pressed.value * travel }],
  }));

  const animateTo = (value) => {
    pressed.value = reducedMotion ? value : withTiming(value, { duration: motion.press });
  };

  const iconSize = size === 'sm' ? 20 : 22;
  const iconNode = icon ? <Icon name={icon} size={iconSize} color={palette.text} /> : null;

  return (
    <Pressable
      onPress={inactive ? undefined : onPress}
      onPressIn={() => {
        if (inactive) return;
        animateTo(1);
        if (haptic) feedback.tap();
      }}
      onPressOut={() => animateTo(0)}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={[fullWidth && styles.fullWidth, inactive && styles.inactive, style]}
    >
      <View
        style={[
          styles.edge,
          { backgroundColor: palette.edge, paddingBottom: edge, borderRadius: radii.lg },
          isGhost && styles.ghostEdge,
        ]}
      >
        <Animated.View
          style={[
            styles.face,
            size === 'sm' ? styles.faceSm : styles.faceMd,
            {
              backgroundColor: palette.fill,
              borderColor: palette.border,
              borderWidth: palette.border ? borders.thick : 0,
            },
            faceStyle,
          ]}
        >
          {loading ? (
            <ActivityIndicator color={palette.text} />
          ) : (
            iconPosition === 'start' && iconNode
          )}
          {!!title && (
            <AppText variant="button" color={palette.text} align="center" style={[styles.label, size === 'sm' && styles.smallText]}>
              {title}
            </AppText>
          )}
          {!loading && iconPosition === 'end' && iconNode}
        </Animated.View>
      </View>
    </Pressable>
  );
}

const getPalette = (variant, theme) => {
  switch (variant) {
    case 'secondary':
      return { fill: colors.card, edge: theme.accentDeep, border: theme.accent, text: theme.accentInk };
    case 'success':
      return { fill: colors.success, edge: colors.successDeep, text: colors.white };
    case 'danger':
      return { fill: colors.danger, edge: colors.dangerDeep, text: colors.white };
    case 'ghost':
      return { fill: 'transparent', edge: 'transparent', text: theme.accentInk };
    case 'primary':
    default:
      return { fill: theme.accent, edge: theme.accentDeep, text: theme.onAccent };
  }
};

const styles = StyleSheet.create({
  fullWidth: {
    alignSelf: 'stretch',
  },
  inactive: {
    opacity: 0.5,
  },
  edge: {
    // paddingBottom (set inline) reveals the darker edge under the face
  },
  ghostEdge: {
    paddingBottom: 0,
  },
  face: {
    flexDirection: 'row', // Follows layout direction: icon at "start" in RTL too
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.lg,
  },
  faceMd: {
    minHeight: touch.min + 8,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  faceSm: {
    minHeight: touch.min,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  label: {
    flexShrink: 1, // Long labels wrap instead of pushing the button wider than the screen
  },
  smallText: {
    fontSize: 16,
    lineHeight: 22,
  },
});
