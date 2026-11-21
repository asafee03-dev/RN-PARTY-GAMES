import React from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { S } from '../strings';
import { borders, colors, radii, spacing, useGameTheme } from '../theme';
import AppText from './AppText';
import Button from './Button';
import Card from './Card';
import Icon from './Icon';
import Screen from './Screen';
import TextField from './TextField';

/**
 * The shared "create or join a room" screen used by every game's home.
 * Purely presentational: each game screen keeps its own state, handlers
 * and Firestore code, and passes them in.
 *
 * Wrap in <GameThemeProvider game="..."> (the game navigators do this) so
 * colors follow the game.
 */
export default function GameEntryLayout({
  icon,
  title,
  subtitle,
  playerName,
  onChangePlayerName,
  roomCode,
  onChangeRoomCode,
  roomCodeMaxLength = 4,
  roomCodeKeyboard = 'default',
  roomCodeAutoCapitalize = 'characters',
  error,
  isCreating = false,
  onCreate,
  onJoin,
  onBack,
  steps = [],
  children, // Optional extra content (e.g. game-specific options) above the create button
  footer,
}) {
  const theme = useGameTheme();

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <Screen footer={footer} contentStyle={styles.content}>
        <Button
          title={S.common.backToGames}
          icon="back"
          variant="ghost"
          size="sm"
          onPress={onBack}
          style={styles.back}
        />

        {/* Hero: game emblem + name */}
        <View style={styles.hero}>
          <View style={[styles.emblem, { backgroundColor: theme.accent, borderColor: theme.accentDeep }]}>
            <Icon name={icon} size={48} color={theme.onAccent} />
          </View>
          <AppText variant="display" color={theme.accentInk} align="center" accessibilityRole="header">
            {title}
          </AppText>
          {subtitle ? (
            <AppText variant="subtitle" color={colors.inkSoft} align="center">
              {subtitle}
            </AppText>
          ) : null}
        </View>

        {error ? (
          <View style={styles.errorBanner} accessibilityLiveRegion="assertive" accessibilityRole="alert">
            <Icon name="alert" size={22} color={colors.dangerDeep} />
            <AppText variant="bodyStrong" color={colors.dangerDeep} style={styles.flexShrink}>
              {error}
            </AppText>
          </View>
        ) : null}

        {/* Create */}
        <Card style={styles.card}>
          <TextField
            label={S.entry.yourName}
            placeholder={S.entry.namePlaceholder}
            value={playerName}
            onChangeText={onChangePlayerName}
            autoCapitalize="none"
            autoComplete="name"
            textContentType="nickname"
            returnKeyType="done"
          />
          {children}
          <Button
            title={isCreating ? S.entry.creating : S.entry.createGame}
            icon="play"
            onPress={onCreate}
            loading={isCreating}
            fullWidth
          />
        </Card>

        <View style={styles.divider} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={styles.dividerLine} />
          <AppText variant="label" color={colors.inkSoft}>
            {S.common.or}
          </AppText>
          <View style={styles.dividerLine} />
        </View>

        {/* Join */}
        <Card style={styles.card}>
          <AppText variant="title">{S.entry.joinTitle}</AppText>
          <TextField
            label={S.entry.roomCode}
            placeholder={S.entry.roomCodePlaceholder}
            value={roomCode}
            onChangeText={onChangeRoomCode}
            maxLength={roomCodeMaxLength}
            keyboardType={roomCodeKeyboard}
            autoCapitalize={roomCodeAutoCapitalize}
            autoCorrect={false}
            // Wide spacing for the code itself only - it would pull the Hebrew placeholder apart
            inputStyle={roomCode ? styles.codeInput : styles.codeInputEmpty}
          />
          <Button title={S.entry.joinGame} icon="join" variant="secondary" onPress={onJoin} fullWidth />
        </Card>

        {/* How to play */}
        {steps.length > 0 ? (
          <Card tone="tint" style={styles.card}>
            <View style={styles.howHeader}>
              <Icon name="rules" size={24} color={theme.accentInk} />
              <AppText variant="title" color={theme.accentInk} accessibilityRole="header">
                {S.entry.howToPlay}
              </AppText>
            </View>
            {steps.map((step, i) => (
              <View key={i} style={styles.step}>
                <View style={[styles.stepToken, { backgroundColor: theme.accent }]}>
                  <AppText variant="label" color={theme.onAccent} align="center" maxScale={1.3}>
                    {i + 1}
                  </AppText>
                </View>
                <AppText variant="body" style={styles.flexShrink}>
                  {step}
                </AppText>
              </View>
            ))}
          </Card>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  flexShrink: {
    flexShrink: 1,
  },
  content: {
    gap: spacing.lg,
  },
  back: {
    alignSelf: 'flex-start', // "start" side - right in RTL
  },
  hero: {
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  emblem: {
    width: 96,
    height: 96,
    borderRadius: radii.xl,
    borderWidth: 3,
    borderBottomWidth: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.dangerTint,
    borderWidth: borders.card,
    borderColor: colors.danger,
  },
  card: {
    gap: spacing.lg,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.line,
  },
  codeInput: {
    fontSize: 24,
    letterSpacing: 6,
    textAlign: 'center',
  },
  codeInputEmpty: {
    textAlign: 'center',
  },
  howHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  stepToken: {
    width: 30,
    height: 30,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
});
