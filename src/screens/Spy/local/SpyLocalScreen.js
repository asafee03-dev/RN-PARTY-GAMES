import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../firebase';
import { S } from '../../../strings';
import { borders, colors, radii, spacing, useGameTheme } from '../../../theme';
import { AppText, Badge, Button, Card, Icon, IconButton, PlayerChip, Screen, TextField, TimerDisplay, feedback } from '../../../ui';
import { GAME_SECONDS, dealSpyGame, maxSpiesFor } from '../../../logic/spyLocal';
import { confirmAction } from '../../../utils/gameSync';
import storage from '../../../utils/storage';

/**
 * Single phone Spy. Everything happens on this phone (no room):
 * setup -> deal (one face-down card per player) -> game clock -> reveal.
 * No guess entry and no location list in this mode.
 */
export default function SpyLocalScreen({ navigation }) {
  const theme = useGameTheme();
  const [phase, setPhase] = useState('setup'); // setup | loading | deal | play | end
  const [names, setNames] = useState([]);
  const [draft, setDraft] = useState('');
  const [numSpies, setNumSpies] = useState(1);
  const [mode, setMode] = useState('locations');
  const [error, setError] = useState('');
  const [deal, setDeal] = useState(null);
  const [dealIndex, setDealIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [remaining, setRemaining] = useState(GAME_SECONDS);
  const startedAtRef = useRef(0);

  // Pre-fill the saved nickname as the first player
  useEffect(() => {
    let active = true;
    storage.getItem('playerName').then((name) => {
      if (active && name && name.trim()) setNames((prev) => (prev.length === 0 ? [name.trim()] : prev));
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Game clock (display only; the game ends when the group presses "end")
  useEffect(() => {
    if (phase !== 'play') return undefined;
    const tick = () => setRemaining(Math.max(0, GAME_SECONDS - Math.floor((Date.now() - startedAtRef.current) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [phase]);

  const maxSpies = maxSpiesFor(names.length);
  const spies = Math.min(numSpies, maxSpies);

  const addPlayer = () => {
    const name = draft.trim();
    if (!name) return;
    if (names.includes(name)) {
      setError(S.spy.local.duplicatePlayer);
      return;
    }
    setError('');
    setNames([...names, name]);
    setDraft('');
  };

  const exitToHome = () => {
    const parent = navigation.getParent();
    if (parent) parent.reset({ index: 0, routes: [{ name: 'Home' }] });
    else navigation.navigate('Home');
  };

  const startDeal = async () => {
    if (names.length < 3) {
      setError(S.spy.local.needThree);
      return;
    }
    setError('');
    setPhase('loading');
    try {
      let content;
      if (mode === 'locations') {
        const snapshot = await getDocs(collection(db, 'SpyLocation'));
        const valid = [];
        snapshot.forEach((d) => {
          const data = d.data();
          if (data && data.location && Array.isArray(data.roles) && data.roles.length > 0) valid.push(data);
        });
        if (valid.length === 0) throw new Error(S.spy.room.noLocations);
        content = { location: valid[Math.floor(Math.random() * valid.length)] };
      } else {
        const words = [];
        const snapshot = await getDocs(collection(db, 'WordCard'));
        snapshot.forEach((d) => {
          const w = d.data()?.word;
          if (typeof w === 'string' && w.trim()) words.push(w.trim());
        });
        if (words.length === 0) throw new Error(S.spy.room.noWords);
        content = { word: words[Math.floor(Math.random() * words.length)] };
      }
      setDeal(dealSpyGame(names, spies, mode, content));
      setDealIndex(0);
      setRevealed(false);
      setPhase('deal');
      console.log('✅ [SPY-LOCAL] Cards dealt');
    } catch (e) {
      console.error('❌ [SPY-LOCAL] Error loading content:', e);
      Alert.alert(S.common.error, S.spy.room.contentLoadFailed);
      setPhase('setup');
    }
  };

  const header = (
    <View style={styles.topBar}>
      <IconButton
        icon={phase === 'setup' ? 'back' : 'exit'}
        label={phase === 'setup' ? S.local.back : S.spy.local.exit}
        onPress={phase === 'setup' ? () => navigation.goBack() : () => confirmAction(S.spy.local.exitTitle, S.spy.local.exitMessage, exitToHome)}
      />
    </View>
  );

  if (phase === 'loading') {
    return (
      <Screen header={header} contentStyle={styles.centered}>
        <ActivityIndicator size="large" color={theme.accent} />
        <AppText variant="subtitle" align="center" color={colors.inkSoft}>
          {S.spy.local.loading}
        </AppText>
      </Screen>
    );
  }

  // ---------------------------------------------------------------- setup
  if (phase === 'setup') {
    return (
      <Screen header={header}>
        <View style={styles.titleBlock}>
          <AppText variant="display" align="center" accessibilityRole="header">
            {S.spy.local.setupTitle}
          </AppText>
          <AppText variant="subtitle" align="center" color={colors.inkSoft}>
            {S.spy.local.setupSubtitle}
          </AppText>
        </View>

        <Card style={styles.section}>
          <AppText variant="title" color={theme.accentInk} accessibilityRole="header">
            {S.spy.local.playersHeader(names.length)}
          </AppText>
          {names.map((name) => (
            <View key={name} style={styles.chipRow}>
              <PlayerChip name={name} />
              <IconButton icon="close" label={S.local.removePlayer(name)} onPress={() => setNames(names.filter((n) => n !== name))} size={44} />
            </View>
          ))}
          <View style={styles.addRow}>
            <TextField
              style={styles.flex}
              value={draft}
              onChangeText={setDraft}
              placeholder={S.local.playerNamePlaceholder}
              maxLength={20}
              onSubmitEditing={addPlayer}
              returnKeyType="done"
            />
            <IconButton icon="plus" label={S.local.addPlayer} onPress={addPlayer} variant="accent" />
          </View>
        </Card>

        <Card style={styles.section}>
          <AppText variant="title" color={theme.accentInk} accessibilityRole="header">
            {S.spy.local.spiesHeader}
          </AppText>
          <View style={styles.stepper}>
            <IconButton icon="minus" label={S.spy.local.spiesCount(Math.max(1, spies - 1))} onPress={() => setNumSpies(Math.max(1, spies - 1))} disabled={spies <= 1} />
            <View style={[styles.spyCount, { backgroundColor: theme.accent }]}>
              <Icon name="spy" size={22} color={theme.onAccent} />
              <AppText variant="title" color={theme.onAccent}>
                {spies}
              </AppText>
            </View>
            <IconButton icon="plus" label={S.spy.local.spiesCount(spies + 1)} onPress={() => setNumSpies(spies + 1)} disabled={spies >= maxSpies} />
          </View>
          <AppText variant="caption" align="center" color={colors.inkSoft}>
            {S.spy.room.spiesHint(spies)}
          </AppText>
        </Card>

        <Card style={styles.section}>
          <AppText variant="title" color={theme.accentInk} accessibilityRole="header">
            {S.spy.local.modeHeader}
          </AppText>
          <View style={styles.modeRow}>
            <Button
              title={S.spy.room.modeLocations}
              icon="location"
              variant={mode === 'locations' ? 'primary' : 'secondary'}
              onPress={() => setMode('locations')}
              style={styles.flex}
            />
            <Button
              title={S.spy.room.modeWord}
              icon="card"
              variant={mode === 'word' ? 'primary' : 'secondary'}
              onPress={() => setMode('word')}
              style={styles.flex}
            />
          </View>
          <AppText variant="caption" align="center" color={colors.inkSoft}>
            {mode === 'word' ? S.spy.room.modeWordHint : S.spy.room.modeLocationsHint}
          </AppText>
        </Card>

        {error ? (
          <View style={styles.errorBox} accessibilityLiveRegion="polite">
            <Icon name="alert" size={20} color={colors.dangerDeep} />
            <AppText color={colors.dangerDeep} style={styles.flex}>
              {error}
            </AppText>
          </View>
        ) : null}

        <Button title={S.local.start} icon="play" onPress={startDeal} disabled={names.length < 3} fullWidth />
        {names.length < 3 ? (
          <AppText variant="caption" align="center" color={colors.inkSoft}>
            {S.spy.local.needThree}
          </AppText>
        ) : null}
      </Screen>
    );
  }

  // ---------------------------------------------------------------- deal
  if (phase === 'deal' && deal) {
    const player = deal.players[dealIndex];
    const isLast = dealIndex === deal.players.length - 1;
    const isWord = deal.mode === 'word';

    const next = () => {
      setRevealed(false); // hide the card again before the phone is passed on
      if (isLast) {
        startedAtRef.current = Date.now();
        setRemaining(GAME_SECONDS);
        setPhase('play');
      } else {
        setDealIndex(dealIndex + 1);
      }
    };

    return (
      <Screen header={header}>
        <View style={styles.titleBlock}>
          <Badge label={S.spy.local.dealProgress(dealIndex + 1, deal.players.length)} icon="player" tone="tint" />
          <AppText variant="display" align="center" accessibilityRole="header">
            {S.spy.local.yourTurn(player.name)}
          </AppText>
          {!revealed ? (
            <AppText variant="subtitle" align="center" color={colors.inkSoft}>
              {S.spy.local.dealHint}
            </AppText>
          ) : null}
        </View>

        {!revealed ? (
          <Pressable
            onPress={() => {
              feedback.reveal();
              setRevealed(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={S.spy.local.faceDownLabel(player.name)}
            style={[styles.faceDown, { backgroundColor: theme.accent, borderColor: theme.accentDeep }]}
          >
            <Icon name="hidden" size={64} color={theme.onAccent} />
            <AppText variant="title" align="center" color={theme.onAccent}>
              {S.spy.local.faceDown}
            </AppText>
          </Pressable>
        ) : (
          <View style={[styles.secretCard, player.isSpy ? styles.secretCardSpy : { borderColor: theme.accent }]}>
            <View style={[styles.secretHeader, { backgroundColor: player.isSpy ? colors.ink : theme.accent }]}>
              <Icon name={player.isSpy ? 'spy' : isWord ? 'card' : 'roles'} size={24} color={colors.white} />
              <AppText variant="title" color={colors.white} accessibilityRole="header">
                {player.isSpy ? S.spy.room.youAreSpyHeader : isWord ? S.spy.room.theWordHeader : S.spy.room.yourRoleHeader}
              </AppText>
            </View>
            <View style={styles.secretBody}>
              {player.isSpy ? (
                <>
                  <View style={styles.spyEmblem}>
                    <Icon name="spy" size={56} color={colors.white} />
                  </View>
                  <AppText align="center" variant="bodyStrong">
                    {isWord ? S.spy.room.spyWordDesc : S.spy.room.spyLocationDesc}
                  </AppText>
                </>
              ) : (
                <>
                  <View style={[styles.secretValue, { backgroundColor: theme.tint }]}>
                    <AppText variant="label" color={colors.inkSoft} align="center">
                      {isWord ? S.spy.room.wordLabel : S.spy.room.locationLabel}
                    </AppText>
                    <AppText variant="heading" align="center" color={theme.accentInk}>
                      {player.location}
                    </AppText>
                  </View>
                  {!isWord ? (
                    <View style={styles.secretValue}>
                      <AppText variant="label" color={colors.inkSoft} align="center">
                        {S.spy.room.roleLabel}
                      </AppText>
                      <AppText variant="title" align="center">
                        {player.role}
                      </AppText>
                    </View>
                  ) : null}
                </>
              )}
            </View>
          </View>
        )}

        {revealed ? <Button title={isLast ? S.spy.local.hideAndStart : S.spy.local.hideAndPass} icon="hidden" onPress={next} fullWidth /> : null}
      </Screen>
    );
  }

  // ---------------------------------------------------------------- play
  if (phase === 'play') {
    return (
      <Screen header={header}>
        <View style={styles.titleBlock}>
          <AppText variant="display" align="center" accessibilityRole="header">
            {S.spy.local.playingTitle}
          </AppText>
          <AppText variant="subtitle" align="center" color={colors.inkSoft}>
            {S.spy.local.playingHint}
          </AppText>
        </View>
        <TimerDisplay remaining={remaining} total={GAME_SECONDS} warnAt={60} label={S.spy.room.timerLabel} warningLabel={S.spy.room.lastMinute} />
        <Button title={S.spy.local.endGame} icon="finish" onPress={() => setPhase('end')} fullWidth />
      </Screen>
    );
  }

  // ----------------------------------------------------------------- end
  const spyPlayers = deal.players.filter((p) => p.isSpy);
  const isWord = deal.mode === 'word';
  return (
    <Screen header={header}>
      <View style={styles.titleBlock}>
        <AppText variant="display" align="center" accessibilityRole="header">
          {S.spy.local.endTitle}
        </AppText>
      </View>

      <Card tone="tint" style={styles.section}>
        <AppText variant="label" align="center" color={colors.inkSoft}>
          {isWord ? S.spy.local.secretWord : S.spy.local.secretLocation}
        </AppText>
        <AppText variant="heading" align="center" color={theme.accentInk}>
          {deal.secret}
        </AppText>
      </Card>

      <Card style={styles.section}>
        <View style={styles.spyTitleRow}>
          <Icon name="spy" size={24} color={colors.ink} />
          <AppText variant="title">{S.spy.local.theSpies(spyPlayers.length)}</AppText>
        </View>
        <View style={styles.spyNames}>
          {spyPlayers.map((p) => (
            <Badge key={p.name} label={p.name} icon="spy" tone="danger" />
          ))}
        </View>
      </Card>

      <Card style={styles.section}>
        {deal.players.map((p) => (
          <View key={p.name} style={styles.resultRow}>
            <AppText variant="bodyStrong" style={styles.flex}>
              {p.name}
            </AppText>
            {p.isSpy ? (
              <Badge label={S.spy.local.spyTag} icon="spy" tone="danger" />
            ) : !isWord ? (
              <AppText color={colors.inkSoft}>{p.role}</AppText>
            ) : null}
          </View>
        ))}
      </Card>

      <Button title={S.spy.local.newGame} icon="dice" onPress={startDeal} fullWidth />
      <Button title={S.spy.local.backToMenu} icon="home" variant="secondary" onPress={exitToHome} fullWidth />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'flex-start', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  centered: { justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  titleBlock: { gap: spacing.xs, alignItems: 'center', paddingTop: spacing.md },
  section: { gap: spacing.md },
  chipRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  addRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  spyCount: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minWidth: 96, justifyContent: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radii.pill },
  modeRow: { flexDirection: 'row', gap: spacing.md },
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
  faceDown: {
    minHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    padding: spacing.xl,
    borderRadius: radii.xl,
    borderWidth: 3,
    borderBottomWidth: 8,
  },
  secretCard: { borderRadius: radii.xl, borderWidth: 3, borderBottomWidth: 7, backgroundColor: colors.card, overflow: 'hidden' },
  secretCardSpy: { borderColor: colors.ink },
  secretHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  secretBody: { gap: spacing.md, padding: spacing.lg },
  secretValue: { gap: spacing.xs, padding: spacing.md, borderRadius: radii.md },
  spyEmblem: { alignSelf: 'center', width: 96, height: 96, borderRadius: radii.pill, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  spyTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  spyNames: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44, borderBottomWidth: borders.hairline ?? 1, borderBottomColor: colors.line },
});
