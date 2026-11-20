import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, ZoomIn, useReducedMotion } from 'react-native-reanimated';
import { borders, colors, radii, shadows, spacing, useGameTheme } from '../theme';
import AppText from './AppText';
import Icon from './Icon';
import { S } from '../strings';

/**
 * Modal dialog styled like a card dealt onto the table.
 * - `icon` shows in a round badge at the top (game accent)
 * - `onRequestClose` (back button / scrim tap) is optional: omit it for
 *   dialogs that must be answered (e.g. round summary waiting for the host)
 * - `actions` render at the bottom (usually Buttons)
 */
export default function Dialog({ visible, title, icon, onRequestClose, dismissOnScrim = false, actions, children }) {
  const theme = useGameTheme();
  const reducedMotion = useReducedMotion();

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onRequestClose || (() => {})} statusBarTranslucent>
      <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(160)} style={styles.scrim}>
        {dismissOnScrim && onRequestClose ? (
          <Pressable style={StyleSheet.absoluteFill} onPress={onRequestClose} accessibilityRole="button" accessibilityLabel={S.common.close} />
        ) : null}
        <Animated.View
          entering={reducedMotion ? undefined : ZoomIn.springify().damping(16).stiffness(180)}
          style={styles.sheet}
          accessibilityViewIsModal
        >
          {icon ? (
            <View style={[styles.iconBadge, { backgroundColor: theme.accent, borderColor: theme.accentDeep }]}>
              <Icon name={icon} size={30} color={theme.onAccent} />
            </View>
          ) : null}
          {title ? (
            <AppText variant="title" align="center" accessibilityRole="header" style={styles.title}>
              {title}
            </AppText>
          ) : null}
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} bounces={false}>
            {children}
          </ScrollView>
          {actions ? <View style={styles.actions}>{actions}</View> : null}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '88%',
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    borderWidth: borders.card,
    borderColor: colors.line,
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    ...shadows.raised,
  },
  iconBadge: {
    position: 'absolute',
    top: -30,
    alignSelf: 'center',
    width: 60,
    height: 60,
    borderRadius: radii.pill,
    borderWidth: 3,
    borderBottomWidth: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  body: {
    flexGrow: 0,
    flexShrink: 1, // Long content scrolls inside the dialog instead of overflowing
  },
  bodyContent: {
    gap: spacing.md,
  },
  actions: {
    marginTop: spacing.xl,
    gap: spacing.md,
  },
});
