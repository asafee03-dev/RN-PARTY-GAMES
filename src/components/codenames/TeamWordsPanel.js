import React from 'react';
import { StyleSheet, View } from 'react-native';
import { S } from '../../strings';
import { colors, radii, spacing } from '../../theme';
import { AppText, Badge, Card, Icon } from '../../ui';
import { getTeamStyle } from './teamStyle';

/**
 * The spymaster's list of their team's words; revealed words are crossed out
 * with a check (not just dimmed). Same props as before.
 */
export default function TeamWordsPanel({
  words,
  keyMap,
  revealedIndices,
  teamColor,
  compact = false // eslint-disable-line no-unused-vars
}) {
  const t = getTeamStyle(teamColor);
  const teamWords = [];

  keyMap.forEach((color, index) => {
    if (color === teamColor) {
      teamWords.push({
        word: words[index],
        index: index,
        revealed: revealedIndices.includes(index)
      });
    }
  });

  const revealedCount = teamWords.filter(w => w.revealed).length;
  const totalCount = teamWords.length;

  return (
    <Card padding="md" style={[styles.card, { borderColor: t.fill }]}>
      <View style={styles.header}>
        <Icon name={t.icon} size={22} color={t.ink} />
        <AppText variant="subtitle" color={t.ink} style={styles.flex}>
          {S.codenames.teams.teamWords}
        </AppText>
        <Badge label={`${revealedCount}/${totalCount}`} icon="check" tone="neutral" />
      </View>
      <View style={styles.chips}>
        {teamWords.map((item, idx) => (
          <View
            key={idx}
            accessible
            accessibilityLabel={item.revealed ? `${item.word}, ${S.codenames.board.revealed}` : item.word}
            style={[styles.chip, item.revealed && styles.chipDone]}
          >
            {item.revealed ? <Icon name="check" size={16} color={colors.inkSoft} /> : null}
            <AppText
              variant="label"
              color={item.revealed ? colors.inkSoft : colors.ink}
              style={item.revealed && styles.struck}
            >
              {item.word}
            </AppText>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  card: {
    gap: spacing.sm,
    borderWidth: 2.5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  chipDone: {
    backgroundColor: colors.cardboard,
    borderStyle: 'dashed',
  },
  struck: {
    textDecorationLine: 'line-through',
  },
});
