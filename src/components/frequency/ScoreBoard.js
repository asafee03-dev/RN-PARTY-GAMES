import React from 'react';
import { StyleSheet, View } from 'react-native';
import { S } from '../../strings';
import { borders, colors, radii, spacing, useGameTheme } from '../../theme';
import { AppText, Badge, Card, Icon } from '../../ui';

const WIN_SCORE = 10;

const formatScore = (score) => (Number.isInteger(score) ? String(score) : Number(score || 0).toFixed(1));

/**
 * Frequency scoreboard: active players by score, the current clue giver
 * marked with a "their turn" badge (icon + text), and a progress bar to 10.
 * Same props as before: players, currentTurnIndex.
 */
export default function ScoreBoard({ players, currentTurnIndex }) {
  const theme = useGameTheme();
  const activePlayers = (players || []).filter((p) => p && p.name && p.active !== false);
  const sortedPlayers = [...activePlayers].sort((a, b) => b.score - a.score);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Icon name="trophy" size={22} color={theme.accentInk} />
        <AppText variant="title" color={theme.accentInk} accessibilityRole="header">
          {S.frequency.scoreboard.title}
        </AppText>
      </View>

      {sortedPlayers.map((player, idx) => {
        const isCurrentTurn = players[currentTurnIndex]?.name === player.name;
        const progress = Math.min((player.score || 0) / WIN_SCORE, 1);

        return (
          <View
            key={player.name}
            style={[styles.row, isCurrentTurn && { backgroundColor: theme.tint, borderColor: theme.accent }]}
            accessible
            accessibilityLabel={`${idx + 1}. ${player.name}, ${formatScore(player.score)}${isCurrentTurn ? ', ' + S.frequency.scoreboard.theirTurn : ''}`}
          >
            <View style={[styles.rank, idx === 0 && (player.score || 0) > 0 && styles.rankLeader]}>
              <AppText variant="label" color={colors.ink} align="center" maxScale={1.3}>
                {idx + 1}
              </AppText>
            </View>

            <View style={styles.middle}>
              <View style={styles.nameRow}>
                <View style={[styles.dot, { backgroundColor: player.color || theme.accent }]} />
                <AppText variant="bodyStrong" numberOfLines={1} style={styles.name}>
                  {player.name}
                </AppText>
                {isCurrentTurn ? <Badge label={S.frequency.scoreboard.theirTurn} icon="clue" tone="accent" /> : null}
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: theme.accent }]} />
              </View>
            </View>

            <AppText variant="title" color={theme.accentInk} align="end" maxScale={1.3} style={styles.score}>
              {formatScore(player.score)}
            </AppText>
          </View>
        );
      })}

      <View style={styles.footer}>
        <Icon name="finish" size={18} color={colors.inkSoft} />
        <AppText variant="caption" color={colors.inkSoft}>
          {S.frequency.scoreboard.goal}
        </AppText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: borders.card,
    borderColor: colors.line,
    backgroundColor: colors.paper,
  },
  rank: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardboard,
  },
  rankLeader: {
    backgroundColor: colors.gold,
  },
  middle: {
    flex: 1,
    gap: spacing.xs,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  name: {
    flexShrink: 1,
  },
  track: {
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.cardboard,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  fill: {
    height: '100%',
    borderRadius: radii.pill,
  },
  score: {
    minWidth: 40,
    fontVariant: ['tabular-nums'],
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
});
