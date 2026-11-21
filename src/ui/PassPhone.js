import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radii, spacing, borders, useGameTheme } from '../theme';
import AppText from './AppText';
import Button from './Button';
import Icon from './Icon';
import Screen from './Screen';

/**
 * Full-screen "pass the phone" hand-off. Nothing secret is on screen, so the
 * next person sees their content only after pressing the ready button.
 * props: title (e.g. "Pass the phone to Dana"), subtitle, buttonLabel, onReady,
 * extra (optional node under the subtitle)
 */
export default function PassPhone({ title, subtitle, buttonLabel, onReady, extra }) {
  const theme = useGameTheme();
  return (
    <Screen scroll={false} contentStyle={styles.content}>
      <View style={[styles.badge, { backgroundColor: theme.tint, borderColor: theme.accent }]}>
        <Icon name="handoff" size={56} color={theme.accentInk} />
      </View>
      <AppText variant="display" align="center" accessibilityRole="header">
        {title}
      </AppText>
      {subtitle ? (
        <AppText variant="subtitle" align="center" color={colors.inkSoft}>
          {subtitle}
        </AppText>
      ) : null}
      {extra}
      <Button title={buttonLabel} icon="check" onPress={onReady} fullWidth />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.lg },
  badge: {
    width: 120,
    height: 120,
    borderRadius: radii.pill,
    borderWidth: borders.thick,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
