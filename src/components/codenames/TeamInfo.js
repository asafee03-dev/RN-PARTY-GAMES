import React from 'react';
import { StyleSheet, View } from 'react-native';
import { S } from '../../strings';
import { colors, radii, spacing } from '../../theme';
import { AppText, Badge, Icon } from '../../ui';
import { getTeamStyle } from './teamStyle';

/**
 * Both teams side by side. Same props as before. A team is identified by its
 * icon (flame / drop) and its name as well as its color; whose turn it is
 * shows as a badge with text, not just a border.
 */
export default function TeamInfo({
  redTeam,
  blueTeam,
  currentTurn,
  redWordsLeft,
  blueWordsLeft,
  currentPlayerName,
  compact = false // eslint-disable-line no-unused-vars
}) {
  const getPlayerRole = (team) => {
    if (team.spymaster === currentPlayerName) return 'spymaster';
    if (team.guessers.includes(currentPlayerName)) return 'guesser';
    return null;
  };

  const renderTeam = (team, color, wordsLeft, isCurrentTurn) => {
    const t = getTeamStyle(color);
    const role = getPlayerRole(team);
    const name = color === 'red' ? S.codenames.teams.red : S.codenames.teams.blue;

    return (
      <View
        key={color}
        style={[styles.card, { borderColor: t.fill }, isCurrentTurn && { backgroundColor: t.tint, borderWidth: 3 }]}
        accessible
        accessibilityLabel={[name, S.codenames.teams.wordsLeft(wordsLeft), isCurrentTurn && S.codenames.teams.theirTurn, role && S.codenames.teams[role]].filter(Boolean).join(', ')}
      >
        <View style={[styles.header, { backgroundColor: t.fill }]}>
          <Icon name={t.icon} size={22} color={colors.white} />
          <AppText variant="bodyStrong" color={colors.white} style={styles.flex} numberOfLines={1}>
            {name}
          </AppText>
        </View>
        <View style={styles.body}>
          <View style={styles.countRow}>
            <AppText variant="heading" color={t.ink} maxScale={1.3}>
              {wordsLeft}
            </AppText>
            <AppText variant="caption" color={colors.inkSoft} style={styles.flex}>
              {S.codenames.teams.wordsUnit}
            </AppText>
          </View>
          {isCurrentTurn ? <Badge label={S.codenames.teams.theirTurn} icon="play" tone="neutral" /> : null}
          {role ? (
            <Badge
              label={`${S.codenames.teams[role]} · ${S.codenames.teams.youAreHere}`}
              icon={role === 'spymaster' ? 'spy' : 'players'}
              tone="gold"
            />
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {renderTeam(redTeam, 'red', redWordsLeft, currentTurn === 'red')}
      {renderTeam(blueTeam, 'blue', blueWordsLeft, currentTurn === 'blue')}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  card: {
    flex: 1,
    borderRadius: radii.lg,
    borderWidth: 2,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  body: {
    gap: spacing.xs,
    padding: spacing.md,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
});
