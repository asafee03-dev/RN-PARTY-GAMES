import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { borders, colors, radii, spacing, useGameTheme } from '../theme';
import AppText from './AppText';
import Icon from './Icon';

const formatTime = (seconds) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Visual-only timer: a sand-timer style bar + mm:ss.
 * It does NOT own any timing logic - the game screen computes `remaining`
 * (from the shared server clock) and handles time-up as before.
 *
 * Under `warnAt` seconds it switches to the warning color, adds a text cue,
 * and pulses gently (skipped with reduced motion).
 */
export default function TimerDisplay({ remaining, total, warnAt = 10, compact = false, label, warningLabel, style }) {
  const theme = useGameTheme();
  const reducedMotion = useReducedMotion();
  const pulse = useSharedValue(1);
  const warning = remaining <= warnAt && remaining > 0;
  const fraction = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;

  useEffect(() => {
    if (warning && !reducedMotion) {
      pulse.value = withRepeat(withSequence(withTiming(1.06, { duration: 300 }), withTiming(1, { duration: 300 })), -1);
    } else {
      cancelAnimation(pulse);
      pulse.value = 1;
    }
  }, [warning, reducedMotion, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const barColor = warning ? colors.danger : theme.accent;

  return (
    <Animated.View
      style={[styles.wrap, compact && styles.compact, pulseStyle, style]}
      accessible
      accessibilityRole="timer"
      accessibilityLabel={`${label ? label + ' ' : ''}${formatTime(remaining)}${warning && warningLabel ? ', ' + warningLabel : ''}`}
    >
      <View style={styles.row}>
        <Icon name="timer" size={compact ? 22 : 26} color={warning ? colors.danger : theme.accentInk} />
        <AppText
          variant={compact ? 'title' : 'heading'}
          color={warning ? colors.dangerDeep : colors.ink}
          maxScale={1.4}
          style={styles.digits}
        >
          {formatTime(remaining)}
        </AppText>
        {warning && warningLabel ? (
          <AppText variant="label" color={colors.dangerDeep}>
            {warningLabel}
          </AppText>
        ) : null}
      </View>
      {!compact && (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${fraction * 100}%`, backgroundColor: barColor }]} />
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'stretch',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: borders.card,
    borderColor: colors.line,
  },
  compact: {
    alignSelf: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  digits: {
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.cardboard,
    overflow: 'hidden',
    // Bar drains toward "start", following layout direction
    flexDirection: 'row',
  },
  fill: {
    height: '100%',
    borderRadius: radii.pill,
  },
});
