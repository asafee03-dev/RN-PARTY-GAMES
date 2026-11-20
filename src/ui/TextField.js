import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { borders, colors, fonts, radii, spacing, touch, useGameTheme } from '../theme';
import AppText from './AppText';
import Icon from './Icon';
import { textAlignFor } from './direction';

/**
 * Labeled text input. The error message is shown as text with an icon,
 * not just a red border. Direction-aware (text starts at "start").
 */
export default function TextField({ label, error, style, inputStyle, ...inputProps }) {
  const theme = useGameTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.wrap, style]}>
      {label ? (
        <AppText variant="label" color={colors.inkSoft}>
          {label}
        </AppText>
      ) : null}
      <TextInput
        placeholderTextColor={colors.inkFaint}
        {...inputProps}
        accessibilityLabel={inputProps.accessibilityLabel || label}
        onFocus={(e) => {
          setFocused(true);
          inputProps.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          inputProps.onBlur?.(e);
        }}
        style={[
          styles.input,
          { textAlign: textAlignFor('start') },
          focused && { borderColor: theme.accent },
          !!error && { borderColor: colors.danger },
          inputStyle,
        ]}
      />
      {error ? (
        <View style={styles.errorRow} accessibilityLiveRegion="polite">
          <Icon name="alert" size={18} color={colors.danger} />
          <AppText variant="caption" color={colors.dangerDeep} style={styles.errorText}>
            {error}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs,
  },
  input: {
    minHeight: touch.min + 4,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: borders.thick,
    borderColor: colors.line,
    fontFamily: fonts.regular,
    fontSize: 18,
    color: colors.ink,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  errorText: {
    flexShrink: 1,
  },
});
