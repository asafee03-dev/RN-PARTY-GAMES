import React from 'react';
import { StyleSheet, View } from 'react-native';
import { borders, colors, radii, spacing, touch, typography, useGameTheme } from '../theme';
import AppText from './AppText';
import Icon from './Icon';

/**
 * A player as a game token: round "pawn" with their initial + name.
 * Extra state is shown with icon + text, never color alone.
 *
 * props: name, color (token color; defaults to game accent), isHost, isMe,
 *        status: null | { label, icon, tone: 'success'|'accent'|'muted' }, dimmed
 */
export default function PlayerChip({ name, color, isHost = false, isMe = false, status = null, dimmed = false, meLabel, hostLabel, style }) {
  const theme = useGameTheme();
  const tokenColor = color || theme.accent;
  const initial = (name || '?').trim().charAt(0);

  const statusColor = status?.tone === 'success' ? colors.successDeep : status?.tone === 'muted' ? colors.inkSoft : theme.accentInk;

  return (
    <View
      style={[styles.chip, isMe && { borderColor: theme.accent, borderWidth: borders.thick }, dimmed && styles.dimmed, style]}
      accessible
      accessibilityLabel={[name, isMe && meLabel, isHost && hostLabel, status?.label].filter(Boolean).join(', ')}
    >
      <View style={[styles.token, { backgroundColor: tokenColor }]}>
        <AppText variant="bodyStrong" color={colors.white} align="center" maxScale={1.4} style={styles.initial}>
          {initial}
        </AppText>
        {isHost && (
          <View style={styles.crown}>
            <Icon name="crown" size={14} color={colors.ink} />
          </View>
        )}
      </View>
      <View style={styles.texts}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {name}
        </AppText>
        {status ? (
          <View style={styles.statusRow}>
            {status.icon ? <Icon name={status.icon} size={15} color={statusColor} /> : null}
            <AppText variant="caption" color={statusColor} style={styles.statusText} numberOfLines={1}>
              {status.label}
            </AppText>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: touch.min + 8,
    paddingVertical: spacing.xs,
    paddingStart: spacing.xs,
    paddingEnd: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radii.pill,
    borderWidth: borders.card,
    borderColor: colors.line,
  },
  dimmed: {
    opacity: 0.55,
  },
  token: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    // Inner rim to read like a plastic game token
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  initial: {
    ...typography.bodyStrong,
    fontSize: 19,
  },
  crown: {
    position: 'absolute',
    top: -8,
    end: -6,
    backgroundColor: colors.gold,
    borderRadius: radii.pill,
    padding: 2,
    borderWidth: 1.5,
    borderColor: colors.card,
  },
  texts: {
    flexShrink: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statusText: {
    fontSize: 15,
    lineHeight: 19,
  },
});
