import React from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { ZoomIn, useReducedMotion } from 'react-native-reanimated';
import { S } from '../../strings';
import { colors, motion, radii, spacing } from '../../theme';
import { AppText, Icon, feedback } from '../../ui';
import { ASSASSIN, NEUTRAL, getTeamStyle } from './teamStyle';

const GRID_SIZE = 5; // 5x5 grid
const GAP = 6;

/**
 * The 5x5 word board. Same props as before.
 *
 * Every word type carries a second cue besides its color, shown on revealed
 * tiles (and, for the spymaster, on unrevealed ones too):
 *   red = flame, blue = drop, neutral = dash (dashed border), assassin = skull.
 * Guessers see unrevealed tiles as plain paper cards.
 * The grid is a flex layout, so in RTL it reads from the right like Hebrew
 * text (every player sees the same order).
 */
export default function CodenamesBoard({
  words,
  keyMap,
  revealedIndices,
  isSpymaster,
  onWordClick,
  canGuess,
  currentTeam // eslint-disable-line no-unused-vars
}) {
  const reducedMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  const available = Math.min(width, 560) - 2 * spacing.lg - 2 * spacing.sm;
  const size = Math.max(56, Math.min(96, Math.floor((available - (GRID_SIZE - 1) * GAP) / GRID_SIZE)));

  const describe = (color) => {
    if (color === 'red') return S.codenames.board.redWord;
    if (color === 'blue') return S.codenames.board.blueWord;
    if (color === 'black') return S.codenames.board.assassinWord;
    return S.codenames.board.neutralWord;
  };

  const look = (index) => {
    const color = keyMap[index];
    const isRevealed = revealedIndices.includes(index);

    if (color === 'red' || color === 'blue') {
      const t = getTeamStyle(color);
      if (isRevealed) return { bg: t.fill, edge: t.deep, text: colors.white, icon: t.icon, iconColor: colors.white, big: true };
      if (isSpymaster) return { bg: t.tint, edge: t.fill, text: colors.ink, icon: t.icon, iconColor: t.ink, border: t.fill };
    } else if (color === 'black') {
      if (isRevealed) return { bg: ASSASSIN.fill, edge: ASSASSIN.deep, text: colors.white, icon: ASSASSIN.icon, iconColor: colors.white, big: true };
      if (isSpymaster) return { bg: ASSASSIN.fill, edge: ASSASSIN.deep, text: colors.white, icon: ASSASSIN.icon, iconColor: colors.white };
    } else {
      if (isRevealed) return { bg: NEUTRAL.fill, edge: NEUTRAL.deep, text: colors.ink, icon: NEUTRAL.icon, iconColor: colors.inkSoft, big: true, dashed: true };
      if (isSpymaster) return { bg: colors.card, edge: NEUTRAL.deep, text: colors.ink, icon: NEUTRAL.icon, iconColor: colors.inkSoft, dashed: true };
    }
    // Guesser, not revealed: a plain paper card
    return { bg: colors.card, edge: colors.cardboardDeep, text: colors.ink };
  };

  const isClickable = (index) => canGuess && !revealedIndices.includes(index) && !isSpymaster;

  return (
    <View style={styles.container}>
      <View style={[styles.grid, { width: GRID_SIZE * size + (GRID_SIZE - 1) * GAP, gap: GAP }]}>
        {words.map((word, index) => {
          const isRevealed = revealedIndices.includes(index);
          const l = look(index);
          const clickable = isClickable(index);
          const status = isRevealed
            ? `${S.codenames.board.revealed}, ${describe(keyMap[index])}`
            : isSpymaster
              ? describe(keyMap[index])
              : '';

          return (
            <Pressable
              key={index}
              disabled={!clickable}
              onPress={() => {
                if (!clickable) return;
                feedback.reveal();
                onWordClick(index);
              }}
              accessibilityRole="button"
              accessibilityLabel={status ? `${word}, ${status}` : word}
              accessibilityState={{ disabled: !clickable }}
              style={({ pressed }) => [
                styles.tile,
                {
                  width: size,
                  height: size,
                  backgroundColor: l.bg,
                  borderColor: l.border || l.edge,
                  borderBottomColor: l.edge,
                  borderStyle: l.dashed ? 'dashed' : 'solid',
                },
                clickable && styles.clickable,
                pressed && clickable && styles.pressed,
              ]}
            >
              {l.icon ? (
                <Animated.View
                  key={isRevealed ? 'revealed' : 'hint'}
                  entering={isRevealed && !reducedMotion ? ZoomIn.duration(motion.base) : undefined}
                  style={l.big ? styles.iconBig : styles.iconCorner}
                >
                  <Icon name={l.icon} size={l.big ? 22 : 15} color={l.iconColor} />
                </Animated.View>
              ) : null}
              <AppText
                variant="label"
                color={l.text}
                align="center"
                numberOfLines={3}
                maxScale={1.25}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                style={styles.word}
              >
                {word}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.sm,
    alignItems: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tile: {
    borderRadius: radii.md,
    borderWidth: 2,
    borderBottomWidth: 5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    paddingTop: 2,
  },
  clickable: {
    borderColor: colors.cardboardDeep,
  },
  pressed: {
    transform: [{ translateY: 2 }],
    borderBottomWidth: 3,
  },
  word: {
    fontSize: 13,
    lineHeight: 15,
    fontFamily: 'Rubik-Medium',
  },
  iconBig: {
    marginBottom: 1,
  },
  iconCorner: {
    position: 'absolute',
    top: 2,
    end: 4,
    opacity: 0.9,
  },
});
