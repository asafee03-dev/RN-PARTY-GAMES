import React, { useState, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { S } from '../../strings';
import { colors, radii, spacing, useGameTheme } from '../../theme';
import { AppText, Button, Card, Icon, IconButton } from '../../ui';

/**
 * Clue display for everyone, number picker + submit for the playing
 * spymaster, and a waiting note otherwise. Same props and logic as before.
 */
export default function ClueInput({
  currentClue,
  isMyTurn,
  isSpymaster,
  room,
  onClueSubmit,
  compact = false, // eslint-disable-line no-unused-vars
  maxClueNumber = 9
}) {
  const theme = useGameTheme();
  const [clueNumber, setClueNumber] = useState(1);

  // Reset clue number when max changes
  useEffect(() => {
    if (maxClueNumber > 0) {
      setClueNumber(prev => Math.min(prev, maxClueNumber));
    }
  }, [maxClueNumber]);

  const handleIncrement = () => {
    if (clueNumber < maxClueNumber) {
      setClueNumber(clueNumber + 1);
    }
  };

  const handleDecrement = () => {
    if (clueNumber > 1) {
      setClueNumber(clueNumber - 1);
    }
  };

  const handleSubmit = () => {
    if (clueNumber < 1 || clueNumber > maxClueNumber) {
      return;
    }
    onClueSubmit(clueNumber);
  };

  if (currentClue?.number) {
    return (
      <Card tone="tint" style={styles.row}>
        <View style={[styles.number, { backgroundColor: theme.accent, borderColor: theme.accentDeep }]}>
          <AppText variant="display" color={colors.white} align="center" maxScale={1.3}>
            {currentClue.number}
          </AppText>
        </View>
        <View style={styles.flex}>
          <AppText variant="label" color={colors.inkSoft}>
            {S.codenames.clue.current}
          </AppText>
          <AppText variant="title">{S.codenames.clue.guessesRemaining(room.guesses_remaining)}</AppText>
        </View>
      </Card>
    );
  }

  if (isMyTurn && isSpymaster) {
    const maxValue = Math.max(1, maxClueNumber);
    const minValue = 1;

    return (
      <Card tone="tint" style={styles.input}>
        <View style={styles.titleRow}>
          <Icon name="clue" size={24} color={theme.accentInk} />
          <AppText variant="title" color={theme.accentInk} accessibilityRole="header">
            {S.codenames.clue.giveClue}
          </AppText>
        </View>

        <View style={styles.stepper}>
          <IconButton icon="minus" label={S.codenames.clue.decrease} onPress={handleDecrement} disabled={clueNumber <= minValue} />
          <View
            style={[styles.number, { backgroundColor: theme.accent, borderColor: theme.accentDeep }]}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={String(clueNumber)}
          >
            <AppText variant="display" color={colors.white} align="center" maxScale={1.3}>
              {clueNumber}
            </AppText>
          </View>
          <IconButton icon="plus" label={S.codenames.clue.increase} onPress={handleIncrement} disabled={clueNumber >= maxValue} />
        </View>

        <Button title={S.codenames.clue.submit} icon="forward" iconPosition="end" onPress={handleSubmit} fullWidth />
        <AppText variant="caption" color={colors.inkSoft} align="center">
          {S.codenames.clue.hint(maxValue)}
        </AppText>
      </Card>
    );
  }

  return (
    <View style={styles.waiting}>
      <Icon name="hourglass" size={22} color={colors.inkSoft} />
      <AppText color={colors.inkSoft} style={styles.flex}>
        {isMyTurn ? S.codenames.clue.waitingSpymaster : S.codenames.clue.otherTeamTurn}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  input: {
    gap: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  number: {
    width: 72,
    height: 72,
    borderRadius: radii.pill,
    borderWidth: 3,
    borderBottomWidth: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waiting: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
});
