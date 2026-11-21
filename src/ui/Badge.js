import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radii, spacing, useGameTheme } from '../theme';
import AppText from './AppText';
import Icon from './Icon';

/**
 * Small pill label. Always text (optionally with an icon) - never color alone.
 * tone: 'accent' | 'tint' | 'success' | 'danger' | 'gold' | 'neutral'
 */
export default function Badge({ label, icon, tone = 'tint', style }) {
  const theme = useGameTheme();
  const t = {
    accent: { bg: theme.accent, fg: theme.onAccent },
    tint: { bg: theme.tint, fg: colors.ink },
    success: { bg: colors.successTint, fg: colors.successDeep },
    danger: { bg: colors.dangerTint, fg: colors.dangerDeep },
    gold: { bg: colors.goldTint, fg: colors.ink },
    neutral: { bg: colors.cardboard, fg: colors.ink },
  }[tone];

  return (
    <View style={[styles.badge, { backgroundColor: t.bg }, style]}>
      {icon ? <Icon name={icon} size={16} color={t.fg} /> : null}
      <AppText variant="label" color={t.fg} style={styles.text}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
  },
  text: {
    fontSize: 15,
    lineHeight: 20,
  },
});
