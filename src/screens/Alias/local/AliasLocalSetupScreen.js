import React, { useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { S } from '../../../strings';
import { colors, radii, spacing, useGameTheme } from '../../../theme';
import { AppText, Button, Card, Icon, IconButton, PlayerChip, Screen, TextField, accessibleSurface, readableOn } from '../../../ui';
import { TEAM_COLORS } from '../../../logic/aliasLocal';
import storage from '../../../utils/storage';

const MAX_TEAMS = 6;
const makeTeam = (index, players = []) => ({
  name: S.alias.local.teamNameDefault(index + 1),
  color: TEAM_COLORS[index % TEAM_COLORS.length],
  players,
  draft: '',
});

/** Single phone Alias: enter teams and their players on this phone. */
export default function AliasLocalSetupScreen({ navigation, route }) {
  const theme = useGameTheme();
  const initial = route?.params?.teams;
  const [teams, setTeams] = useState(() =>
    initial ? initial.map((t) => ({ ...t, draft: '' })) : [makeTeam(0), makeTeam(1)]
  );
  const [goldenRounds, setGoldenRounds] = useState(!!route?.params?.goldenRounds);
  const [error, setError] = useState('');

  // Pre-fill the saved nickname as the first player (new games only)
  useEffect(() => {
    if (initial) return;
    let active = true;
    storage.getItem('playerName').then((name) => {
      if (!active || !name || !name.trim()) return;
      setTeams((prev) => (prev[0].players.length === 0 ? [{ ...prev[0], players: [name.trim()] }, ...prev.slice(1)] : prev));
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, [initial]);

  const update = (index, patch) => setTeams((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  const allPlayers = teams.flatMap((t) => t.players);

  const addPlayer = (index) => {
    const name = teams[index].draft.trim();
    if (!name) return;
    if (allPlayers.some((p) => p === name)) {
      setError(S.alias.local.duplicatePlayer);
      return;
    }
    setError('');
    update(index, { players: [...teams[index].players, name], draft: '' });
  };

  const removePlayer = (index, name) => update(index, { players: teams[index].players.filter((p) => p !== name) });

  const start = () => {
    const names = teams.map((t) => t.name.trim());
    if (teams.some((t) => t.players.length < 2)) {
      setError(S.alias.local.needPlayers);
      return;
    }
    if (new Set(names).size !== names.length || names.some((n) => !n)) {
      setError(S.alias.local.duplicateTeams);
      return;
    }
    setError('');
    navigation.navigate('AliasLocalGame', {
      teams: teams.map((t, i) => ({ name: names[i], color: t.color, players: t.players })),
      goldenRounds,
    });
  };

  return (
    <Screen
      header={
        <View style={styles.topBar}>
          <IconButton icon="back" label={S.local.back} onPress={() => navigation.goBack()} />
        </View>
      }
    >
      <View style={styles.titleBlock}>
        <AppText variant="display" align="center" accessibilityRole="header">
          {S.alias.local.setupTitle}
        </AppText>
        <AppText variant="subtitle" align="center" color={colors.inkSoft}>
          {S.alias.local.setupSubtitle}
        </AppText>
      </View>

      {teams.map((team, index) => {
        const surface = accessibleSurface(team.color);
        const fg = readableOn(surface);
        return (
          <View key={index} style={[styles.teamCard, { borderColor: surface }]}>
            <View style={[styles.teamHeader, { backgroundColor: surface }]}>
              <View style={styles.teamNumber}>
                <AppText variant="label" color={colors.ink} align="center" maxScale={1.3}>
                  {index + 1}
                </AppText>
              </View>
              <AppText variant="bodyStrong" color={fg} style={styles.flex} numberOfLines={1}>
                {team.name || S.alias.board.teamFallback(index + 1)}
              </AppText>
              <AppText variant="caption" color={fg}>
                {S.alias.local.playersCount(team.players.length)}
              </AppText>
              {teams.length > 2 ? (
                <IconButton
                  icon="trash"
                  label={S.alias.local.removeTeam(team.name)}
                  onPress={() => setTeams((prev) => prev.filter((_, i) => i !== index))}
                  size={44}
                />
              ) : null}
            </View>
            <View style={styles.teamBody}>
              <TextField label={S.alias.local.teamName} value={team.name} onChangeText={(t) => update(index, { name: t })} maxLength={20} />
              {team.players.length > 0 ? (
                <View style={styles.chips}>
                  {team.players.map((name) => (
                    <View key={name} style={styles.chipRow}>
                      <PlayerChip name={name} color={team.color} />
                      <IconButton icon="close" label={S.local.removePlayer(name)} onPress={() => removePlayer(index, name)} size={44} />
                    </View>
                  ))}
                </View>
              ) : null}
              <View style={styles.addRow}>
                <TextField
                  style={styles.flex}
                  value={team.draft}
                  onChangeText={(t) => update(index, { draft: t })}
                  placeholder={S.local.playerNamePlaceholder}
                  maxLength={20}
                  onSubmitEditing={() => addPlayer(index)}
                  returnKeyType="done"
                />
                <IconButton icon="plus" label={S.local.addPlayer} onPress={() => addPlayer(index)} variant="accent" />
              </View>
            </View>
          </View>
        );
      })}

      {teams.length < MAX_TEAMS ? (
        <Button
          title={S.alias.local.addTeam}
          icon="plus"
          variant="secondary"
          onPress={() => setTeams((prev) => [...prev, makeTeam(prev.length)])}
          fullWidth
        />
      ) : null}

      <Card style={styles.options}>
        <View style={styles.optionRow}>
          <Icon name="golden" size={22} color={theme.accentInk} />
          <AppText variant="bodyStrong" style={styles.flex}>
            {S.alias.setup.goldenRounds}
          </AppText>
          <Switch value={goldenRounds} onValueChange={setGoldenRounds} accessibilityLabel={S.alias.setup.goldenRounds} trackColor={{ false: colors.line, true: theme.accent }} thumbColor={colors.card} />
        </View>
      </Card>

      {error ? (
        <View style={styles.errorBox} accessibilityLiveRegion="polite">
          <Icon name="alert" size={20} color={colors.dangerDeep} />
          <AppText color={colors.dangerDeep} style={styles.flex}>
            {error}
          </AppText>
        </View>
      ) : null}

      <Button title={S.local.start} icon="play" onPress={start} fullWidth />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'flex-start', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  titleBlock: { gap: spacing.xs, paddingTop: spacing.md },
  teamCard: { borderRadius: radii.lg, borderWidth: 3, borderBottomWidth: 6, backgroundColor: colors.card, overflow: 'hidden' },
  teamHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  teamNumber: { width: 32, height: 32, borderRadius: radii.pill, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  teamBody: { gap: spacing.md, padding: spacing.md },
  chips: { gap: spacing.sm },
  chipRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  addRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  options: { gap: spacing.md },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.danger,
    backgroundColor: colors.dangerTint,
  },
});
