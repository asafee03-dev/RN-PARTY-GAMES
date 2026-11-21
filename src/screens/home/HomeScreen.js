import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { S } from '../../strings';
import { borders, colors, depth, GameThemeProvider, motion, radii, spacing, useGameTheme } from '../../theme';
import { AppText, feedback, Icon, IconButton, Screen } from '../../ui';

// Order and navigation targets are unchanged from the previous home screen
const GAMES = [
  { id: 'alias', page: 'Alias' },
  { id: 'codenames', page: 'Codenames' },
  { id: 'spy', page: 'Spy' },
  { id: 'frequency', page: 'Frequency' },
  { id: 'draw', page: 'Draw' },
];

/**
 * A game shown as a chunky game box: tinted lid with the game's emblem,
 * sitting on a darker "box side" that compresses when pressed.
 */
function GameBox({ game, index, onPress }) {
  const theme = useGameTheme();
  const reducedMotion = useReducedMotion();
  const pressed = useSharedValue(0);
  const text = S.home.games[game.id];

  const faceStyle = useAnimatedStyle(() => ({ transform: [{ translateY: pressed.value * depth.press }] }));
  const animateTo = (v) => {
    pressed.value = reducedMotion ? v : withTiming(v, { duration: motion.press });
  };

  return (
    <Animated.View entering={reducedMotion ? undefined : FadeInDown.delay(80 + index * 70).duration(motion.slow)}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          animateTo(1);
          feedback.tap();
        }}
        onPressOut={() => animateTo(0)}
        accessibilityRole="button"
        accessibilityLabel={`${text.name}. ${text.description}`}
        accessibilityHint={S.home.play}
      >
        <View style={[styles.boxSide, { backgroundColor: theme.accentDeep }]}>
          <Animated.View style={[styles.boxLid, { backgroundColor: theme.tint, borderColor: theme.accent }, faceStyle]}>
            <View style={[styles.emblem, { backgroundColor: theme.accent, borderColor: theme.accentDeep }]}>
              <Icon name={game.id} size={36} color={theme.onAccent} />
            </View>

            <View style={styles.boxText}>
              <AppText variant="title" color={theme.accentInk}>
                {text.name}
              </AppText>
              <AppText variant="body" color={colors.ink}>
                {text.description}
              </AppText>
            </View>

            <View style={[styles.playButton, { backgroundColor: theme.accent }]}>
              <Icon name="forward" size={26} color={theme.onAccent} />
            </View>
          </Animated.View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function HomeScreen({ navigation }) {
  const reducedMotion = useReducedMotion();

  const handleGameClick = (game) => {
    // Navigate to parent navigator (AppNavigator) - same as before
    const parent = navigation.getParent();
    if (parent) {
      parent.navigate(game.page);
    } else {
      navigation.navigate(game.page);
    }
  };

  return (
    <Screen
      contentStyle={styles.content}
      header={
        <View style={styles.topBar}>
          <IconButton icon="settings" label={S.home.settings} onPress={() => navigation.navigate('Settings')} />
        </View>
      }
    >
      <Animated.View entering={reducedMotion ? undefined : FadeInDown.duration(motion.slow)} style={styles.header}>
        <Image
          source={require('../../../assets/images/partygameslogo.png')}
          style={styles.logo}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
          accessible={false}
        />
        <AppText variant="display" align="center" accessibilityRole="header">
          {S.home.title}
        </AppText>
        <AppText variant="subtitle" color={colors.inkSoft} align="center">
          {S.home.subtitle}
        </AppText>
      </Animated.View>

      <View style={styles.games}>
        {GAMES.map((game, index) => (
          <GameThemeProvider key={game.id} game={game.id}>
            <GameBox game={game} index={index} onPress={() => handleGameClick(game)} />
          </GameThemeProvider>
        ))}
      </View>

      <View style={styles.footer}>
        <Icon name="dice" size={22} color={colors.inkSoft} />
        <AppText variant="label" color={colors.inkSoft}>
          {S.home.moreComing}
        </AppText>
        <Icon name="party" size={22} color={colors.inkSoft} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.xl,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-start', // start side (right in RTL)
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  header: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.md,
  },
  logo: {
    width: 112,
    height: 112,
    marginBottom: spacing.sm,
    // The PNG has a solid cream background - frame it as rounded box art
    borderRadius: radii.xl,
    borderWidth: borders.thick,
    borderColor: colors.line,
  },
  games: {
    gap: spacing.lg,
  },
  boxSide: {
    borderRadius: radii.lg,
    paddingBottom: 6, // The darker "side of the box"
  },
  boxLid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 112,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: borders.thick,
  },
  emblem: {
    width: 68,
    height: 68,
    borderRadius: radii.md,
    borderWidth: 2,
    borderBottomWidth: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxText: {
    flex: 1,
    gap: 2,
  },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
    alignSelf: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.pill,
    borderWidth: borders.card,
    borderColor: colors.line,
  },
});
