import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../firebase';
import { S } from '../../../strings';
import { colors, radii, spacing, useGameTheme } from '../../../theme';
import { AppText, Badge, Button, Card, Icon, IconButton, PassPhone, Screen } from '../../../ui';
import { generateCards } from '../../../logic/alias';
import * as L from '../../../logic/aliasLocal';
import GameBoard from '../../../components/alias/GameBoard';
import AliasTimer from '../../../components/alias/AliasTimer';
import RoundSummary from '../../../components/alias/RoundSummary';
import TimeUpPopup from '../../../components/alias/TimeUpPopup';
import GoldenRoundCard from '../../../components/alias/GoldenRoundCard';
import DrinkingPopup from '../../../components/alias/DrinkingPopup';
import { confirmAction } from '../../../utils/gameSync';

const wordsPerRound = 200;

/**
 * Single phone Alias. One phone, no room: all state is local and driven by the
 * pure rules in src/logic/aliasLocal.js. Before each team's turn a hand-off
 * screen tells who gets the phone; the words only show after "ready".
 */
export default function AliasLocalGameScreen({ navigation, route }) {
  const theme = useGameTheme();
  const { teams: setupTeams, goldenRounds, drinking } = route.params;
  const [game, setGame] = useState(() => L.createLocalGame(setupTeams, { goldenRounds, drinking }));
  const [wordPool, setWordPool] = useState(null); // null = loading
  const [cards, setCards] = useState([]);
  const [timeIsUp, setTimeIsUp] = useState(false);
  const [timerKey, setTimerKey] = useState(0);
  const [drinkingTeam, setDrinkingTeam] = useState(null);
  const gameRef = useRef(game);
  gameRef.current = game;
  const cardsRef = useRef(cards);
  cardsRef.current = cards;

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const snapshot = await getDocs(collection(db, 'WordCard'));
        const words = [];
        snapshot.forEach((d) => {
          const w = d.data()?.word;
          if (typeof w === 'string' && w.trim()) words.push(w.trim());
        });
        if (active) setWordPool(words);
      } catch (error) {
        console.error('Error loading word cards:', error);
        if (active) setWordPool([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const currentWord = (state = game) => cards[state.used_cards.length] || '';

  const startRound = () => {
    let selected;
    try {
      selected = generateCards(wordPool, wordsPerRound, 1);
    } catch {
      return;
    }
    setCards(selected);
    setTimeIsUp(false);
    setTimerKey((k) => k + 1);
    setGame((g) => L.startRound(g));
    console.log('✅ [ALIAS-LOCAL] Round started');
  };

  const handleTimeUp = useCallback(() => {
    const g = gameRef.current;
    if (!g.round_active) return;
    setTimeIsUp(true);
    const word = cardsRef.current[g.used_cards.length];
    setGame((prev) => L.freezeLastWord(prev, word));
  }, []);

  const handleCorrect = (teamIndex = null) => {
    const g = gameRef.current;
    if (!g.round_active) return;
    const word = timeIsUp && g.last_word_on_time_up ? g.last_word_on_time_up : currentWord(g);
    setGame(L.markCorrect(g, word, teamIndex, timeIsUp));
    if (timeIsUp) setTimeIsUp(false);
  };

  const handleSkip = () => {
    const g = gameRef.current;
    if (!g.round_active) return;
    const word = timeIsUp && g.last_word_on_time_up ? g.last_word_on_time_up : currentWord(g);
    setGame(L.markSkip(g, word, timeIsUp));
    if (timeIsUp) setTimeIsUp(false);
  };

  const finishRound = () => {
    const next = L.finishRound(game);
    setGame(next);
    setTimeIsUp(false);
    if (next.drinking_popup) setDrinkingTeam(next.drinking_popup.team_name);
  };

  const exitToHome = () => {
    const parent = navigation.getParent();
    if (parent) parent.reset({ index: 0, routes: [{ name: 'Home' }] });
    else navigation.navigate('Home');
  };

  const askExit = () => confirmAction(S.alias.local.exitTitle, S.alias.local.exitMessage, exitToHome);

  const header = (
    <View style={styles.topBar}>
      <IconButton icon="exit" label={S.alias.local.exit} onPress={askExit} />
    </View>
  );

  if (wordPool === null) {
    return (
      <Screen header={header} contentStyle={styles.centered}>
        <ActivityIndicator size="large" color={theme.accent} />
        <AppText variant="subtitle" align="center" color={colors.inkSoft}>
          {S.alias.local.loadingWords}
        </AppText>
      </Screen>
    );
  }
  if (wordPool.length < wordsPerRound) {
    return (
      <Screen header={header} contentStyle={styles.centered}>
        <Icon name="alert" size={40} color={colors.dangerDeep} />
        <AppText variant="subtitle" align="center">
          {S.alias.game.notEnoughWords}
        </AppText>
      </Screen>
    );
  }

  const currentTeam = game.teams[game.current_turn];

  // Winner
  if (game.game_status === 'finished') {
    return (
      <Screen header={header} contentStyle={styles.centered}>
        <View style={[styles.winnerBanner, { backgroundColor: theme.accent, borderColor: theme.accentDeep }]}>
          <Icon name="trophy" size={56} color={colors.gold} />
          <AppText variant="heading" align="center" color={theme.onAccent} accessibilityRole="header">
            {S.alias.game.winnerTitle(game.winner_team)}
          </AppText>
          <AppText variant="subtitle" align="center" color={theme.onAccent}>
            {S.alias.game.congrats}
          </AppText>
        </View>
        <Button
          title={S.alias.local.sameTeams}
          icon="dice"
          onPress={() => {
            setGame(L.createLocalGame(setupTeams, { goldenRounds, drinking }));
            setTimeIsUp(false);
          }}
          fullWidth
        />
        <Button title={S.alias.game.backToMenu} icon="home" variant="secondary" onPress={exitToHome} fullWidth />
      </Screen>
    );
  }

  // Round summary with corrections
  if (game.show_round_summary) {
    return (
      <Screen header={header}>
        <DrinkingPopup visible={!!drinkingTeam} onClose={() => setDrinkingTeam(null)} teamName={drinkingTeam} />
        <RoundSummary
          room={game}
          currentTeam={currentTeam}
          isMyTurn={true}
          onToggleCardStatus={(i) => setGame((g) => L.toggleCardStatus(g, i))}
          onChangeLastWordTeam={(i, t) => setGame((g) => L.reassignCardTeam(g, i, t))}
          onChangeGoldenRoundTeam={(i, t) => setGame((g) => L.reassignCardTeam(g, i, t))}
          onFinishRound={finishRound}
        />
      </Screen>
    );
  }

  // Hand-off before the round: the words are not on screen yet
  if (!game.round_active) {
    return (
      <>
        <DrinkingPopup visible={!!drinkingTeam} onClose={() => setDrinkingTeam(null)} teamName={drinkingTeam} />
        <PassPhone
          title={S.local.passTo(L.getExplainer(game))}
          subtitle={S.alias.local.passSubtitle(currentTeam.name)}
          buttonLabel={S.alias.local.ready}
          onReady={startRound}
          extra={<GameBoard teams={game.teams} goldenSquares={game.golden_squares} />}
        />
      </>
    );
  }

  const word = currentWord();
  const correctCount = game.used_cards.filter((c) => c.status === 'correct').length;

  return (
    <Screen header={header}>
      <Card tone="tint" padding="md" style={styles.turnCard}>
        <Icon name="clue" size={26} color={theme.accentInk} />
        <AppText variant="title" color={theme.accentInk} style={styles.flexShrink}>
          {S.alias.local.explainerNow(L.getExplainer(game))}
        </AppText>
      </Card>

      <GameBoard teams={game.teams} goldenSquares={game.golden_squares} />

      {!game.current_word_is_golden ? (
        <AliasTimer key={timerKey} duration={L.ROUND_SECONDS} startTime={game.round_start_time} onTimeUp={handleTimeUp} compact={false} />
      ) : null}

      <View style={styles.stats}>
        <Badge label={S.alias.game.correctAnswers(correctCount)} icon="check" tone="success" />
      </View>

      {timeIsUp ? <TimeUpPopup isMyTurn={true} room={game} onCorrect={handleCorrect} onSkip={handleSkip} /> : null}

      {!timeIsUp && game.current_word_is_golden ? (
        <GoldenRoundCard
          word={word}
          teams={game.teams}
          onTeamGuess={handleCorrect}
          canInteract={true}
          showWord={true}
          startTime={game.round_start_time}
          onTimeUp={handleTimeUp}
          timerComponent={
            <AliasTimer key={timerKey} duration={L.ROUND_SECONDS} startTime={game.round_start_time} onTimeUp={handleTimeUp} compact={false} />
          }
        />
      ) : null}

      {!timeIsUp && !game.current_word_is_golden ? (
        <>
          <View style={[styles.wordCard, { borderColor: theme.accent }]}>
            <AppText variant="label" color={colors.inkSoft} align="center">
              {S.alias.game.wordNumber(game.used_cards.length + 1)}
            </AppText>
            <AppText variant="display" align="center" maxScale={1.4}>
              {word}
            </AppText>
          </View>
          <View style={styles.actions}>
            <Button title={S.alias.game.correct} icon="check" variant="success" onPress={() => handleCorrect()} style={styles.flex} />
            <Button title={S.alias.game.skip} icon="skip" variant="secondary" onPress={handleSkip} style={styles.flex} />
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'flex-start', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  centered: { justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  winnerBanner: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl, borderRadius: radii.xl, borderBottomWidth: 7, width: '100%' },
  turnCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stats: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  wordCard: {
    gap: spacing.xs,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.xl,
    borderWidth: 3,
    borderBottomWidth: 7,
    backgroundColor: colors.card,
  },
  actions: { flexDirection: 'row', gap: spacing.md },
});
