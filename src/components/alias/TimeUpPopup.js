import React from 'react';
import { StyleSheet, View } from 'react-native';
import { S } from '../../strings';
import { colors, spacing } from '../../theme';
import { AppText, Button, Card, Icon, TeamPickButton } from '../../ui';

/**
 * Time is up: the playing team picks who guessed the last word.
 * Same props as before (inline card, not a modal).
 */
export default function TimeUpPopup({
  isMyTurn,
  room,
  onCorrect,
  onSkip
}) {
  if (!isMyTurn) return null;

  return (
    <Card style={styles.card}>
      <View style={styles.titleRow}>
        <Icon name="timer" size={26} color={colors.danger} />
        <AppText variant="title" color={colors.dangerDeep} accessibilityRole="header">
          {S.alias.timeUp.title}
        </AppText>
      </View>
      <AppText color={colors.inkSoft}>{S.alias.timeUp.subtitle}</AppText>

      <View style={styles.buttons}>
        {room.teams.map((team, index) => (
          <TeamPickButton
            key={index}
            index={index}
            name={team.name}
            color={team.color}
            onPress={() => onCorrect(index)}
          />
        ))}
        <Button title={S.alias.timeUp.skip} icon="skip" variant="secondary" size="sm" onPress={onSkip} fullWidth />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    borderColor: colors.danger,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  buttons: {
    gap: spacing.sm,
  },
});
