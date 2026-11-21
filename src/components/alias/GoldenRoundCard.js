import React from 'react';
import { StyleSheet, View } from 'react-native';
import { S } from '../../strings';
import { colors, radii, spacing } from '../../theme';
import { AppText, Badge, Button, Icon, TeamPickButton } from '../../ui';
import AliasTimer from './AliasTimer';

/**
 * Golden round: every team can guess; the first to tap wins the point.
 * Same props as before.
 */
export default function GoldenRoundCard({
  word,
  teams,
  onTeamGuess,
  canInteract,
  timerComponent,
  showWord = true,
  startTime,
  onTimeUp
}) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Badge label={S.alias.golden.badge} icon="golden" tone="gold" />
        <AppText color={colors.inkSoft}>{S.alias.golden.subtext}</AppText>
      </View>

      {timerComponent || (
        <AliasTimer duration={60} startTime={startTime} onTimeUp={onTimeUp} compact={false} />
      )}

      {showWord && word && (
        <View style={styles.wordBox}>
          <AppText variant="display" align="center" maxScale={1.4}>
            {word}
          </AppText>
        </View>
      )}

      {canInteract && (
        <View style={styles.teams}>
          {teams.map((team, teamIdx) => (
            <TeamPickButton
              key={teamIdx}
              index={teamIdx}
              name={team.name}
              color={team.color}
              onPress={() => onTeamGuess(teamIdx)}
            />
          ))}
          <Button title={S.alias.golden.skip} icon="skip" variant="secondary" size="sm" onPress={() => onTeamGuess(null)} fullWidth />
        </View>
      )}

      {!canInteract && (
        <View style={styles.waiting}>
          <Icon name="hourglass" size={22} color={colors.inkSoft} />
          <AppText color={colors.inkSoft}>{S.alias.golden.waiting}</AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.xl,
    borderWidth: 3,
    borderBottomWidth: 7,
    borderColor: colors.gold,
    backgroundColor: colors.goldTint,
  },
  header: {
    gap: spacing.sm,
  },
  wordBox: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.gold,
  },
  teams: {
    gap: spacing.sm,
  },
  waiting: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
});
