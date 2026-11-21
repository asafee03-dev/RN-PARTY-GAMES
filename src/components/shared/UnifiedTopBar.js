import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { copyRoomCode } from '../../utils/clipboard';
import { shareGameLink } from '../../utils/shareUtils';
import storage from '../../utils/storage';
import { S } from '../../strings';
import { borders, colors, GameThemeProvider, radii, spacing, touch, useGameTheme } from '../../theme';
import { AppText, feedback, Icon, IconButton } from '../../ui';

/**
 * Top bar shown inside every game room (copy code, share link, rules, exit)
 * with the board-game look. Start side: room code + share; end side: rules,
 * exit. All targets >= 48dp, all icon-only buttons labeled.
 */
export default function UnifiedTopBar(props) {
  return (
    <GameThemeProvider game={props.variant || 'draw'}>
      <TopBarContent {...props} />
    </GameThemeProvider>
  );
}

function TopBarContent({
  roomCode,
  variant = 'draw',
  onExit,
  onRulesPress,
  showRules = true,
}) {
  const theme = useGameTheme();
  const insets = useSafeAreaInsets();
  const [playerName, setPlayerName] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const loadPlayerName = async () => {
      try {
        const savedName = await storage.getItem('playerName');
        if (savedName) setPlayerName(savedName);
      } catch (e) {
        console.warn('Could not load player name:', e);
      }
    };
    loadPlayerName();
  }, []);

  const handleCopyRoomCode = async () => {
    await copyRoomCode(roomCode);
    feedback.success();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareRoomLink = async () => {
    const inviter = playerName || 'Someone';
    await shareGameLink(variant, roomCode, inviter);
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, spacing.sm) }]}>
      {/* Start side: room code (tap to copy) + share */}
      <View style={styles.group}>
        <Pressable
          onPress={handleCopyRoomCode}
          onPressIn={() => feedback.tap()}
          accessibilityRole="button"
          accessibilityLabel={`${S.common.roomCode} ${roomCode}`}
          accessibilityHint={S.topBar.copyCodeHint}
          style={({ pressed }) => [styles.codeChip, { borderColor: theme.accent }, pressed && styles.pressed]}
        >
          <AppText variant="caption" color={colors.inkSoft} maxScale={1.3}>
            {S.topBar.codeLabel}
          </AppText>
          <AppText variant="title" color={theme.accentInk} maxScale={1.3} style={styles.code}>
            {roomCode}
          </AppText>
          <Icon name={copied ? 'check' : 'copy'} size={20} color={copied ? colors.success : theme.accentInk} />
        </Pressable>
        <IconButton icon="share" label={S.topBar.shareLink} onPress={handleShareRoomLink} size={touch.min - 4} />
      </View>

      {/* End side: rules, exit */}
      <View style={styles.group}>
        {showRules && onRulesPress && (
          <IconButton icon="rules" label={S.topBar.rules} onPress={onRulesPress} size={touch.min - 4} />
        )}
        <IconButton icon="exit" label={S.topBar.exit} onPress={onExit} variant="accent" size={touch.min - 4} />
      </View>

      {copied ? (
        <View style={styles.toast} accessibilityLiveRegion="polite" pointerEvents="none">
          <Icon name="checkCircle" size={18} color={colors.white} />
          <AppText variant="label" color={colors.white}>
            {S.topBar.codeCopied}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  codeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: touch.min,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radii.pill,
    borderWidth: borders.thick,
  },
  code: {
    letterSpacing: 2,
    fontVariant: ['tabular-nums'],
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  toast: {
    position: 'absolute',
    top: '100%',
    start: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.success,
    zIndex: 10,
  },
});
