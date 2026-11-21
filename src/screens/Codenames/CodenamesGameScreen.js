import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db, waitForFirestoreReady } from '../../firebase';
import { doc, getDoc, updateDoc, onSnapshot, query, collection, where, getDocs, runTransaction } from 'firebase/firestore';
import CodenamesBoard from '../../components/codenames/CodenamesBoard';
import ClueInput from '../../components/codenames/ClueInput';
import TeamInfo from '../../components/codenames/TeamInfo';
import RivalsTimer from '../../components/codenames/RivalsTimer';
import TeamWordsPanel from '../../components/codenames/TeamWordsPanel';
import UnifiedTopBar from '../../components/shared/UnifiedTopBar';
import RulesModal from '../../components/shared/RulesModal';
import storage from '../../utils/storage';
import { saveCurrentRoom, loadCurrentRoom, clearCurrentRoom } from '../../utils/navigationState';
import { setupGameEndDeletion, setupAllAutoDeletions } from '../../utils/roomManagement';
import { showInterstitialIfAvailable } from '../../utils/interstitialAd';
import { S } from '../../strings';
import { colors, radii, spacing, useGameTheme } from '../../theme';
import { AppText, Badge, Button, Card, Dialog, Icon, Screen, feedback } from '../../ui';
import { getTeamStyle } from '../../components/codenames/teamStyle';

// ---------------------------------------------------------------------------
// Pure helpers used inside transactions, so every decision is made from the
// server's current state rather than a possibly-stale local copy.
// ---------------------------------------------------------------------------

const otherTeam = (team) => (team === 'red' ? 'blue' : 'red');

const getRoleIn = (roomData, playerName) => {
  if (!roomData || !playerName) return null;
  if (roomData.red_team?.spymaster === playerName) return { team: 'red', role: 'spymaster' };
  if (roomData.blue_team?.spymaster === playerName) return { team: 'blue', role: 'spymaster' };
  if (roomData.red_team?.guessers?.includes(playerName)) return { team: 'red', role: 'guesser' };
  if (roomData.blue_team?.guessers?.includes(playerName)) return { team: 'blue', role: 'guesser' };
  return null;
};

/**
 * Fields to write when the turn passes to the other team - whether because a
 * guesser pressed "end turn", picked a wrong word, or ran out of guesses.
 * Also runs the drinking-mode round check when the turn returns to the
 * starting team (previously this only happened on "end turn").
 */
const buildTurnSwitch = (fresh, revealedAfter) => {
  const nextTeam = otherTeam(fresh.current_turn);
  const updates = {
    current_turn: nextTeam,
    current_clue: null,
    guesses_remaining: 0
  };

  // Existing rivals-mode behavior, kept as-is
  if (fresh.game_mode === 'rivals') {
    updates.turn_phase = 'clue';
    updates.turn_start_time = Date.now();
  }

  // A round is complete when the turn cycles back to the starting team
  if (fresh.drinking_mode === true && nextTeam === fresh.starting_team) {
    const red = revealedAfter.red.length;
    const blue = revealedAfter.blue.length;
    updates.round_baseline_reveals = { red, blue };

    const oldBaseline = fresh.round_baseline_reveals;
    if (oldBaseline) {
      const redInRound = red - oldBaseline.red;
      const blueInRound = blue - oldBaseline.blue;
      // The team that revealed fewer words this round drinks (no popup on a tie)
      const drinkingTeam = redInRound < blueInRound ? 'red' : blueInRound < redInRound ? 'blue' : null;
      if (drinkingTeam) {
        const teamData = drinkingTeam === 'red' ? fresh.red_team : fresh.blue_team;
        updates.drinking_popup = {
          team: drinkingTeam,
          team_name: teamData?.spymaster || (drinkingTeam === 'red' ? 'אדומה' : 'כחולה')
        };
      }
    }
  }

  return updates;
};

export default function CodenamesGameScreen({ navigation, route }) {
  const roomCode = route?.params?.roomCode || '';
  const insets = useSafeAreaInsets();
  const [room, setRoom] = useState(null);
  const [currentPlayerName, setCurrentPlayerName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [error, setError] = useState(null);
  const [showTeamWords, setShowTeamWords] = useState(false);
  const [forceCloseModal, setForceCloseModal] = useState(false);
  const [drinkingMode, setDrinkingMode] = useState(false);
  const unsubscribeRef = useRef(null);
  const autoDeletionCleanupRef = useRef({ cancelGameEnd: () => {}, cancelEmptyRoom: () => {}, cancelAge: () => {} });
  const lastResetTriggerRef = useRef(null); // Track last reset trigger to show ad once per reset
  const currentPlayerNameRef = useRef(''); // Latest name for use inside the long-lived snapshot listener

  useEffect(() => {
    currentPlayerNameRef.current = currentPlayerName;
  }, [currentPlayerName]);

  const theme = useGameTheme();

  // Haptic cue when the game ends (no-op on web)
  useEffect(() => {
    if (room?.game_status === 'finished') feedback.success();
  }, [room?.game_status]);

  useEffect(() => {
    const initializeRoom = async () => {
      try {
        setIsLoading(true);
        setError(null);

        if (!roomCode) {
          navigation.navigate('CodenamesHome');
          return;
        }

        const playerName = await storage.getItem('playerName');
        if (!playerName) {
          navigation.navigate('CodenamesHome');
          return;
        }

        setCurrentPlayerName(playerName);
        
        await loadRoom();
        setIsLoading(false);
      } catch (err) {
        console.error('Error initializing room:', err);
        setError(err);
        setIsLoading(false);
      }
    };

    initializeRoom();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [roomCode, navigation]);

  const loadRoom = async () => {
    try {
      await waitForFirestoreReady();
      
      const roomRef = doc(db, 'CodenamesRoom', roomCode);
      let snapshot = await getDoc(roomRef);
      
      if (!snapshot.exists()) {
        const q = query(collection(db, 'CodenamesRoom'), where('room_code', '==', roomCode));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          const docData = querySnapshot.docs[0];
          snapshot = { exists: () => true, id: docData.id, data: () => docData.data() };
        }
      }
      
      if (!snapshot.exists()) {
        await clearCurrentRoom();
        navigation.navigate('CodenamesHome');
        return;
      }
      
      const roomData = { id: snapshot.id, ...snapshot.data() };
      setRoom(roomData);
      
      // Load drinking mode from room data (preferred) or local storage (fallback)
      if (roomData.drinking_mode !== undefined) {
        setDrinkingMode(roomData.drinking_mode);
        // Also sync to local storage
        await storage.setItem('drinkingMode', roomData.drinking_mode.toString());
      } else {
        // Fallback to local storage if room doesn't have it yet
        const savedMode = await storage.getItem('drinkingMode');
        if (savedMode) {
          setDrinkingMode(savedMode === 'true');
        }
      }
    } catch (error) {
      console.error('❌ Failed to load room:', error);
      navigation.navigate('CodenamesHome');
    }
  };

  useEffect(() => {
    if (!roomCode) return;

    // Cleanup any existing listener before setting up new one
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    const roomRef = doc(db, 'CodenamesRoom', roomCode);
    const unsubscribe = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const updatedRoom = { id: snapshot.id, ...snapshot.data() };
        
        // Handle reset trigger for showing ad to all players (non-host)
        // Handle reset trigger for showing ad to all players (non-host)
        // Show ad AFTER state has been updated to setup (all players are on setup screen)
        if (updatedRoom.reset_triggered_at && 
            updatedRoom.reset_triggered_at !== lastResetTriggerRef.current &&
            updatedRoom.game_status === 'setup' &&
            updatedRoom.host_name !== currentPlayerNameRef.current) {
          lastResetTriggerRef.current = updatedRoom.reset_triggered_at;
          // Show ad to non-host players - they're already on setup screen
          showInterstitialIfAvailable(() => {
            // Ad closed, continue normally
          });
        }
        
        // If game returned to setup, close modal and navigate back to setup
        if (updatedRoom.game_status === 'setup') {
          // Close modal immediately for all players
          setForceCloseModal(true);
          // Update room state first
          setRoom(updatedRoom);
          // Small delay to ensure modal closes before navigation
          setTimeout(() => {
            navigation.navigate('CodenamesSetup', { 
              roomCode, 
              gameMode: updatedRoom.game_mode || 'friends' 
            });
          }, 150);
          return;
        }
        
        // Keep the drinking badge in sync with the room setting
        if (updatedRoom.drinking_mode !== undefined) {
          setDrinkingMode(updatedRoom.drinking_mode === true);
        }

        // Always apply the server state. (A previous "block board/key_map
        // changes" check here could leave players on different boards if the
        // game was started twice.)
        setRoom(prevRoom => (
          JSON.stringify(prevRoom) !== JSON.stringify(updatedRoom) ? updatedRoom : prevRoom
        ));
      }
    });

    unsubscribeRef.current = unsubscribe;

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [roomCode, navigation]);

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

  // Reset force close modal flag when game status changes back to setup
  // Also close modal automatically for all players when game resets to setup
  useEffect(() => {
    if (room?.game_status === 'setup') {
      // Close modal for all players when game resets to setup
      setForceCloseModal(true);
      // Reset flag after a short delay
      setTimeout(() => {
        setForceCloseModal(false);
      }, 100);
    }
  }, [room?.game_status]);

  // Setup auto-deletion when game ends
  useEffect(() => {
    if (room?.game_status === 'finished' && room?.id) {
      // Cancel any existing game end timer
      if (autoDeletionCleanupRef.current.cancelGameEnd) {
        autoDeletionCleanupRef.current.cancelGameEnd();
      }
      
      // Setup new auto-deletion timer (5 minute grace period)
      autoDeletionCleanupRef.current.cancelGameEnd = setupGameEndDeletion('CodenamesRoom', room.id, 5 * 60 * 1000);
      
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
      const cleanup = setupAllAutoDeletions('CodenamesRoom', room.id, {
        createdAt: room.created_at
      });
      autoDeletionCleanupRef.current.cancelEmptyRoom = cleanup.cancelEmptyRoom;
      autoDeletionCleanupRef.current.cancelAge = cleanup.cancelAge;
      
      return () => {
        if (cleanup.cancelEmptyRoom) cleanup.cancelEmptyRoom();
        if (cleanup.cancelAge) cleanup.cancelAge();
      };
    }
  }, [room?.id, room?.created_at]);

  const getPlayerRole = () => {
    if (!room || !currentPlayerName) return null;
    
    if (room.red_team.spymaster === currentPlayerName) return { team: 'red', role: 'spymaster' };
    if (room.blue_team.spymaster === currentPlayerName) return { team: 'blue', role: 'spymaster' };
    if (room.red_team.guessers.includes(currentPlayerName)) return { team: 'red', role: 'guesser' };
    if (room.blue_team.guessers.includes(currentPlayerName)) return { team: 'blue', role: 'guesser' };
    
    return null;
  };

  const isMyTurn = () => {
    if (!room) return false;
    const playerRole = getPlayerRole();
    return playerRole && playerRole.team === room.current_turn;
  };

  const getRevealedIndices = () => {
    if (!room) return [];
    return [...room.red_team.revealed_words, ...room.blue_team.revealed_words];
  };

  const countWordsLeft = (team) => {
    if (!room || !room.key_map) return 0;
    const teamColor = team === 'red' ? 'red' : 'blue';
    const allRevealedIndices = getRevealedIndices();
    
    let remainingCount = 0;
    room.key_map.forEach((color, index) => {
      if (color === teamColor && !allRevealedIndices.includes(index)) {
        remainingCount++;
      }
    });
    
    return remainingCount;
  };

  const handleRivalsTimeUp = async () => {
    if (!room) return;

    console.log('⏱️ Time up, switching turn...');

    let updates = {};
    const nextTeam = room.current_turn === 'red' ? 'blue' : 'red';

    if (room.turn_phase === 'clue') {
      updates = {
        current_turn: nextTeam,
        current_clue: null,
        guesses_remaining: 0,
        turn_phase: 'clue',
        turn_start_time: Date.now()
      };
    } else if (room.turn_phase === 'guess') {
      updates = {
        current_turn: nextTeam,
        current_clue: null,
        guesses_remaining: 0,
        turn_phase: 'clue',
        turn_start_time: Date.now()
      };
    }
    
    if (!room || !room.id) {
      console.error('❌ Cannot switch turn: room or room.id is missing');
      return;
    }
    
    console.log('🔵 Switching turn, updating room:', room.id);
    try {
      const roomRef = doc(db, 'CodenamesRoom', room.id);
      await updateDoc(roomRef, updates);
      console.log('✅ Turn switched successfully');
      setRoom(prev => ({ ...prev, ...updates }));
    } catch (error) {
      console.error('❌ Error switching turn:', error);
      return;
    }
  };

  const handleClueSubmit = async (number) => {
    if (!room || !room.id) {
      console.error('❌ Cannot submit clue: room or room.id is missing');
      return;
    }

    console.log('💡 Submitting clue with number:', number);

    try {
      const roomRef = doc(db, 'CodenamesRoom', room.id);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(roomRef);
        if (!snap.exists()) return;
        const fresh = snap.data();
        if (fresh.game_status !== 'playing') return;

        // Only the current team's spymaster, and only once per turn
        const myRole = getRoleIn(fresh, currentPlayerName);
        if (!myRole || myRole.role !== 'spymaster' || myRole.team !== fresh.current_turn) return;
        if (fresh.current_clue) return;

        const updates = {
          current_clue: { number },
          guesses_remaining: number + 1,
          turn_start_time: Date.now()
        };
        // Existing rivals-mode behavior, kept as-is
        if (fresh.game_mode === 'rivals') {
          updates.turn_phase = 'guess';
        }
        transaction.update(roomRef, updates);
      });
      console.log('✅ Clue submitted successfully');
    } catch (error) {
      console.error('❌ Error submitting clue:', error);
    }
  };

  /**
   * Reveal a word. Runs in a transaction so that when several guessers tap at
   * the same time, each reveal is applied on top of the latest server state:
   * no reveal is lost, guesses_remaining is decremented exactly once per word,
   * and a tap that arrives after the turn already switched is ignored.
   * Only the fields that change are written (e.g. `red_team.revealed_words`),
   * never the whole team object.
   */
  const handleWordClick = async (index) => {
    if (!room || !room.id) return;

    const playerRole = getPlayerRole();
    if (!playerRole || playerRole.role === 'spymaster') return;
    if (!isMyTurn()) return;

    console.log('🎯 Word clicked:', index);

    try {
      const roomRef = doc(db, 'CodenamesRoom', room.id);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(roomRef);
        if (!snap.exists()) return;
        const fresh = snap.data();

        if (fresh.game_status !== 'playing') return;
        const myRole = getRoleIn(fresh, currentPlayerName);
        if (!myRole || myRole.role !== 'guesser' || myRole.team !== fresh.current_turn) return; // Turn already switched
        if (!(fresh.guesses_remaining > 0)) return; // Out of guesses

        const redRevealed = fresh.red_team?.revealed_words || [];
        const blueRevealed = fresh.blue_team?.revealed_words || [];
        if (redRevealed.includes(index) || blueRevealed.includes(index)) return; // Someone revealed it already

        const wordColor = fresh.key_map?.[index];
        if (!wordColor) return;
        const currentTeam = fresh.current_turn;

        // Neutral and black words go to both lists so everyone sees them
        const revealsForRed = wordColor === 'red' || wordColor === 'neutral' || wordColor === 'black';
        const revealsForBlue = wordColor === 'blue' || wordColor === 'neutral' || wordColor === 'black';
        const newRed = revealsForRed ? [...redRevealed, index] : redRevealed;
        const newBlue = revealsForBlue ? [...blueRevealed, index] : blueRevealed;

        const updates = {};
        if (revealsForRed) updates['red_team.revealed_words'] = newRed;
        if (revealsForBlue) updates['blue_team.revealed_words'] = newBlue;

        // Win / lose
        let winnerTeam = null;
        if (wordColor === 'black') {
          winnerTeam = otherTeam(currentTeam);
        } else {
          const revealedSet = new Set([...newRed, ...newBlue]);
          const wordsLeft = (team) => fresh.key_map.filter((c, i) => c === team && !revealedSet.has(i)).length;
          if (wordColor === currentTeam && wordsLeft(currentTeam) === 0) {
            winnerTeam = currentTeam;
          } else if (wordsLeft('red') === 0) {
            winnerTeam = 'red';
          } else if (wordsLeft('blue') === 0) {
            winnerTeam = 'blue';
          }
        }

        if (winnerTeam) {
          updates.game_status = 'finished';
          updates.winner_team = winnerTeam;
          updates.guesses_remaining = 0;
        } else if (wordColor !== currentTeam || fresh.guesses_remaining - 1 <= 0) {
          // Wrong color or out of guesses -> turn passes to the other team
          Object.assign(updates, buildTurnSwitch(fresh, { red: newRed, blue: newBlue }));
        } else {
          updates.guesses_remaining = fresh.guesses_remaining - 1;
        }

        transaction.update(roomRef, updates);
      });
      console.log('✅ Word click processed successfully');
    } catch (error) {
      console.error('❌ Error processing word click:', error);
    }
  };

  const handleEndTurn = async () => {
    if (!room || !room.id) {
      console.error('❌ Cannot end turn: room or room.id is missing');
      return;
    }

    const playerRole = getPlayerRole();
    if (!playerRole || playerRole.role === 'spymaster') return;
    if (!isMyTurn()) return;

    try {
      const roomRef = doc(db, 'CodenamesRoom', room.id);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(roomRef);
        if (!snap.exists()) return;
        const fresh = snap.data();
        if (fresh.game_status !== 'playing') return;

        // Still our turn? (Two teammates pressing "end turn" together, or a
        // word click that already switched the turn, makes this a no-op.)
        const myRole = getRoleIn(fresh, currentPlayerName);
        if (!myRole || myRole.role !== 'guesser' || myRole.team !== fresh.current_turn) return;

        transaction.update(roomRef, buildTurnSwitch(fresh, {
          red: fresh.red_team?.revealed_words || [],
          blue: fresh.blue_team?.revealed_words || []
        }));
      });
      console.log('✅ Turn ended successfully');
    } catch (error) {
      console.error('❌ Error ending turn:', error);
    }
  };

  const copyRoomCode = () => {
    Clipboard.setString(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const goBack = async () => {
    // Show interstitial ad before navigating to main menu
    showInterstitialIfAvailable(async () => {
      // Cleanup listeners
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      
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
    });
  };

  const resetGame = async () => {
    if (!room || !room.id) return;
    const isHost = room.host_name === currentPlayerName;
    if (!isHost) return;
    
    // Cancel game end auto-deletion since we're resetting
    if (autoDeletionCleanupRef.current.cancelGameEnd) {
      autoDeletionCleanupRef.current.cancelGameEnd();
      autoDeletionCleanupRef.current.cancelGameEnd = () => {};
    }
    
    // Force close modal immediately - set before any async operations
    setForceCloseModal(true);
    
    // Also update local room state immediately to close modal
    setRoom(prev => prev ? { ...prev, game_status: 'setup', winner_team: null } : prev);
    
    // Force a re-render to ensure modal closes
    await new Promise(resolve => setTimeout(resolve, 50));
    
    try {
      // Update game state FIRST - this moves all players to setup screen.
      // Clear only revealed_words (field paths) so team membership changes
      // made by other players aren't overwritten with a stale copy.
      const roomRef = doc(db, 'CodenamesRoom', room.id);
      await updateDoc(roomRef, {
        'red_team.revealed_words': [],
        'blue_team.revealed_words': [],
        game_status: 'setup',
        current_turn: 'red',
        starting_team: 'red',
        board_words: [],
        key_map: [],
        guesses_remaining: 0,
        turn_phase: 'clue',
        current_clue: null,
        winner_team: null,
        turn_start_time: null,
        drinking_popup: null,
        round_baseline_reveals: null,
        reset_triggered_at: Date.now() // Signal to other players to show ad
      });
      console.log('✅ Game reset successfully - all state cleared');
      
      // Ensure modal is fully closed before navigation - longer delay to ensure UI updates
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Navigate immediately using replace to ensure clean navigation
      navigation.replace('CodenamesSetup', { 
        roomCode, 
        gameMode: room.game_mode || 'friends' 
      });
      
      // Reset force close flag after navigation
      setTimeout(() => {
        setForceCloseModal(false);
      }, 500);

      // Show ad AFTER state is updated - all players are now on setup screen
      showInterstitialIfAvailable(() => {
        // Ad closed, continue normally
      });
    } catch (error) {
      console.error('❌ Error resetting game:', error);
      Alert.alert(S.codenames.game.error, S.codenames.game.resetFailed);
      setForceCloseModal(false);
    }
  };

  const clearDrinkingPopup = async () => {
    if (!room || !room.id) return;
    try {
      const roomRef = doc(db, 'CodenamesRoom', room.id);
      await updateDoc(roomRef, { drinking_popup: null });
    } catch (error) {
      console.error('❌ Error clearing drinking popup:', error);
    }
  };

  if (error) {
    return (
      <Screen contentStyle={styles.centered}>
        <Card style={styles.stateCard}>
          <Icon name="alert" size={40} color={colors.danger} />
          <AppText variant="title" align="center">
            {S.codenames.game.loadErrorTitle}
          </AppText>
          <AppText align="center" color={colors.inkSoft}>
            {S.codenames.game.loadErrorMessage}
          </AppText>
          <Button
            title={S.codenames.game.backHome}
            icon="home"
            fullWidth
            onPress={() => {
              const parent = navigation.getParent();
              if (parent) {
                parent.reset({
                  index: 0,
                  routes: [{ name: 'Home' }]
                });
              } else {
                navigation.navigate('Home');
              }
            }}
          />
        </Card>
      </Screen>
    );
  }

  if (isLoading || !room) {
    return (
      <Screen contentStyle={styles.centered}>
        <ActivityIndicator size="large" color={theme.accent} />
        <AppText variant="subtitle" align="center" color={colors.inkSoft}>
          {S.codenames.game.loading}
        </AppText>
      </Screen>
    );
  }

  const playerRole = getPlayerRole();
  const isSpymaster = playerRole?.role === 'spymaster';
  const canGuess = isMyTurn() && !isSpymaster && room.guesses_remaining > 0;
  const isRivalsMode = room.game_mode === 'rivals';
  const isHost = room.host_name === currentPlayerName;

  const timerDuration = isRivalsMode
    ? (room.turn_phase === 'clue' ? 90 : 120)
    : null;

  const myTeamColor = playerRole?.team;
  const redWordsLeft = countWordsLeft('red');
  const blueWordsLeft = countWordsLeft('blue');
  const turnTeam = getTeamStyle(room.current_turn);
  const showWinner = !!(room && room.game_status === 'finished' && !forceCloseModal && room.winner_team);

  return (
    <Screen
      header={
        <UnifiedTopBar
          roomCode={roomCode}
          variant="codenames"
          onExit={goBack}
          onRulesPress={() => setShowRulesModal(true)}
          drinkingMode={drinkingMode}
        />
      }
    >
      {drinkingMode && <Badge label={S.common.drinkingMode} icon="drink" tone="gold" />}

      <RulesModal
        visible={showRulesModal}
        onClose={() => setShowRulesModal(false)}
        variant="codenames"
      />

      {/* Drinking Mode Popup */}
      <Dialog
        visible={!!room.drinking_popup}
        icon="drink"
        title={S.codenames.game.drinkingTitle}
        onRequestClose={clearDrinkingPopup}
        actions={<Button title={S.common.continue} onPress={clearDrinkingPopup} fullWidth />}
      >
        {room.drinking_popup ? (
          <>
            <View style={styles.centerRow}>
              <Icon name={getTeamStyle(room.drinking_popup.team).icon} size={28} color={getTeamStyle(room.drinking_popup.team).ink} />
              <AppText variant="title" align="center" style={styles.flexShrink}>
                {room.drinking_popup.team_name
                  ? S.codenames.game.drinkingTeamName(room.drinking_popup.team_name)
                  : S.codenames.game.drinkingTeamColor(room.drinking_popup.team)}
              </AppText>
            </View>
            <AppText align="center" color={colors.inkSoft}>
              {S.codenames.game.drinkingSub}
            </AppText>
          </>
        ) : null}
      </Dialog>

      {/* Winner */}
      <Dialog
        visible={showWinner}
        icon="trophy"
        actions={
          <>
            <Button
              title={S.codenames.game.newGame}
              icon="dice"
              onPress={resetGame}
              disabled={!room.host_name || room.host_name !== currentPlayerName}
              fullWidth
            />
            {(!room.host_name || room.host_name !== currentPlayerName) && (
              <AppText variant="caption" align="center" color={colors.inkSoft}>
                {S.codenames.game.hostOnlyNewGame}
              </AppText>
            )}
            <Button
              title={S.codenames.game.backToMenu}
              icon="home"
              variant="secondary"
              fullWidth
              onPress={async () => {
                // Show interstitial ad before navigating to main menu
                showInterstitialIfAvailable(async () => {
                  if (unsubscribeRef.current) {
                    unsubscribeRef.current();
                    unsubscribeRef.current = null;
                  }
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
                });
              }}
            />
          </>
        }
      >
        {showWinner ? (
          <View style={[styles.winnerBox, { backgroundColor: getTeamStyle(room.winner_team).fill, borderColor: getTeamStyle(room.winner_team).deep }]}>
            <Icon name={getTeamStyle(room.winner_team).icon} size={36} color={colors.white} />
            <AppText variant="heading" align="center" color={colors.white} accessibilityRole="header">
              {S.codenames.game.winnerTeam(room.winner_team)} {S.codenames.game.won}
            </AppText>
          </View>
        ) : null}
      </Dialog>

      {/* Rivals Timer */}
      {isRivalsMode && room.turn_start_time && (
        <RivalsTimer
          startTime={room.turn_start_time}
          duration={timerDuration}
          onTimeUp={handleRivalsTimeUp}
          phase={room.turn_phase}
        />
      )}

      {/* Team Info */}
      <TeamInfo
        redTeam={room.red_team}
        blueTeam={room.blue_team}
        currentTurn={room.current_turn}
        redWordsLeft={redWordsLeft}
        blueWordsLeft={blueWordsLeft}
        currentPlayerName={currentPlayerName}
        compact={true}
      />

      {/* Collapsible Team Words Panel for Spymaster */}
      {isSpymaster && (
        <View style={styles.section}>
          <Button
            title={showTeamWords ? S.codenames.game.hideWords : S.codenames.game.showWords}
            icon={showTeamWords ? 'minus' : 'plus'}
            variant="secondary"
            size="sm"
            onPress={() => setShowTeamWords(!showTeamWords)}
            fullWidth
          />

          {showTeamWords && (
            <TeamWordsPanel
              words={room.board_words}
              keyMap={room.key_map}
              revealedIndices={getRevealedIndices()}
              teamColor={playerRole.team}
              compact={true}
            />
          )}
        </View>
      )}

      {/* Status Card */}
      <Card tone={isMyTurn() ? 'tint' : 'paper'} padding="md" style={styles.statusCard}>
        {isMyTurn() ? (
          <>
            <Badge label={S.codenames.game.yourTurn} icon="clue" tone="accent" />
            <AppText variant="bodyStrong" style={styles.flexShrink}>
              {isSpymaster ? S.codenames.game.giveClue : room.current_clue?.number ? S.codenames.game.guessWords : S.codenames.game.waitingClue}
            </AppText>
          </>
        ) : (
          <>
            <Icon name={turnTeam.icon} size={26} color={turnTeam.ink} />
            <AppText variant="bodyStrong" style={styles.flexShrink}>
              {S.codenames.game.turnOfTeam(room.current_turn)}
            </AppText>
          </>
        )}
      </Card>

      {/* Clue Input */}
      <ClueInput
        currentClue={room.current_clue}
        isMyTurn={isMyTurn()}
        isSpymaster={isSpymaster}
        room={room}
        onClueSubmit={handleClueSubmit}
        compact={true}
        maxClueNumber={myTeamColor ? countWordsLeft(myTeamColor) : 9}
      />

      {/* Guess Instructions */}
      {canGuess && (
        <Card padding="md" style={styles.section}>
          <View style={styles.tipRow}>
            <Icon name="gesture" size={22} color={theme.accentInk} />
            <AppText variant="bodyStrong" style={styles.flexShrink}>
              {S.codenames.game.tapWord}
            </AppText>
          </View>
          <View style={styles.statRow}>
            <Badge label={S.codenames.game.guessesLeft(room.guesses_remaining)} icon="target" tone="tint" />
            <Badge label={S.codenames.game.wrongPass} icon="alert" tone="danger" />
          </View>
          <Button title={S.codenames.game.endTurn} icon="skip" variant="secondary" onPress={handleEndTurn} fullWidth />
        </Card>
      )}

      {/* Board */}
      <CodenamesBoard
        words={room.board_words}
        keyMap={room.key_map}
        revealedIndices={getRevealedIndices()}
        isSpymaster={isSpymaster}
        onWordClick={handleWordClick}
        canGuess={canGuess}
        currentTeam={room.current_turn}
      />
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
    alignItems: 'center',
    gap: spacing.md,
  },
  stateCard: {
    width: '100%',
    alignItems: 'center',
    gap: spacing.md,
  },
  section: {
    gap: spacing.md,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  centerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  winnerBox: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
    borderRadius: radii.lg,
    borderBottomWidth: 6,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
