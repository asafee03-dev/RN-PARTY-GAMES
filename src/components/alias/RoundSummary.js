import React from 'react';
import { StyleSheet, View } from 'react-native';
import { S } from '../../strings';
import { borders, colors, radii, spacing } from '../../theme';
import { AppText, Badge, Button, Card, Icon, TeamPickButton } from '../../ui';

/**
 * End-of-round summary with corrections. Same props as before:
 * - regular words can be flipped correct <-> skipped
 * - the last word and golden words are reassigned to a team (or nobody)
 * - the playing team presses "next"; everyone else waits
 */
export default function RoundSummary({
  room,
  currentTeam,
  isMyTurn,
  onToggleCardStatus,
  onChangeLastWordTeam,
  onChangeGoldenRoundTeam,
  onFinishRound
}) {
  const progress = {
    startPos: room.round_start_position || currentTeam.position,
    currentPos: currentTeam.position,
    moved: currentTeam.position - (room.round_start_position || currentTeam.position)
  };

  const renderTeamSelector = (card, index, onChange) => (
    <View style={styles.teamSelector}>
      <AppText variant="label" color={colors.inkSoft}>
        {S.alias.summary.whoGuessed}
      </AppText>
      {room.teams.map((team, teamIndex) => (
        <TeamPickButton
          key={teamIndex}
          index={teamIndex}
          name={team.name}
          color={team.color}
          selected={card.teamThatGuessed === teamIndex}
          onPress={() => onChange(index, teamIndex)}
        />
      ))}
      <Button
        title={S.alias.summary.skip}
        icon="skip"
        variant={card.teamThatGuessed === null ? 'primary' : 'secondary'}
        size="sm"
        onPress={() => onChange(index, null)}
        fullWidth
      />
    </View>
  );

  return (
    <View style={styles.container}>
      <Card tone="tint" style={styles.header}>
        <AppText variant="label" color={colors.inkSoft} align="center" accessibilityRole="header">
          {S.alias.summary.title}
        </AppText>
        <AppText variant="heading" align="center">
          {currentTeam.name}
        </AppText>
        <View style={styles.stats}>
          <Badge label={S.alias.summary.wordsFound(room.current_round_score)} icon="check" tone="success" />
          <Badge label={S.alias.summary.position(currentTeam.position + 1)} icon="pawn" tone="neutral" />
          <Badge
            label={S.alias.summary.progress(progress.moved)}
            icon={progress.moved >= 0 ? 'plus' : 'minus'}
            tone={progress.moved >= 0 ? 'accent' : 'danger'}
          />
        </View>
      </Card>

      {/* Cards list */}
      {room.used_cards && room.used_cards.map((card, index) => {
        const canToggle = !card.isLastWord && !card.isGoldenWord;
        const isCorrect = card.status === 'correct';

        return (
          <Card
            key={index}
            padding="md"
            style={[styles.wordCard, card.isGoldenWord && styles.goldenCard]}
          >
            <View style={styles.cardHeader}>
              <AppText variant="label" color={colors.inkSoft}>
                #{card.cardNumber}
              </AppText>
              {card.isLastWord ? <Badge label={S.alias.summary.lastWord} icon="timer" tone="neutral" /> : null}
              {card.isGoldenWord ? <Badge label={S.alias.summary.goldenWord} icon="golden" tone="gold" /> : null}
              <View style={styles.flex} />
              <Badge
                label={isCorrect ? S.alias.summary.correctBadge : S.alias.summary.skippedBadge}
                icon={isCorrect ? 'check' : 'close'}
                tone={isCorrect ? 'success' : 'danger'}
              />
            </View>

            <AppText variant="title" style={!isCorrect && styles.skippedWord}>
              {card.words || card.word || ''}
            </AppText>

            {/* Last word / golden word - can change team */}
            {card.isLastWord && renderTeamSelector(card, index, onChangeLastWordTeam)}
            {card.isGoldenWord && renderTeamSelector(card, index, onChangeGoldenRoundTeam)}

            {/* Toggle button for regular cards */}
            {canToggle && (
              <Button
                title={isCorrect ? S.alias.summary.toSkipped : S.alias.summary.toCorrect}
                icon={isCorrect ? 'close' : 'check'}
                variant="secondary"
                size="sm"
                onPress={() => onToggleCardStatus(index)}
                fullWidth
              />
            )}
          </Card>
        );
      })}

      {isMyTurn ? (
        <Button title={S.alias.summary.next} icon="forward" iconPosition="end" onPress={onFinishRound} fullWidth />
      ) : (
        <View style={styles.waiting}>
          <Icon name="hourglass" size={22} color={colors.inkSoft} />
          <AppText color={colors.inkSoft} style={styles.flexShrink}>
            {S.alias.summary.waitingFinish(currentTeam?.name)}
          </AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  flex: {
    flex: 1,
  },
  flexShrink: {
    flexShrink: 1,
  },
  header: {
    gap: spacing.sm,
  },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  wordCard: {
    gap: spacing.sm,
  },
  goldenCard: {
    backgroundColor: colors.goldTint,
    borderColor: colors.gold,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  skippedWord: {
    textDecorationLine: 'line-through',
    color: colors.inkSoft,
  },
  teamSelector: {
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: borders.hairline,
    borderColor: colors.line,
    backgroundColor: colors.paper,
  },
  waiting: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
});
