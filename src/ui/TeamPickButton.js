import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { borders, colors, radii, spacing, touch } from '../theme';
import AppText from './AppText';
import Icon from './Icon';
import { feedback } from './feedback';
import { readableOn } from './readableOn';

/**
 * A team as a pressable choice. The team color is never the only cue:
 * the team's number sits in a token, and a selected team shows a check.
 * Text color adapts to the (user-chosen) team color for contrast.
 */
export default function TeamPickButton({ name, color, index, selected = false, onPress, disabled = false, style }) {
  const fg = readableOn(color);
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      onPressIn={() => !disabled && feedback.tap()}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${index + 1}. ${name}`}
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: color },
        selected && styles.selected,
        disabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      <View style={styles.number}>
        <AppText variant="label" color={colors.ink} align="center" maxScale={1.3}>
          {index + 1}
        </AppText>
      </View>
      <AppText variant="bodyStrong" color={fg} numberOfLines={2} style={styles.name}>
        {name}
      </AppText>
      {selected ? <Icon name="check" size={22} color={fg} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: touch.min + 4,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: borders.thick,
    borderColor: 'rgba(59, 42, 30, 0.35)',
    borderBottomWidth: 5,
  },
  selected: {
    borderColor: colors.ink,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    transform: [{ translateY: 2 }],
  },
  number: {
    width: 30,
    height: 30,
    borderRadius: radii.pill,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    flexShrink: 1,
  },
});
