import React from 'react';
import { StyleSheet, View } from 'react-native';
import { borders, colors, radii, shadows, spacing, useGameTheme } from '../theme';

/**
 * A physical-feeling card: paper surface, warm border, soft shadow.
 *
 * tone: 'paper' (default) | 'tint' (game tint) | 'cardboard' | 'accent'
 * padding: spacing token name or number
 */
export default function Card({ tone = 'paper', padding = 'lg', style, children, ...rest }) {
  const theme = useGameTheme();
  const toneStyle = {
    paper: { backgroundColor: colors.card, borderColor: colors.line },
    tint: { backgroundColor: theme.tint, borderColor: colors.line },
    cardboard: { backgroundColor: colors.cardboard, borderColor: colors.cardboardDeep },
    accent: { backgroundColor: theme.accent, borderColor: theme.accentDeep },
  }[tone];
  const pad = typeof padding === 'number' ? padding : spacing[padding] ?? spacing.lg;

  return (
    <View {...rest} style={[styles.card, toneStyle, { padding: pad }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    borderWidth: borders.card,
    ...shadows.card,
  },
});
