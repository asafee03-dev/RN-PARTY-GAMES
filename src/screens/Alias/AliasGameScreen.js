import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AliasTimer from '../../components/alias/AliasTimer';
import GameBoard from '../../components/alias/GameBoard';
import TimeUpPopup from '../../components/alias/TimeUpPopup';
import GoldenWordPopup from '../../components/alias/GoldenWordPopup';
import GoldenRoundCard from '../../components/alias/GoldenRoundCard';
import RoundSummary from '../../components/alias/RoundSummary';
import UnifiedTopBar from '../../components/shared/UnifiedTopBar';
import RulesModal from '../../components/shared/RulesModal';
import { db } from '../../firebase';
import { arrayUnion, doc, getDoc, updateDoc, onSnapshot, runTransaction } from 'firebase/firestore';
import { dealTurnDeck, deckWordAt, TURN_DECK_SIZE } from '../../logic/alias';
import storage from '../../utils/storage';
import { saveCurrentRoom, loadCurrentRoom, clearCurrentRoom } from '../../utils/navigationState';
import { setupGameEndDeletion, setupAllAutoDeletions } from '../../utils/roomManagement';
import { showInterstitialIfAvailable } from '../../utils/interstitialAd';
import { serverNow, syncServerClock } from '../../utils/serverClock';
import { shuffle, uniqueBy } from '../../utils/random';
import { loadContent } from '../../utils/contentCache';
import { S } from '../../strings';
import { colors, radii, spacing, useGameTheme } from '../../theme';
import { AppText, Badge, Button, Card, Icon, Screen, feedback } from '../../ui';

const TEAM_COLORS = ["#EF4444", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899"];

// ---------------------------------------------------------------------------
// Pure helpers used inside transactions (computed from server data).
// ---------------------------------------------------------------------------

const MAX_POSITION = 59;

// Word for card number `index` of the turn (wraps around if the deck runs out)
const wordAt = deckWordAt;

// The round's shared word list (stored in the room). Falls back to this
// device's list only for rounds started before round_cards existed.
const getRoundCards = (roomData, localCards) =>
  (Array.isArray(roomData?.round_cards) && roomData.round_cards.length > 0 ? roomData.round_cards : localCards);

// A round is identified by its start time
const isSameRound = (a, b) => (a?.round_start_time ?? null) === (b?.round_start_time ?? null);

// Immutable position change, clamped to the board
const moveTeam = (teams, teamIndex, delta) => teams.map((t, i) => (i === teamIndex
  ? { ...t, position: Math.max(0, Math.min(MAX_POSITION, (t.position || 0) + delta)) }
  : t));

export default function AliasGameScreen({ navigation, route }) {
  const roomCode = route?.params?.roomCode || '';
  const insets = useSafeAreaInsets();
  const [room, setRoom] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [wordCardsDB, setWordCardsDB] = useState([]);
  const [cards, setCards] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeIsUp, setTimeIsUp] = useState(false);
  const [timerKey, setTimerKey] = useState(0);
  const [showGoldenPopup, setShowGoldenPopup] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const previousTurnRef = useRef(null); // Track previous turn to detect full round completion
  const unsubscribeRef = useRef(null);
  const autoDeletionCleanupRef = useRef({ cancelGameEnd: () => {}, cancelEmptyRoom: () => {}, cancelAge: () => {} });
  const lastResetTriggerRef = useRef(null); // Track last reset trigger to show ad once per reset
  const latestRoomRef = useRef(null); // Latest room for timer callbacks / listener (avoids stale closures)
  const playerNameRef = useRef('');
  const cardsRef = useRef([]);
  const freezeAttemptRef = useRef(null); // round_start_time of the last time-up freeze attempt
  const isStartingRoundRef = useRef(false);
  const isAnsweringRef = useRef(false);
  const isFinishingRoundRef = useRef(false);

  useEffect(() => {
    latestRoomRef.current = room;
  }, [room]);

  // Measure this device's offset from the server clock once, so timers and
  // time-based points use the same clock on every phone
  useEffect(() => {
    if (room?.id) {
      syncServerClock('GameRoom', room.id);
    }
  }, [room?.id]);

  useEffect(() => {
    playerNameRef.current = playerName;
  }, [playerName]);

  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  const theme = useGameTheme();

  // Haptic cues: time is up / game won (no-op on web)
  useEffect(() => {
    if (timeIsUp) feedback.warning();
  }, [timeIsUp]);
  useEffect(() => {
    if (room?.game_status === 'finished') feedback.success();
  }, [room?.game_status]);

  useEffect(() => {
    const loadPlayerName = async () => {
      try {
        const savedName = await storage.getItem('playerName');
        if (savedName) {
          setPlayerName(savedName);
        }
      } catch (e) {
        console.warn('Could not load player name:', e);
      }
    };
    loadPlayerName();
  }, []);

  useEffect(() => {
    if (!roomCode) {
      Alert.alert(S.alias.game.error, S.alias.game.missingRoomCode);
      navigation.goBack();
      return;
    }

    // Cleanup any existing listener before setting up new one
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    initializeRoom();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [roomCode]);

  // Cleanup timers/listeners on navigation away
  useEffect(() => {
    const unsubscribeNav = navigation.addListener('beforeRemove', () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    });
    return unsubscribeNav;
  }, [navigation]);

  // Redirect to setup if game is still in setup phase
  // But only if we haven't just navigated from setup (prevent navigation loops)
  const hasNavigatedFromSetup = useRef(false);
  const isInitialLoad = useRef(true);
  const previousGameStatusRef = useRef(null);
  
  useEffect(() => {
    // Mark initial load as complete once room is loaded
    if (room && !isLoading) {
      isInitialLoad.current = false;
    }
    
    // Mark that we've navigated from setup if game_status is waiting or playing
    if (room && (room.game_status === 'waiting' || room.game_status === 'playing')) {
      hasNavigatedFromSetup.current = true;
    }
    
    // Track previous game status before updating
    const currentGameStatus = room?.game_status;
    const previousGameStatus = previousGameStatusRef.current;
    
    // Reset flag when transitioning to setup from finished/playing/waiting
    // This allows navigation back to setup when host clicks "משחק חדש"
    if (currentGameStatus === 'setup' && previousGameStatus && 
        (previousGameStatus === 'finished' || previousGameStatus === 'playing' || previousGameStatus === 'waiting')) {
      // Reset flag to allow navigation back to setup
      hasNavigatedFromSetup.current = false;
    }
    
    // Update previous game status
    if (currentGameStatus) {
      previousGameStatusRef.current = currentGameStatus;
    }
    
    // Redirect to setup if:
    // 1. Game status is setup
    // 2. Room has been loaded (not initial state)
    // 3. Not during initial load (to prevent premature navigation)
    // 4. We're allowed to navigate (flag has been reset if coming from finished/playing/waiting)
    if (room && room.game_status === 'setup' && 
        room.teams && !isInitialLoad.current && !isLoading &&
        !hasNavigatedFromSetup.current) {
      navigation.replace('AliasSetup', { roomCode });
      return;
    }
  }, [room?.game_status, roomCode, navigation, room?.teams, isLoading]);

  // Legacy only: rounds started before the word list was stored in the room.
  // New rounds always read room.round_cards, so every device sees the same words.
  useEffect(() => {
    if (room?.round_active && !room?.round_cards && cards.length === 0 && wordCardsDB.length >= 200) {
      console.log('🔵 [RESTORE] Round is active but cards are missing - regenerating');
      const shuffled = shuffle(wordCardsDB);
      const selectedWords = shuffled.slice(0, 200);
      setCards(selectedWords);
      console.log('✅ [RESTORE] Cards restored for active round');
    }
  }, [room?.round_active, room?.round_cards, cards.length, wordCardsDB.length]);

  // Reset timer when new round starts
  useEffect(() => {
    if (room?.round_active && room.round_start_time) {
      setTimerKey(prev => prev + 1);
      setTimeIsUp(false);
    }
  }, [room?.round_start_time]);

  const initializeRoom = async () => {
    try {
      setIsLoading(true);
      await Promise.all([
        loadWordCardsFromDB(),
        loadRoom()
      ]);
      setupRealtimeListener();
    } catch (error) {
      console.error('Error initializing room:', error);
      Alert.alert(S.alias.game.error, S.alias.game.loadFailed);
      navigation.goBack();
    } finally {
      setIsLoading(false);
    }
  };

  const loadRoom = async () => {
    try {
      const roomRef = doc(db, 'GameRoom', roomCode);
      const roomSnap = await getDoc(roomRef);

      if (!roomSnap.exists()) {
        await clearCurrentRoom();
        Alert.alert(S.alias.game.error, S.alias.game.roomNotFound);
        navigation.goBack();
        return;
      }

      const roomData = { id: roomSnap.id, ...roomSnap.data() };
      setRoom(roomData);
    } catch (error) {
      console.error('Error loading room:', error);
      throw error;
    }
  };

  const setupRealtimeListener = () => {
    // Prevent duplicate listeners
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    const roomRef = doc(db, 'GameRoom', roomCode);
    
    unsubscribeRef.current = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const roomData = { id: snapshot.id, ...snapshot.data() };
        
        // Handle reset trigger for showing ad to all players (non-host)
        // Handle reset trigger for showing ad to all players (non-host)
        // Show ad AFTER state has been updated to setup (all players are on setup screen)
        if (roomData.reset_triggered_at && 
            roomData.reset_triggered_at !== lastResetTriggerRef.current &&
            roomData.game_status === 'setup' &&
            roomData.host_name !== playerNameRef.current) {
          lastResetTriggerRef.current = roomData.reset_triggered_at;
          // Show ad to non-host players - they're already on setup screen
          showInterstitialIfAvailable(() => {
            // Ad closed, continue normally - navigation to setup will happen via useEffect
          });
        }
        
        // Handle state updates - match old version's exact logic
        setRoom(prevRoom => {
          // Restore timeIsUp state if last_word_on_time_up exists (after refresh)
          if (!prevRoom && roomData.round_active && roomData.last_word_on_time_up) {
            console.log('🔵 [RESTORE] Restoring timeIsUp state from Firestore');
            setTimeIsUp(true);
          }
          
          // Note: Full round completion is now handled in finishRound() function
          // This ensures it only triggers once when the round actually completes
          
          // Reset timer and timeIsUp when a new round starts
          if (!prevRoom?.round_active && roomData.round_active) {
            setTimerKey(prev => prev + 1);
            setTimeIsUp(false);
          }
          
          // Restore timeIsUp if last_word_on_time_up is set during active round
          if (roomData.round_active && roomData.last_word_on_time_up && !timeIsUp) {
            console.log('🔵 [RESTORE] Timer expired - restoring timeIsUp state');
            setTimeIsUp(true);
          }
          
          // Reset timeIsUp when round ends (summary is shown or round becomes inactive)
          if (prevRoom?.round_active && !roomData.round_active) {
            setTimeIsUp(false);
          }
          
          // Show golden word popup automatically for non-playing players
          if (roomData.current_word_is_golden && !isMyTurn() && roomData.round_active && !timeIsUp) {
            setShowGoldenPopup(true);
          } else if (!roomData.current_word_is_golden || !roomData.round_active) {
            setShowGoldenPopup(false);
          }
          
          // (Removed: a check that ignored updates where the turn changed during
          // an active round. If a device missed the intermediate "summary"
          // snapshot - common after being in the background - it rejected
          // every later update and the player was stuck.)

          // Allow turn changes when round is not active (after summary or when transitioning)
          // This ensures the next team can see the start button
          if (!prevRoom?.round_active && !roomData?.round_active && prevRoom?.current_turn !== roomData?.current_turn) {
            // This is a legitimate turn change after round finished
            console.log('✅ Turn changed from', prevRoom?.current_turn, 'to', roomData?.current_turn, '- resetting timer');
            setTimerKey(prev => prev + 1);
            setTimeIsUp(false);
          }
          
          // Always accept the update if it's different
          if (JSON.stringify(prevRoom) !== JSON.stringify(roomData)) {
            return roomData;
          }
          return prevRoom;
        });
      } else {
        Alert.alert(S.alias.game.error, S.alias.game.roomDeletedShort);
        navigation.goBack();
      }
    }, (error) => {
      console.error('Error in realtime listener:', error);
    });
  };

  // Setup auto-deletion when game ends
  useEffect(() => {
    if (room?.game_status === 'finished' && room?.id) {
      // Cancel any existing game end timer
      if (autoDeletionCleanupRef.current.cancelGameEnd) {
        autoDeletionCleanupRef.current.cancelGameEnd();
      }
      
      // Setup new auto-deletion timer (5 minute grace period)
      autoDeletionCleanupRef.current.cancelGameEnd = setupGameEndDeletion('GameRoom', room.id, 5 * 60 * 1000);
      
      return () => {
        if (autoDeletionCleanupRef.current.cancelGameEnd) {
          autoDeletionCleanupRef.current.cancelGameEnd();
        }
      };
    }
  }, [room?.game_status, room?.id]);

  // Setup auto-deletion for empty rooms and age-based deletion
  useEffect(() => {
    if (room?.id) {
      // Cancel existing auto-deletions
      if (autoDeletionCleanupRef.current.cancelEmptyRoom) {
        autoDeletionCleanupRef.current.cancelEmptyRoom();
      }
      if (autoDeletionCleanupRef.current.cancelAge) {
        autoDeletionCleanupRef.current.cancelAge();
      }
      
      // Setup all auto-deletions
      const cleanup = setupAllAutoDeletions('GameRoom', room.id, {
        createdAt: room.created_at
      });
      autoDeletionCleanupRef.current = cleanup;
      
      return () => {
        if (cleanup.cancelEmptyRoom) cleanup.cancelEmptyRoom();
        if (cleanup.cancelAge) cleanup.cancelAge();
      };
    }
  }, [room?.id, room?.created_at]);

  const loadWordCardsFromDB = async () => {
    try {
      // Cached in memory and on the device (no full re-read per screen)
      const cards = await loadContent('WordCard');
      
      if (cards && cards.length > 0) {
        // Deduplicated: some words are stored twice, and a word must not
        // show twice in the same turn
        const words = uniqueBy(cards
          .filter(c => c.word && typeof c.word === 'string' && c.word.trim().length > 0)
          .map(c => c.word.trim()));
        
        setWordCardsDB(words);
      }
    } catch (error) {
      console.error('Error loading word cards:', error);
    }
  };

  const startRound = async () => {
    if (!isMyTurn()) {
      Alert.alert(S.alias.game.error, S.alias.game.onlyPlayingTeam);
      return;
    }

    if (!wordCardsDB || wordCardsDB.length < TURN_DECK_SIZE) {
      Alert.alert(S.alias.game.error, S.alias.game.notEnoughWords);
      return;
    }

    if (!room || !room.id) {
      console.error('❌ Cannot start round: room or room.id is missing');
      return;
    }
    if (isStartingRoundRef.current) return;
    isStartingRoundRef.current = true;

    // The turn's deck (different words, so none repeats within the turn) is
    // stored in the room so every device shows the same words.
    let selectedWords = null;

    try {
      const roomRef = doc(db, 'GameRoom', room.id);
      const result = await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(roomRef);
        if (!snap.exists()) return { outcome: 'missing' };
        const fresh = snap.data();
        // Two teammates pressing "start" together: only the first one counts
        if (fresh.round_active || fresh.show_round_summary || fresh.game_status === 'finished') {
          return { outcome: 'already' };
        }

        const teams = fresh.teams || [];
        const turn = fresh.current_turn;
        if (!teams[turn]?.players?.includes(playerName)) return { outcome: 'not_my_turn' };

        const startPosition = teams[turn].position || 0;
        // Dealt inside the transaction, only for the attempt that is written
        selectedWords = dealTurnDeck(wordCardsDB);
        transaction.update(roomRef, {
          round_active: true,
          game_status: 'playing',
          current_round_score: 0,
          round_start_time: serverNow(),
          round_start_position: startPosition,
          // Each team keeps its start position until the full round completes
          // (used for this round's progress)
          teams: teams.map((t, i) => (i === turn ? { ...t, round_start_position: startPosition } : t)),
          used_cards: [],
          round_cards: selectedWords,
          show_round_summary: false,
          last_word_on_time_up: null,
          current_word_is_golden: false
        });
        return { outcome: 'ok', wasPlaying: fresh.game_status === 'playing' };
      });

      if (result.outcome === 'missing') {
        Alert.alert(S.alias.game.error, S.alias.game.roomDeleted);
        navigation.navigate('AliasHome');
        return;
      }
      if (result.outcome !== 'ok') return;

      setCards(selectedWords);
      setTimerKey(prev => prev + 1);
      setTimeIsUp(false);
      console.log('✅ Round started successfully');

      if (!result.wasPlaying) {
        const { logGameStart } = await import('../../utils/analytics');
        logGameStart('alias', room.id);
      }
    } catch (error) {
      console.error('❌ Error starting round:', error);
      Alert.alert(S.alias.game.error, S.alias.game.startRoundFailed);
    } finally {
      isStartingRoundRef.current = false;
    }
  };

  // Timer reached zero: freeze the word that was on screen. Every teammate's
  // timer calls this (repeatedly while at 0); the transaction makes sure the
  // word is frozen exactly once, from the shared word list.
  const handleTimeUpWrapper = async () => {
    const current = latestRoomRef.current;
    if (!current || !current.id || !current.round_active) return;

    setTimeIsUp(true);
    if (current.last_word_on_time_up) return;
    if (freezeAttemptRef.current === current.round_start_time) return;
    freezeAttemptRef.current = current.round_start_time;

    try {
      const roomRef = doc(db, 'GameRoom', current.id);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(roomRef);
        if (!snap.exists()) return;
        const fresh = snap.data();
        if (!fresh.round_active || !isSameRound(fresh, current) || fresh.last_word_on_time_up) return;
        const word = wordAt(getRoundCards(fresh, cardsRef.current), (fresh.used_cards || []).length);
        if (!word) return;
        transaction.update(roomRef, { last_word_on_time_up: word });
      });
    } catch (error) {
      console.error('❌ Error freezing last word:', error);
      freezeAttemptRef.current = null; // Allow a retry on the next tick
    }
  };

  /**
   * Shared runner for "correct"/"skip" taps. `cardIndexAtTap` is the card the
   * player was looking at; if a teammate already answered it, the transaction
   * sees a different used_cards length and does nothing - so a card can't be
   * counted twice, and a tap from a stale screen can't hit the next card.
   */
  const runCardAction = async (buildUpdate) => {
    const current = room;
    if (!current || !current.id || !current.round_active) return;
    if (isAnsweringRef.current) return;
    isAnsweringRef.current = true;

    const cardIndexAtTap = (current.used_cards || []).length;
    const timeUpAtTap = timeIsUp;

    try {
      const roomRef = doc(db, 'GameRoom', current.id);
      const applied = await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(roomRef);
        if (!snap.exists()) return false;
        const fresh = snap.data();
        if (!fresh.round_active || !isSameRound(fresh, current)) return false;

        const usedCards = fresh.used_cards || [];
        if (usedCards.length !== cardIndexAtTap) return false; // Already answered

        const teams = fresh.teams || [];
        const turn = fresh.current_turn;
        if (!teams[turn]?.players?.includes(playerName)) return false; // Not the playing team

        const roundCards = getRoundCards(fresh, cardsRef.current);
        const update = buildUpdate({
          fresh,
          teams,
          turn,
          usedCards,
          index: cardIndexAtTap,
          timeUp: timeUpAtTap,
          // Time-up always uses the frozen word, never a recalculated one
          word: timeUpAtTap && fresh.last_word_on_time_up
            ? fresh.last_word_on_time_up
            : wordAt(roundCards, cardIndexAtTap)
        });
        if (!update) return false;
        transaction.update(roomRef, update);
        return true;
      });

      if (applied && timeUpAtTap) {
        setTimeIsUp(false);
      }
    } catch (error) {
      console.error('❌ Error updating room:', error);
    } finally {
      isAnsweringRef.current = false;
    }
  };

  const handleCorrect = (teamIndex = null) => runCardAction(({ fresh, teams, turn, usedCards, index, timeUp, word }) => {
    const scoringTeam = teamIndex !== null ? teamIndex : turn;
    if (!teams[scoringTeam]) return null;

    const isGolden = fresh.current_word_is_golden && !timeUp;
    const card = {
      words: word,
      status: 'correct',
      cardNumber: index + 1,
      isLastWord: !!timeUp,
      ...(isGolden ? { isGoldenWord: true } : {}),
      ...(isGolden || timeUp ? { teamThatGuessed: scoringTeam } : {})
    };
    if (!isGolden && !timeUp) card.isGoldenWord = false;

    const updatedTeams = moveTeam(teams, scoringTeam, 1);
    const updatedUsedCards = [...usedCards, card];
    const update = {
      teams: updatedTeams,
      // Append only (the transaction already checked no one answered this card)
      used_cards: arrayUnion(card),
      current_round_score: updatedUsedCards.filter(c => c.status === 'correct').length
    };

    const newPosition = updatedTeams[scoringTeam].position;
    if (newPosition >= MAX_POSITION) {
      update.game_status = 'finished';
      update.winner_team = updatedTeams[scoringTeam].name;
    }

    if (timeUp) {
      // Last word decided -> round ends
      update.show_round_summary = true;
      update.round_active = false;
    } else {
      update.current_word_is_golden = !!(fresh.golden_rounds_enabled && fresh.golden_squares?.includes(newPosition));
    }
    return update;
  });

  const handleSkip = () => runCardAction(({ fresh, teams, turn, usedCards, index, timeUp, word }) => {
    // Golden words can't be skipped
    if (fresh.current_word_is_golden) return null;

    const card = {
      words: word,
      status: 'skipped',
      cardNumber: index + 1,
      isLastWord: !!timeUp,
      ...(timeUp ? { teamThatGuessed: null } : {})
    };
    const updatedUsedCards = [...usedCards, card];
    const update = {
      teams: moveTeam(teams, turn, -1),
      // Append only (the transaction already checked no one answered this card)
      used_cards: arrayUnion(card)
    };
    if (timeUp) {
      update.show_round_summary = true;
      update.round_active = false;
    } else {
      update.current_round_score = updatedUsedCards.filter(c => c.status === 'correct').length;
    }
    return update;
  });

  const finishRound = async () => {
    if (!room || !room.id || !room.show_round_summary) return;
    if (isFinishingRoundRef.current) return;
    isFinishingRoundRef.current = true;

    const atTap = { current_turn: room.current_turn, round_start_time: room.round_start_time };

    try {
      const roomRef = doc(db, 'GameRoom', room.id);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(roomRef);
        if (!snap.exists()) return;
        const fresh = snap.data();
        // Two teammates pressing "finish": the second sees the turn already moved
        if (!fresh.show_round_summary || fresh.current_turn !== atTap.current_turn || !isSameRound(fresh, atTap)) return;

        const teams = fresh.teams || [];
        const nextTurn = (fresh.current_turn + 1) % teams.length;
        const update = {
          current_turn: nextTurn,
          round_active: false,
          show_round_summary: false,
          current_round_score: 0,
          used_cards: [],
          round_cards: null,
          last_word_on_time_up: null,
          current_word_is_golden: false,
          round_start_position: null
        };

        // Full round = every team has played (back to the team that started)
        if (nextTurn === (fresh.starting_turn ?? 0)) {
          update.teams = teams.map(t => ({ ...t, round_start_position: null }));
        }

        transaction.update(roomRef, update);
      });

      setTimerKey(prev => prev + 1);
      setTimeIsUp(false);
    } catch (error) {
      console.error('❌ Error finishing round:', error);
    } finally {
      isFinishingRoundRef.current = false;
    }
  };

  const resetGame = async () => {
    if (!room || !room.id) return;
    const isHost = room.host_name === playerName;
    if (!isHost) return;

    // Cancel game end auto-deletion since we're resetting
    if (autoDeletionCleanupRef.current.cancelGameEnd) {
      autoDeletionCleanupRef.current.cancelGameEnd();
      autoDeletionCleanupRef.current.cancelGameEnd = () => {};
    }

    try {
      // Update game state FIRST - this moves all players to setup screen
      const roomRef = doc(db, 'GameRoom', room.id);
      const resetTeams = room.teams.map(team => ({
        ...team,
        position: 0,
        round_start_position: null
      }));

      await updateDoc(roomRef, {
        teams: resetTeams,
        current_turn: 0,
        game_status: 'setup', // Reset to setup so players return to team selection screen
        round_active: false,
        current_round_score: 0,
        round_start_time: null,
        round_start_position: null,
        used_cards: [],
        round_cards: null,
        show_round_summary: false,
        last_word_on_time_up: null,
        current_word_is_golden: false,
        winner_team: null,
        reset_triggered_at: Date.now() // Signal to other players to show ad
      });

      setTimerKey(prev => prev + 1);
      setTimeIsUp(false);
      console.log('✅ Game reset successfully - returning to setup screen');

      // Navigate to setup screen after reset
      navigation.replace('AliasSetup', { roomCode });

      // Show ad AFTER state is updated - all players are now on setup screen
      showInterstitialIfAvailable(() => {
        // Ad closed, continue normally
      });
    } catch (error) {
      console.error('❌ Error resetting game:', error);
      Alert.alert(S.alias.game.error, S.alias.game.resetFailed);
    }
  };

  /**
   * Shared runner for edits on the round summary screen. Recomputes from the
   * server's used_cards/teams so two teammates editing at once don't
   * overwrite each other, and never mutates the on-screen state.
   */
  const runSummaryEdit = async (buildUpdate) => {
    if (!room || !room.id || !room.show_round_summary) return;
    const atTap = { round_start_time: room.round_start_time };
    try {
      const roomRef = doc(db, 'GameRoom', room.id);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(roomRef);
        if (!snap.exists()) return;
        const fresh = snap.data();
        if (!fresh.show_round_summary || !isSameRound(fresh, atTap)) return;
        const update = buildUpdate(fresh, fresh.teams || [], fresh.used_cards || []);
        if (update) transaction.update(roomRef, update);
      });
    } catch (error) {
      console.error('❌ Error updating room:', error);
    }
  };

  const toggleCardStatus = (cardIndex) => runSummaryEdit((fresh, teams, usedCards) => {
    const card = usedCards[cardIndex];
    // Last word / golden word are reassigned to a team, not toggled
    if (!card || card.isLastWord || card.isGoldenWord) return null;

    const turn = fresh.current_turn;
    // Correct -> skipped moves the team back one; skipped -> correct moves it forward
    // (the old code mutated the card first and then checked its status, so it
    // always moved the wrong way when un-marking a correct word)
    const wasCorrect = card.status === 'correct';
    const updatedUsedCards = usedCards.map((c, i) => (i === cardIndex ? { ...c, status: wasCorrect ? 'skipped' : 'correct' } : c));
    return {
      used_cards: updatedUsedCards,
      teams: moveTeam(teams, turn, wasCorrect ? -1 : 1),
      current_round_score: updatedUsedCards.filter(c => c.status === 'correct' && (!c.isLastWord || c.teamThatGuessed === turn)).length
    };
  });

  // Reassign which team guessed a last word / golden word (null = nobody)
  const reassignCardTeam = (cardIndex, newTeamIndex) => runSummaryEdit((fresh, teams, usedCards) => {
    const card = usedCards[cardIndex];
    if (!card) return null;
    const previousTeam = card.teamThatGuessed ?? null;
    if (previousTeam === newTeamIndex) return null; // Duplicate tap - nothing to change

    let updatedTeams = teams;
    if (previousTeam !== null) updatedTeams = moveTeam(updatedTeams, previousTeam, -1);
    if (newTeamIndex !== null) updatedTeams = moveTeam(updatedTeams, newTeamIndex, 1);

    const updatedUsedCards = usedCards.map((c, i) => (i === cardIndex
      ? { ...c, status: newTeamIndex !== null ? 'correct' : 'skipped', teamThatGuessed: newTeamIndex }
      : c));
    return {
      used_cards: updatedUsedCards,
      teams: updatedTeams,
      current_round_score: updatedUsedCards.filter(c => c.status === 'correct').length
    };
  });

  const handleChangeLastWordTeam = reassignCardTeam;
  const handleChangeGoldenRoundTeam = reassignCardTeam;

  const isMyTurn = () => {
    if (!room || !room.teams || !playerName) return false;
    const currentTeam = room.teams[room.current_turn];
    return currentTeam?.players?.includes(playerName) || false;
  };

  const getCurrentTeam = () => {
    if (!room || !room.teams) return null;
    return room.teams[room.current_turn] || null;
  };

  const calculateProgress = (teamIndex = null) => {
    // If teamIndex is provided, calculate for that team; otherwise use current team
    const targetTeamIndex = teamIndex !== null ? teamIndex : room.current_turn;
    const targetTeam = room.teams && room.teams[targetTeamIndex];
    
    if (!targetTeam) return { startPos: 0, currentPos: 0, moved: 0 };
    
    // Get the team's position (default to 0 if undefined)
    const currentPos = targetTeam.position !== undefined ? targetTeam.position : 0;
    
    // Determine start position based on whether it's the current team and if a round is active
    let startPos;
    if (targetTeamIndex === room.current_turn && room.round_active) {
      // Current team during active round: use the round_start_position stored in room
      startPos = room.round_start_position !== undefined && room.round_start_position !== null 
        ? room.round_start_position 
        : currentPos;
    } else if (targetTeamIndex === room.current_turn && !room.round_active) {
      // Current team when round is not active: no movement this round
      startPos = currentPos;
    } else {
      // Other teams: if they have a stored round_start_position, use it; otherwise no movement
      if (targetTeam.round_start_position !== undefined && targetTeam.round_start_position !== null) {
        startPos = targetTeam.round_start_position;
      } else {
        // No round started for this team yet, or round already ended - no movement
        startPos = currentPos;
      }
    }
    
    const moved = currentPos - startPos;
    
    return { startPos, currentPos, moved };
  };


  // Leave to the main menu (same behavior as before, shared by the top bar)
  const exitToHome = async () => {
    // Cleanup listeners
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    // Cleanup room state
    await clearCurrentRoom();

    // Navigate to main menu using reset to clear the stack
    const parent = navigation.getParent();
    if (parent) {
      parent.reset({
        index: 0,
        routes: [{ name: 'Home' }]
      });
    } else {
      // Fallback: navigate to Home
      navigation.navigate('Home');
    }
  };

  if (isLoading || !room) {
    return (
      <Screen contentStyle={styles.centered}>
        <ActivityIndicator size="large" color={theme.accent} />
        <AppText variant="subtitle" align="center" color={colors.inkSoft}>
          {S.alias.game.loading}
        </AppText>
      </Screen>
    );
  }

  // Winner screen
  if (room.game_status === 'finished') {
    const isHost = room.host_name === playerName;
    return (
      <Screen contentStyle={styles.centered}>
        <View style={[styles.winnerBanner, { backgroundColor: theme.accent, borderColor: theme.accentDeep }]}>
          <Icon name="trophy" size={56} color={colors.gold} />
          <AppText variant="heading" align="center" color={theme.onAccent} accessibilityRole="header">
            {S.alias.game.winnerTitle(room.winner_team)}
          </AppText>
          <AppText variant="subtitle" align="center" color={theme.onAccent}>
            {S.alias.game.congrats}
          </AppText>
        </View>

        <Button title={S.alias.game.newGame} icon="dice" onPress={resetGame} disabled={!isHost} fullWidth />
        {!isHost && (
          <AppText variant="caption" align="center" color={colors.inkSoft}>
            {S.alias.game.hostOnlyNewGame}
          </AppText>
        )}
        <Button
          title={S.alias.game.backToMenu}
          icon="home"
          variant="secondary"
          fullWidth
          onPress={async () => {
            // Show interstitial ad before navigating to main menu
            showInterstitialIfAvailable(async () => {
              await exitToHome();
            });
          }}
        />
      </Screen>
    );
  }

  // Round summary
  if (room.show_round_summary) {
    const currentTeam = getCurrentTeam();

    return (
      <Screen>
        <RoundSummary
          room={room}
          currentTeam={currentTeam}
          isMyTurn={isMyTurn()}
          onToggleCardStatus={toggleCardStatus}
          onChangeLastWordTeam={handleChangeLastWordTeam}
          onChangeGoldenRoundTeam={handleChangeGoldenRoundTeam}
          onFinishRound={finishRound}
        />
      </Screen>
    );
  }

  const currentTeam = getCurrentTeam();
  const progress = calculateProgress();
  const currentCardIndex = room.used_cards?.length || 0;
  // Get current word - handle both string and array formats
  let currentWord = '';
  if (timeIsUp && room.last_word_on_time_up) {
    currentWord = room.last_word_on_time_up;
  } else {
    // Shared word list from the room, so every player sees the same word
    currentWord = wordAt(getRoundCards(room, cards), currentCardIndex);
  }

  const roundStats = (
    <View style={styles.stats}>
      <Badge label={S.alias.game.correctAnswers(room.current_round_score)} icon="check" tone="success" />
      <Badge
        label={`${S.alias.game.progress(progress.moved)} · ${S.alias.game.positionOf(progress.currentPos + 1)}`}
        icon={progress.moved >= 0 ? 'plus' : 'minus'}
        tone={progress.moved >= 0 ? 'accent' : 'danger'}
      />
    </View>
  );

  return (
    <Screen
      header={
        <UnifiedTopBar
          roomCode={roomCode}
          variant="alias"
          onExit={exitToHome}
          onRulesPress={() => setShowRulesModal(true)}
        />
      }
    >
      <RulesModal
        visible={showRulesModal}
        onClose={() => setShowRulesModal(false)}
        variant="alias"
      />

      {/* Whose turn */}
      <Card tone={isMyTurn() ? 'tint' : 'paper'} padding="md" style={styles.turnCard}>
        <Icon name={isMyTurn() ? 'clue' : 'players'} size={26} color={theme.accentInk} />
        <AppText variant="title" color={theme.accentInk} style={styles.flexShrink}>
          {isMyTurn() ? S.alias.game.yourTurn : S.alias.game.turnOf(currentTeam?.name)}
        </AppText>
      </Card>

      {/* Game Board */}
      <GameBoard teams={room.teams} goldenSquares={room.golden_squares || []} />

      {/* Game Content */}
      {room.round_active ? (
        <>
          {/* Timer - only for playing team */}
          {isMyTurn() && !room.current_word_is_golden && (
            <AliasTimer
              key={timerKey}
              duration={60}
              startTime={room.round_start_time}
              onTimeUp={handleTimeUpWrapper}
              compact={false}
            />
          )}

          {/* Progress info for the playing team */}
          {isMyTurn() && roundStats}

          {/* Time Up - only for playing team */}
          {timeIsUp && isMyTurn() && (
            <TimeUpPopup
              isMyTurn={isMyTurn()}
              room={room}
              onCorrect={handleCorrect}
              onSkip={handleSkip}
            />
          )}

          {/* Golden Word - GoldenRoundCard for the playing team */}
          {room.current_word_is_golden && isMyTurn() && !timeIsUp && (
            <GoldenRoundCard
              word={currentWord}
              teams={room.teams}
              onTeamGuess={handleCorrect}
              canInteract={true}
              showWord={true}
              startTime={room.round_start_time}
              onTimeUp={handleTimeUpWrapper}
              timerComponent={
                <AliasTimer
                  key={timerKey}
                  duration={60}
                  startTime={room.round_start_time}
                  onTimeUp={handleTimeUpWrapper}
                  compact={false}
                />
              }
            />
          )}

          {/* Golden Word Popup for non-playing players - shown automatically */}
          {room.current_word_is_golden && !isMyTurn() && !timeIsUp && (
            <GoldenWordPopup
              visible={true}
              onClose={() => setShowGoldenPopup(false)}
            />
          )}

          {/* Regular word card - only if not golden word and it's my turn */}
          {!room.current_word_is_golden && !timeIsUp && isMyTurn() && (
            <View style={[styles.wordCard, { borderColor: theme.accent }]}>
              <AppText variant="label" color={colors.inkSoft} align="center">
                {S.alias.game.wordNumber(currentCardIndex + 1)}
              </AppText>
              <AppText variant="display" align="center" maxScale={1.4}>
                {currentWord}
              </AppText>
            </View>
          )}

          {/* Action buttons - only for regular words (not golden) */}
          {isMyTurn() && !timeIsUp && !room.current_word_is_golden && (
            <View style={styles.actions}>
              <Button
                title={S.alias.game.correct}
                icon="check"
                variant="success"
                onPress={() => handleCorrect()}
                style={styles.flex}
              />
              <Button
                title={S.alias.game.skip}
                icon="skip"
                variant="secondary"
                onPress={handleSkip}
                style={styles.flex}
              />
            </View>
          )}

          {/* Waiting (other teams) */}
          {!isMyTurn() && !room.current_word_is_golden && !timeIsUp && (
            <>
              <AliasTimer
                duration={60}
                startTime={room.round_start_time}
                onTimeUp={() => {}}
                compact={false}
              />
              <Card tone="tint" style={styles.waiting}>
                <AppText variant="title" align="center">
                  {S.alias.game.playingNow(currentTeam?.name)}
                </AppText>
                <AppText align="center" color={colors.inkSoft}>
                  {S.alias.game.waitingTurnEnd}
                </AppText>
                {roundStats}
              </Card>
            </>
          )}

          {/* Waiting for a golden word - info only (the popup explains it) */}
          {!isMyTurn() && room.current_word_is_golden && !timeIsUp && (
            <Card tone="tint" style={styles.waiting}>
              <AppText variant="title" align="center">
                {S.alias.game.playingNow(currentTeam?.name)}
              </AppText>
              <AppText align="center" color={colors.inkSoft}>
                {S.alias.game.goldenWaiting}
              </AppText>
              {roundStats}
            </Card>
          )}
        </>
      ) : (
        /* Waiting for round start */
        <Card style={styles.waiting}>
          {isMyTurn() ? (
            <>
              <AppText align="center" color={colors.inkSoft}>
                {S.alias.game.pressToStart}
              </AppText>
              <Button title={S.alias.game.go} icon="play" onPress={startRound} fullWidth />
            </>
          ) : (
            <View style={styles.waitingRow}>
              <Icon name="hourglass" size={22} color={colors.inkSoft} />
              <AppText color={colors.inkSoft} style={styles.flexShrink}>
                {S.alias.game.waitingStart(currentTeam?.name)}
              </AppText>
            </View>
          )}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  flexShrink: {
    flexShrink: 1,
  },
  centered: {
    justifyContent: 'center',
    gap: spacing.md,
  },
  winnerBanner: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
    borderRadius: radii.xl,
    borderBottomWidth: 7,
    marginBottom: spacing.md,
  },
  turnCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  wordCard: {
    gap: spacing.xs,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.xl,
    borderWidth: 3,
    borderBottomWidth: 7,
    backgroundColor: colors.card,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  waiting: {
    gap: spacing.md,
  },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
});
