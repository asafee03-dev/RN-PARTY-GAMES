import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator, Modal, Switch, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';
import BannerAd from '../../components/shared/BannerAd';
import FrequencyGauge from '../../components/frequency/FrequencyGauge';
import ScoreBoard from '../../components/frequency/ScoreBoard';
import UnifiedTopBar from '../../components/shared/UnifiedTopBar';
import RulesModal from '../../components/shared/RulesModal';
import { db, waitForFirestoreReady } from '../../firebase';
import { doc, getDoc, updateDoc, onSnapshot, collection, getDocs, runTransaction } from 'firebase/firestore';
import { atomicPlayerJoin } from '../../utils/playerJoin';
import storage from '../../utils/storage';
import { saveCurrentRoom, loadCurrentRoom, clearCurrentRoom } from '../../utils/navigationState';
import { setupGameEndDeletion, setupAllAutoDeletions } from '../../utils/roomManagement';
import { showInterstitialIfAvailable } from '../../utils/interstitialAd';

const PLAYER_COLORS = ["#F59E0B", "#EF4444", "#8B5CF6", "#FCD34D", "#3B82F6", "#EC4899", "#F97316", "#14B8A6"];
const waveIcons = ["📻", "📡", "🎚️", "🎛️"];

// ---------------------------------------------------------------------------
// Pure helpers (no React / Firestore). Shared by the UI and by transactions so
// that every client computes round results the same way from the same data.
// ---------------------------------------------------------------------------

const calculateSectors = () => {
  const twoPointWidth = 10;
  const onePointWidth = 10;

  // Center of 2-point sector can be random between 5 and 175
  const minCenter = 5;
  const maxCenter = 175;
  const centerPos = Math.random() * (maxCenter - minCenter) + minCenter;

  // Sector boundaries (may extend beyond 0-180)
  return [
    { id: 'left', start: centerPos - twoPointWidth / 2 - onePointWidth, end: centerPos - twoPointWidth / 2, points: 1 },
    { id: 'center', start: centerPos - twoPointWidth / 2, end: centerPos + twoPointWidth / 2, points: 2 },
    { id: 'right', start: centerPos + twoPointWidth / 2, end: centerPos + twoPointWidth / 2 + onePointWidth, points: 1 }
  ];
};

const getSectorScore = (guessAngle, sectors) => {
  const clampedAngle = Math.max(0, Math.min(180, guessAngle));
  for (const sector of sectors || []) {
    // Sectors can extend beyond 0-180, but we only check the visible part
    const sectorStart = Math.max(0, sector.start);
    const sectorEnd = Math.min(180, sector.end);
    if (clampedAngle >= sectorStart && clampedAngle <= sectorEnd) {
      return sector.points;
    }
  }
  return 0;
};

// Is the guess inside the sector that contains the target position?
const isInCorrectSector = (guessAngle, targetPosition, sectors) => {
  const clampedTarget = Math.max(0, Math.min(180, targetPosition));
  const correctSector = (sectors || []).find(sector =>
    clampedTarget >= Math.max(0, sector.start) && clampedTarget <= Math.min(180, sector.end)
  );
  if (!correctSector) return false;

  const clampedGuess = Math.max(0, Math.min(180, guessAngle));
  return clampedGuess >= Math.max(0, correctSector.start) && clampedGuess <= Math.min(180, correctSector.end);
};

const getGuessSubmittedNames = (roomData) => {
  const names = roomData?.guess_submitted_names;
  if (names && typeof names === 'object' && !Array.isArray(names)) {
    return names;
  }
  return {};
};

const hasPlayerSubmittedGuess = (roomData, playerName) => getGuessSubmittedNames(roomData)[playerName] === true;

const getActivePlayers = (roomData) =>
  (roomData?.players || []).filter(p => p && p.name && p.active !== false);

const getClueGiverName = (roomData) => roomData?.players?.[roomData.current_turn_index]?.name || '';

const getActiveGuessers = (roomData) => {
  const clueGiver = getClueGiverName(roomData);
  return getActivePlayers(roomData).filter(p => p.name !== clueGiver);
};

const isGuessingPhase = (roomData) =>
  roomData?.game_status === 'playing' &&
  (!roomData.turn_phase || roomData.turn_phase === 'guessing' || roomData.turn_phase === 'clue');

const allActiveGuessersSubmitted = (roomData) => {
  const guessers = getActiveGuessers(roomData);
  const submitted = getGuessSubmittedNames(roomData);
  return guessers.length > 0 && guessers.every(p => submitted[p.name] === true);
};

// The single client allowed to drive round transitions: the host, or - if the
// host has left - the first active player, so the game never gets orphaned.
const getActingHostName = (roomData) => {
  const active = getActivePlayers(roomData);
  if (active.some(p => p.name === roomData?.host_name)) {
    return roomData.host_name;
  }
  return active[0]?.name || roomData?.host_name || '';
};

// Same round = same turn and same round id. Used inside transactions to make
// sure a write is applied to the round the player was actually looking at.
const isSameRound = (a, b) =>
  a?.current_turn_index === b?.current_turn_index &&
  (a?.current_round_id ?? null) === (b?.current_round_id ?? null);

// Build the end-of-round summary from room data. Players who didn't guess get 0.
const buildRoundSummary = (roomData) => {
  const sectors = roomData.current_round_sectors || [];
  const targetPos = roomData.target_position;
  const needlePositions = roomData.needle_positions || {};
  const submitted = getGuessSubmittedNames(roomData);
  const clueGiver = getClueGiverName(roomData);
  const guessers = getActiveGuessers(roomData);

  const guesses = guessers.map(player => {
    const angle = submitted[player.name] ? needlePositions[player.name] : undefined;
    return {
      player_name: player.name,
      guess_angle: angle ?? null,
      points_earned: angle !== undefined && angle !== null ? getSectorScore(angle, sectors) : 0
    };
  });

  const totalPoints = guesses.reduce((sum, g) => sum + g.points_earned, 0);

  // Drinking: nobody correct -> clue giver drinks; partial -> missers drink; all correct -> nobody
  let drinkingPlayers = [];
  if (roomData.drinking_mode === true && targetPos !== undefined && targetPos !== null) {
    const correct = [];
    const incorrect = [];
    guesses.forEach(g => {
      if (g.guess_angle !== null && isInCorrectSector(g.guess_angle, targetPos, sectors)) {
        correct.push(g.player_name);
      } else {
        incorrect.push(g.player_name);
      }
    });
    if (correct.length === 0) {
      drinkingPlayers = [clueGiver];
    } else if (incorrect.length > 0) {
      drinkingPlayers = incorrect;
    }
  }

  return {
    turn_phase: 'summary',
    last_guess_result: {
      type: 'round_summary',
      target_angle: targetPos,
      sectors,
      guesses,
      clue_giver: clueGiver,
      clue_giver_points: totalPoints / 2,
      show_popup: true
    },
    drinking_players: drinkingPlayers.length > 0 ? drinkingPlayers : null
  };
};

const pickRandomTopic = async () => {
  const topicsSnapshot = await getDocs(collection(db, 'FrequencyTopic'));
  const valid = [];
  topicsSnapshot.forEach((d) => {
    const data = d.data();
    if (data && data.left && data.right) {
      valid.push(data);
    }
  });
  if (valid.length === 0) return null;
  const topic = valid[Math.floor(Math.random() * valid.length)];
  return { left_side: topic.left, right_side: topic.right };
};

// Alert.alert with buttons is a no-op on react-native-web, so use window.confirm there
const confirmAction = (title, message, onConfirm) => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: 'ביטול', style: 'cancel' },
    { text: 'אישור', style: 'destructive', onPress: onConfirm }
  ]);
};

const newRoundId = (turnIndex) => `${turnIndex}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default function FrequencyRoomScreen({ navigation, route }) {
  const roomCode = route?.params?.roomCode || '';
  const insets = useSafeAreaInsets();
  const [room, setRoom] = useState(null);
  const [currentPlayerName, setCurrentPlayerName] = useState('');
  const [drinkingMode, setDrinkingMode] = useState(false);
  const [isAdvancingTurn, setIsAdvancingTurn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [forceCloseModal, setForceCloseModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [pendingGuessAngle, setPendingGuessAngle] = useState(null); // Needle locked while a guess is being sent

  const needleUpdateTimeout = useRef(null);
  const isProcessingReveal = useRef(false);
  const isSubmittingGuess = useRef(false);
  const unsubscribeRef = useRef(null);
  const autoDeletionCleanupRef = useRef({ cancelGameEnd: () => {}, cancelEmptyRoom: () => {}, cancelAge: () => {} });
  const lastResetTriggerRef = useRef(null); // Track last reset trigger to show ad once per reset
  const isFinalizingRound = useRef(false);
  const currentPlayerNameRef = useRef(''); // Latest name for use inside the long-lived snapshot listener

  useEffect(() => {
    currentPlayerNameRef.current = currentPlayerName;
  }, [currentPlayerName]);

  const loadRoom = async () => {
    try {
      setIsLoading(true);
      console.log('🔵 Loading Frequency room with code:', roomCode);
      
      await waitForFirestoreReady();
      
      const roomRef = doc(db, 'FrequencyRoom', roomCode);
      const roomSnap = await getDoc(roomRef);
      
      if (!roomSnap.exists()) {
        console.warn('❌ Room not found with code:', roomCode);
        await clearCurrentRoom();
        Alert.alert('שגיאה', 'החדר לא נמצא');
        navigation.goBack();
        return;
      }
      
      const roomData = { id: roomSnap.id, ...roomSnap.data() };
      console.log('✅ Room loaded successfully:', roomData.id, 'with code:', roomData.room_code);

      // Get player name from storage
      const playerName = currentPlayerName || (await storage.getItem('playerName')) || '';
      if (playerName) {
        setCurrentPlayerName(playerName);
      }

      // Check if player exists in room (by name)
      const existingPlayerIndex = roomData.players && Array.isArray(roomData.players) 
        ? roomData.players.findIndex(p => p && p.name === playerName)
        : -1;
      const playerExists = existingPlayerIndex !== -1;
      
      if (playerName) {
        if (playerExists) {
          // Player exists - check if they're rejoining (inactive)
          const existingPlayer = roomData.players[existingPlayerIndex];
          if (existingPlayer.active === false) {
            // Rejoining: restore active state, keep score - use atomic join
            console.log('🔄 Player rejoining Frequency room:', playerName);
            const result = await atomicPlayerJoin(
              'FrequencyRoom',
              roomData.id,
              playerName,
              null, // createPlayerObject (not needed for rejoin)
              (players, name) => players.findIndex(p => p && p.name === name), // findPlayerIndex
              (existingPlayer) => ({ ...existingPlayer, active: true }), // updatePlayerObject
              3 // maxRetries
            );
            
            if (result.success && result.roomData) {
              console.log('✅ Player rejoined Frequency room successfully:', playerName);
              setRoom(result.roomData);
              return;
            } else {
              console.error('❌ Failed to rejoin Frequency room:', result.error);
              // Continue anyway - player exists, just couldn't update active status
            }
          }
          // Player already active, continue normally
        } else {
          // New player joining
          if (roomData.game_status === 'lobby') {
            // Only allow new players in lobby - use atomic join
            const playerColor = PLAYER_COLORS[roomData.players?.length % PLAYER_COLORS.length || 0];
            const result = await atomicPlayerJoin(
              'FrequencyRoom',
              roomData.id,
              playerName,
              () => ({ 
                name: playerName, 
                score: 0, 
                has_guessed: false, 
                color: playerColor,
                active: true 
              }), // createPlayerObject
              (players, name) => players.findIndex(p => p && p.name === name), // findPlayerIndex
              null, // updatePlayerObject
              3 // maxRetries
            );
            
            if (result.success && result.roomData) {
              console.log('✅ Player joined Frequency room successfully:', playerName);
              setRoom(result.roomData);
              return;
            } else {
              console.error('❌ Failed to join Frequency room:', result.error);
              Alert.alert('שגיאה', 'לא הצלחנו להצטרף לחדר. נסה שוב.');
              navigation.goBack();
              return;
            }
          } else if (roomData.game_status === 'playing' || roomData.game_status === 'finished') {
            // Game in progress - new players cannot join
            console.warn('⚠️ New player tried to join game that is already in progress');
            Alert.alert('שגיאה', 'המשחק כבר התחיל. לא ניתן להצטרף כעת.');
            navigation.goBack();
            return;
          }
        }
      }
      setRoom(roomData);
    } catch (error) {
      console.error('❌ Error loading room:', error);
      Alert.alert('שגיאה', 'לא הצלחנו לטעון את החדר');
      navigation.goBack();
    } finally {
      setIsLoading(false);
    }
  };

  // Load player name on mount (like Alias does)
  useEffect(() => {
    const loadPlayerName = async () => {
      try {
        const savedName = await storage.getItem('playerName');
        if (savedName) {
          setCurrentPlayerName(savedName);
        }
        // Drinking mode is synced from the room document by the realtime listener
      } catch (e) {
        console.warn('Could not load player name:', e);
      }
    };
    loadPlayerName();
  }, []);

  // Save room state for reconnection on refresh
  useEffect(() => {
    if (roomCode) {
      saveCurrentRoom('frequency', roomCode, {});
    }
  }, [roomCode]);

  // Initialize room and set up listener (like Alias does)
  useEffect(() => {
    if (!roomCode) {
      // Try to restore from saved state on refresh
      const restoreRoom = async () => {
        try {
          const savedRoom = await loadCurrentRoom();
          if (savedRoom && savedRoom.gameType === 'frequency' && savedRoom.roomCode) {
            // Navigate to saved room
            navigation.replace('FrequencyRoom', { roomCode: savedRoom.roomCode });
            return;
          } else {
            Alert.alert('שגיאה', 'קוד חדר חסר');
            await clearCurrentRoom();
            navigation.goBack();
            return;
          }
        } catch (error) {
          console.warn('⚠️ Error restoring room:', error);
          Alert.alert('שגיאה', 'קוד חדר חסר');
          navigation.goBack();
          return;
        }
      };
      restoreRoom();
      return;
    }

    // Cleanup any existing listener before setting up new one
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    if (needleUpdateTimeout.current) {
      clearTimeout(needleUpdateTimeout.current);
      needleUpdateTimeout.current = null;
    }

    loadRoom();
    setupRealtimeListener();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      if (needleUpdateTimeout.current) {
        clearTimeout(needleUpdateTimeout.current);
        needleUpdateTimeout.current = null;
      }
    };
  }, [roomCode]);

  // Cleanup timers/listeners on navigation away and mark player as inactive
  useEffect(() => {
    const unsubscribeNav = navigation.addListener('beforeRemove', async () => {
      // Mark player as inactive instead of removing.
      // Read-modify-write inside a transaction so we don't overwrite other
      // players' changes (scores, joins) with a stale local copy of the array.
      if (room && room.id && currentPlayerName) {
        try {
          const roomRef = doc(db, 'FrequencyRoom', room.id);
          await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(roomRef);
            if (!snap.exists()) return;
            const players = snap.data().players || [];
            if (!players.some(p => p && p.name === currentPlayerName && p.active !== false)) return;
            transaction.update(roomRef, {
              players: players.map(p => (p && p.name === currentPlayerName ? { ...p, active: false } : p))
            });
          });
          console.log('🔄 Marked player as inactive:', currentPlayerName);
        } catch (error) {
          console.error('Error marking player as inactive:', error);
        }
      }
      
      if (needleUpdateTimeout.current) {
        clearTimeout(needleUpdateTimeout.current);
      }
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    });
    return unsubscribeNav;
  }, [navigation, room, currentPlayerName]);

  // Reset force close modal flag when game status changes back to lobby
  useEffect(() => {
    if (room?.game_status === 'lobby' && forceCloseModal) {
      setForceCloseModal(false);
    }
  }, [room?.game_status, forceCloseModal]);

  const setupRealtimeListener = () => {
    // Prevent duplicate listeners
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    const roomRef = doc(db, 'FrequencyRoom', roomCode);
    
    unsubscribeRef.current = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const newRoom = { id: snapshot.id, ...snapshot.data() };
        
        // Sync drinking mode from room data
        if (newRoom.drinking_mode !== undefined) {
          setDrinkingMode(newRoom.drinking_mode);
          // Also sync to local storage
          storage.setItem('drinkingMode', newRoom.drinking_mode.toString()).catch(() => {});
        }
        
        // Handle reset trigger for showing ad to all players (non-host)
        // Show ad AFTER state has been updated to lobby (all players are on lobby screen)
        if (newRoom.reset_triggered_at && 
            newRoom.reset_triggered_at !== lastResetTriggerRef.current &&
            newRoom.game_status === 'lobby' &&
            newRoom.host_name !== currentPlayerNameRef.current) {
          lastResetTriggerRef.current = newRoom.reset_triggered_at;
          // Show ad to non-host players - they're already on lobby screen
          showInterstitialIfAvailable(() => {
            // Ad closed, continue normally
          });
        }
        
        // Firestore delivers snapshots for a single document in order, and
        // pending local writes are already reflected (latency compensation),
        // so the server state is the source of truth - apply it as-is.
        setRoom(prevRoom => (
          JSON.stringify(prevRoom) !== JSON.stringify(newRoom) ? newRoom : prevRoom
        ));
      } else {
        // Room deleted - cleanup and redirect
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
          unsubscribeRef.current = null;
        }
        if (autoDeletionCleanupRef.current.cancelGameEnd) {
          autoDeletionCleanupRef.current.cancelGameEnd();
        }
        if (autoDeletionCleanupRef.current.cancelEmptyRoom) {
          autoDeletionCleanupRef.current.cancelEmptyRoom();
        }
        if (autoDeletionCleanupRef.current.cancelAge) {
          autoDeletionCleanupRef.current.cancelAge();
        }
        clearCurrentRoom();
        // Navigate to main menu
        const parent = navigation.getParent();
        if (parent) {
          parent.reset({
            index: 0,
            routes: [{ name: 'Home' }]
          });
        } else {
          navigation.navigate('Home');
        }
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
      autoDeletionCleanupRef.current.cancelGameEnd = setupGameEndDeletion('FrequencyRoom', room.id, 5 * 60 * 1000);
      
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
      const cleanup = setupAllAutoDeletions('FrequencyRoom', room.id, {
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

  const startGame = async () => {
    if (!room || !room.id || room.host_name !== currentPlayerName) return;
    if (getActivePlayers(room).length < 2) {
      Alert.alert('שגיאה', 'צריך לפחות 2 שחקנים כדי להתחיל!');
      return;
    }

    try {
      const topic = await pickRandomTopic();
      if (!topic) {
        Alert.alert('שגיאה', 'אין נושאים זמינים במערכת!');
        return;
      }

      const roomRef = doc(db, 'FrequencyRoom', room.id);
      const started = await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(roomRef);
        if (!snap.exists()) return false;
        const fresh = snap.data();
        // Guard against double-start (double tap / two devices)
        if (fresh.game_status !== 'lobby') return false;

        const players = fresh.players || [];
        const firstActiveIndex = players.findIndex(p => p && p.name && p.active !== false);
        const startIndex = firstActiveIndex === -1 ? 0 : firstActiveIndex;

        transaction.update(roomRef, {
          game_status: 'playing',
          current_turn_index: startIndex,
          current_topic: topic,
          target_position: Math.floor(Math.random() * 180),
          current_round_sectors: calculateSectors(),
          turn_phase: 'guessing',
          needle_positions: {},
          guess_submitted_names: {},
          last_guess_result: null,
          drinking_players: null,
          winner_name: null,
          current_round_id: newRoundId(startIndex)
        });
        return true;
      });

      if (started) {
        console.log('✅ Game started successfully');
        const { logGameStart } = await import('../../utils/analytics');
        logGameStart('frequency', room.id);
      }
    } catch (error) {
      console.error('❌ Error starting game:', error);
      Alert.alert('שגיאה', 'שגיאה בהתחלת המשחק. נסה שוב.');
    }
  };

  const handleSubmitGuess = async () => {
    if (!room?.id || isMyTurn() || !isGuessingPhase(room)) return;
    if (isSubmittingGuess.current || hasPlayerSubmittedGuess(room, currentPlayerName)) return;

    isSubmittingGuess.current = true;
    const lockedAngle = global.currentNeedlePosition ?? room.needle_positions?.[currentPlayerName] ?? 90;
    // Lock the needle locally while the transaction is in flight
    setPendingGuessAngle(lockedAngle);

    // The round the player was looking at when they pressed "submit"
    const roundAtSubmit = {
      current_turn_index: room.current_turn_index,
      current_round_id: room.current_round_id
    };

    try {
      const roomRef = doc(db, 'FrequencyRoom', room.id);
      const outcome = await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(roomRef);
        if (!snap.exists()) return 'missing';
        const fresh = { id: snap.id, ...snap.data() };

        if (!isGuessingPhase(fresh) || !isSameRound(fresh, roundAtSubmit)) return 'round_changed';
        if (getClueGiverName(fresh) === currentPlayerName) return 'not_allowed';
        if (hasPlayerSubmittedGuess(fresh, currentPlayerName)) return 'already_submitted';

        // Merge into the *server* maps, not our local copy, so concurrent
        // guesses from other players are never overwritten.
        const updatedRoom = {
          ...fresh,
          needle_positions: { ...(fresh.needle_positions || {}), [currentPlayerName]: lockedAngle },
          guess_submitted_names: { ...getGuessSubmittedNames(fresh), [currentPlayerName]: true }
        };

        const updateData = {
          needle_positions: updatedRoom.needle_positions,
          guess_submitted_names: updatedRoom.guess_submitted_names
        };

        // Last guesser closes the round - computed from server data, atomically
        if (allActiveGuessersSubmitted(updatedRoom)) {
          Object.assign(updateData, buildRoundSummary(updatedRoom));
        }

        transaction.update(roomRef, updateData);
        return 'ok';
      });

      if (outcome === 'round_changed') {
        Alert.alert('שים לב', 'הסבב כבר הסתיים - הניחוש לא נשלח.');
      }
      console.log('🔵 Guess submit outcome:', outcome);
    } catch (error) {
      console.error('❌ Error submitting guess:', error);
      Alert.alert('שגיאה', 'שגיאה בשליחת הניחוש. נסה שוב.');
    } finally {
      isSubmittingGuess.current = false;
      setPendingGuessAngle(null);
    }
  };

  // Close the current round. Called automatically by the acting host when all
  // active guessers have submitted (e.g. after someone left), or manually with
  // force=true when the round is stuck waiting for a player who disconnected.
  const finalizeRound = async ({ force = false } = {}) => {
    if (!room?.id || isFinalizingRound.current) return;
    isFinalizingRound.current = true;

    const roundAtCall = {
      current_turn_index: room.current_turn_index,
      current_round_id: room.current_round_id
    };

    try {
      const roomRef = doc(db, 'FrequencyRoom', room.id);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(roomRef);
        if (!snap.exists()) return;
        const fresh = { id: snap.id, ...snap.data() };
        if (!isGuessingPhase(fresh) || !isSameRound(fresh, roundAtCall)) return;
        if (!force && !allActiveGuessersSubmitted(fresh)) return;
        transaction.update(roomRef, buildRoundSummary(fresh));
      });
    } catch (error) {
      console.error('❌ Error finalizing round:', error);
    } finally {
      isFinalizingRound.current = false;
    }
  };

  const handleForceEndRound = () => {
    confirmAction(
      'לסיים את הסבב?',
      'שחקנים שעוד לא ניחשו יקבלו 0 נקודות בסבב הזה.',
      () => finalizeRound({ force: true })
    );
  };

  const advanceToNextTurn = async () => {
    if (!room?.id || room.turn_phase !== 'summary') return;
    if (isProcessingReveal.current) return;
    isProcessingReveal.current = true;

    const roundAtCall = {
      current_turn_index: room.current_turn_index,
      current_round_id: room.current_round_id
    };

    try {
      // Topic list is a query, which can't run inside a transaction - pick it first
      const newTopic = await pickRandomTopic();
      if (!newTopic) {
        Alert.alert('שגיאה', 'אין נושאים זמינים במערכת!');
        return;
      }

      const roomRef = doc(db, 'FrequencyRoom', room.id);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(roomRef);
        if (!snap.exists()) return;
        const fresh = { id: snap.id, ...snap.data() };

        // Someone already advanced this round -> do nothing (no double scoring,
        // no second topic overwriting the first one)
        if (fresh.game_status !== 'playing' || fresh.turn_phase !== 'summary' || !isSameRound(fresh, roundAtCall)) {
          return;
        }

        // Apply exactly the points shown in the summary everyone saw
        const summary = fresh.last_guess_result?.type === 'round_summary'
          ? fresh.last_guess_result
          : buildRoundSummary(fresh).last_guess_result;

        const pointsByName = {};
        (summary.guesses || []).forEach(g => {
          pointsByName[g.player_name] = (pointsByName[g.player_name] || 0) + (g.points_earned || 0);
        });
        if (summary.clue_giver) {
          pointsByName[summary.clue_giver] = (pointsByName[summary.clue_giver] || 0) + (summary.clue_giver_points || 0);
        }

        const players = fresh.players || [];
        const updatedPlayers = players.map(p =>
          p && p.name && pointsByName[p.name] ? { ...p, score: (p.score || 0) + pointsByName[p.name] } : p
        );

        const winner = updatedPlayers
          .filter(p => p && p.name && p.active !== false && p.score >= 10)
          .sort((a, b) => b.score - a.score)[0];

        if (winner) {
          transaction.update(roomRef, {
            players: updatedPlayers,
            game_status: 'finished',
            winner_name: winner.name,
            last_guess_result: null,
            drinking_players: null
          });
          return;
        }

        // Next active player after the current clue giver (wrapping around)
        const n = updatedPlayers.length;
        let nextTurnIndex = -1;
        for (let step = 1; step <= n; step++) {
          const i = ((fresh.current_turn_index || 0) + step) % n;
          const p = updatedPlayers[i];
          if (p && p.name && p.active !== false) {
            nextTurnIndex = i;
            break;
          }
        }
        if (nextTurnIndex === -1) {
          console.warn('⚠️ No active players found, cannot advance turn');
          return;
        }

        transaction.update(roomRef, {
          players: updatedPlayers,
          current_turn_index: nextTurnIndex,
          current_topic: newTopic,
          target_position: Math.floor(Math.random() * 180),
          current_round_sectors: calculateSectors(),
          needle_positions: {},
          guess_submitted_names: {},
          turn_phase: 'clue',
          last_guess_result: null,
          drinking_players: null,
          current_round_id: newRoundId(nextTurnIndex)
        });
      });
    } catch (error) {
      console.error('Error in advanceToNextTurn:', error);
      Alert.alert('שגיאה', 'לא הצלחנו להעביר תור. נסה שוב.');
    } finally {
      isProcessingReveal.current = false;
    }
  };

  const handleRoundSummaryContinue = async () => {
    if (isAdvancingTurn) return;
    setIsAdvancingTurn(true);
    await advanceToNextTurn();
    setIsAdvancingTurn(false);
  };

  const isActingHost = !!room && !!currentPlayerName && getActingHostName(room) === currentPlayerName;

  // Acting host closes the round when every *active* guesser has submitted.
  // The last guesser normally does this inside their own transaction; this
  // covers the case where the round becomes complete because a player left.
  useEffect(() => {
    if (isActingHost && isGuessingPhase(room) && allActiveGuessersSubmitted(room)) {
      finalizeRound();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActingHost, room]);

  const resetGame = async () => {
    if (!room || !room?.id || !isHost) return;

    // Force close modal immediately
    setForceCloseModal(true);

    if (typeof global !== 'undefined') {
      global.currentNeedlePosition = undefined;
      global.currentSectors = undefined;
    }

    if (needleUpdateTimeout.current) {
      clearTimeout(needleUpdateTimeout.current);
      needleUpdateTimeout.current = null;
    }
    isProcessingReveal.current = false;
    isSubmittingGuess.current = false;

    const resetPlayers = room.players.map(p => ({ ...p, score: 0, has_guessed: false }));

    try {
      // Update game state FIRST - this moves all players to lobby screen
      const roomRef = doc(db, 'FrequencyRoom', room.id);
      await updateDoc(roomRef, {
        players: resetPlayers,
        game_status: 'lobby',
        current_turn_index: 0,
        needle_positions: {},
        guess_submitted_names: {},
        current_topic: null,
        target_position: null,
        current_round_sectors: null,
        turn_phase: null,
        last_guess_result: null,
        winner_name: null,
        drinking_players: null,
        reset_triggered_at: Date.now() // Signal to other players to show ad
      });
      
      // Reset force close flag after a short delay
      setTimeout(() => {
        setForceCloseModal(false);
      }, 100);

      // Show ad AFTER state is updated - all players are now on lobby screen
      showInterstitialIfAvailable(() => {
        // Ad closed, continue normally
      });
    } catch (error) {
      console.error('Error resetting game:', error);
      setForceCloseModal(false);
    }
  };

  const handleRulesPress = () => {
    setShowRulesModal(true);
  };

  const goBack = async () => {
    // Show interstitial ad before navigating to main menu
    showInterstitialIfAvailable(async () => {
      // Cleanup all listeners and timers
      if (needleUpdateTimeout.current) {
        clearTimeout(needleUpdateTimeout.current);
        needleUpdateTimeout.current = null;
      }
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      
      // Clear saved room state when leaving
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

  const isMyTurn = () => {
    if (!room || !room.players) return false;
    return room.players[room.current_turn_index]?.name === currentPlayerName;
  };

  const getCurrentPlayerName = () => {
    if (!room || !room.players) return '';
    return room.players[room.current_turn_index]?.name || '';
  };

  const allPlayersGuessed = () => allActiveGuessersSubmitted(room);

  if (error) {
    return (
      <GradientBackground variant="frequency">
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>שגיאה בטעינת החדר</Text>
          <Text style={styles.errorMessage}>לא הצלחנו לטעון את חדר המשחק</Text>
          <GradientButton
            title="חזרה"
            onPress={() => {
              setError(null);
              setIsLoading(true);
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
            variant="frequency"
            style={styles.errorButton}
          />
        </View>
      </GradientBackground>
    );
  }

  if (isLoading || !room) {
    return (
      <GradientBackground variant="frequency">
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.loadingText}>טוען חדר משחק...</Text>
        </View>
      </GradientBackground>
    );
  }

  const isHost = room.host_name === currentPlayerName;
  const activeGuessers = getActiveGuessers(room);
  const canGuess = !isMyTurn() &&
    isGuessingPhase(room) &&
    !hasPlayerSubmittedGuess(room, currentPlayerName) &&
    pendingGuessAngle === null;

  return (
    <GradientBackground variant="darkBlue">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!canGuess}
        nestedScrollEnabled={true}
      >
        {/* Unified Top Bar */}
        <UnifiedTopBar
          roomCode={roomCode}
          variant="frequency"
          onExit={goBack}
          onRulesPress={handleRulesPress}
          drinkingMode={drinkingMode}
        />

        {/* Drinking Mode Badge */}
        {drinkingMode && (
          <View style={styles.drinkingBadgeWrapper}>
            <View style={styles.drinkingBadge}>
              <Text style={styles.drinkingBadgeText}>🍺 מצב שתייה</Text>
            </View>
          </View>
        )}

        {/* Rules Modal */}
        <RulesModal
          visible={showRulesModal}
          onClose={() => setShowRulesModal(false)}
          variant="frequency"
        />

        {/* Lobby State */}
        {room.game_status === 'lobby' && (
          <View style={styles.lobbyCard}>
            <View style={styles.lobbyHeader}>
              <Text style={styles.lobbyTitle}>לובי - ממתינים לשחקנים</Text>
            </View>
            <View style={styles.lobbyContent}>
              {isHost ? (
                <View style={styles.hostCard}>
                  <View style={styles.hostRow}>
                    <Text style={styles.crownIcon}>👑</Text>
                    <Text style={styles.hostText}>אתה המארח</Text>
                  </View>
                  <View style={styles.drinkingToggleContainer}>
                    <Text style={styles.drinkingToggleLabel}>🔞 מצב משחקי שתייה</Text>
                    <Switch
                      value={drinkingMode}
                      onValueChange={async (checked) => {
                        setDrinkingMode(checked);
                        try {
                          // Save to local storage
                          await storage.setItem('drinkingMode', checked.toString());
                          
                          // Save to Firestore room data so all players see it
                          if (room && room.id) {
                            const roomRef = doc(db, 'FrequencyRoom', room.id);
                            await updateDoc(roomRef, {
                              drinking_mode: checked
                            });
                            console.log('✅ Drinking mode updated:', checked);
                          }
                        } catch (error) {
                          console.error('Error saving drinking mode:', error);
                          setDrinkingMode(!checked); // Revert on error
                          Alert.alert('שגיאה', 'לא הצלחנו לעדכן את מצב השתייה');
                        }
                      }}
                      trackColor={{ false: '#D1D5DB', true: '#F97316' }}
                      thumbColor={drinkingMode ? '#FFFFFF' : '#9CA3AF'}
                    />
                    <Text style={styles.drinkingToggleLabel}>🍺</Text>
                  </View>
                </View>
              ) : drinkingMode ? (
                <View style={styles.drinkingBadge}>
                  <Text style={styles.drinkingBadgeText}>🍺 מצב שתייה פעיל</Text>
                </View>
              ) : null}

              <View style={styles.playersSection}>
                <Text style={styles.playersTitle}>שחקנים בחדר ({room?.players && Array.isArray(room.players) ? room.players.length : 0}):</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.playersList}>
                  {room.players && Array.isArray(room.players) && room.players
                    .filter((player) => player != null && player.name != null)
                    .map((player, idx) => {
                      const playerName = typeof player.name === 'string' ? player.name : String(player.name || '');
                      return (
                        <View key={`player-${idx}`} style={styles.playerCard}>
                          <Text style={styles.playerCardName}>{playerName}</Text>
                          {playerName === room.host_name && (
                            <Text style={styles.crownIconSmall}>👑</Text>
                          )}
                        </View>
                      );
                    })}
                </ScrollView>
              </View>

              {isHost && (
                <GradientButton
                  title="▶ התחל משחק!"
                  onPress={startGame}
                  variant="frequency"
                  style={styles.startButton}
                  disabled={room.players.length < 2}
                />
              )}

              {!isHost && (
                <Text style={styles.waitingText}>ממתין למארח להתחיל את המשחק...</Text>
              )}
            </View>
          </View>
        )}

        {/* Round Summary Modal */}
        {room.last_guess_result?.type === 'round_summary' && room.last_guess_result.show_popup && (
          <Modal
            visible={true}
            transparent={true}
            animationType="fade"
            onRequestClose={() => {}}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.summaryHeader}>
                  <Text style={styles.summaryIcon}>📊</Text>
                  <Text style={styles.summaryTitle}>סיכום הסיבוב</Text>
                  <Text style={styles.summarySubtitle}>
                    נותן הרמז: {room.last_guess_result.clue_giver || getCurrentPlayerName()}
                  </Text>
                </View>

                <ScrollView style={styles.summaryGuesses}>
                  {/* Clue Giver Points */}
                  {room.last_guess_result.clue_giver && (
                    <View style={[styles.guessRow, styles.clueGiverRow]}>
                      <View style={styles.guessInfo}>
                        <Text style={styles.guessPlayerName}>
                          {room.last_guess_result.clue_giver} (נותן הרמז)
                        </Text>
                        <Text style={styles.guessAngle}>
                          קיבל חצי מסך הנקודות שניתנו בסבב
                        </Text>
                      </View>
                      <View style={[styles.pointsBadge, styles.clueGiverPointsBadge, (room.last_guess_result.clue_giver_points || 0) > 0 && styles.pointsBadgeSuccess]}>
                        <Text style={[styles.pointsText, (room.last_guess_result.clue_giver_points || 0) > 0 && styles.pointsTextSuccess]}>
                          {(room.last_guess_result.clue_giver_points || 0) > 0 ? `+${(room.last_guess_result.clue_giver_points || 0).toFixed(1)} נק'` : '0 נקודות'}
                        </Text>
                      </View>
                    </View>
                  )}
                  
                  {/* Guessers Points */}
                  {(room.last_guess_result.guesses || []).map((guess, idx) => (
                    <View key={`${guess.player_name}-${idx}`} style={styles.guessRow}>
                      <View style={styles.guessInfo}>
                        <Text style={styles.guessPlayerName}>{guess.player_name}</Text>
                        <Text style={styles.guessAngle}>
                          {guess.guess_angle !== null ? `ניחש ${Math.round(guess.guess_angle)}°` : 'לא הוגש ניחוש'}
                        </Text>
                      </View>
                      <View style={[styles.pointsBadge, guess.points_earned > 0 && styles.pointsBadgeSuccess]}>
                        <Text style={[styles.pointsText, guess.points_earned > 0 && styles.pointsTextSuccess]}>
                          {guess.points_earned > 0 ? `+${guess.points_earned} נק'` : '0 נקודות'}
                        </Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>

                <View style={styles.summaryGauge}>
                  <FrequencyGauge
                    leftLabel={room.current_topic?.left_side || ''}
                    rightLabel={room.current_topic?.right_side || ''}
                    targetPosition={room.last_guess_result.target_angle}
                    showTarget={true}
                    needlePosition={room.last_guess_result.target_angle}
                    canMove={false}
                    showAllNeedles={true}
                    allNeedles={room.needle_positions}
                    sectors={room.last_guess_result.sectors || room.current_round_sectors}
                    players={room.players}
                    currentPlayerName={currentPlayerName}
                  />
                </View>

                {/* Only one player advances the round, so two devices can't each
                    pick a different topic / add the round's points twice */}
                {isActingHost ? (
                  <GradientButton
                    title={isAdvancingTurn ? 'מעביר תור...' : 'המשך לסיבוב הבא'}
                    onPress={handleRoundSummaryContinue}
                    variant="frequency"
                    style={styles.continueButton}
                    disabled={isAdvancingTurn}
                  />
                ) : (
                  <Text style={styles.waitingForHostText}>
                    ממתין ל{getActingHostName(room)} להמשיך לסיבוב הבא...
                  </Text>
                )}
              </View>
            </View>
          </Modal>
        )}

        {/* Drinking Mode Modal */}
        {room.drinking_players && room.drinking_players.length > 0 && (
          <Modal
            visible={true}
            transparent={true}
            animationType="fade"
            onRequestClose={() => {}}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.drinkingIcon}>🍺</Text>
                <Text style={styles.drinkingTitle}>זמן שתייה!</Text>
                <Text style={styles.drinkingMessage}>
                  {(() => {
                    const clueGiver = room.players[room.current_turn_index]?.name;
                    const isClueGiverDrinking = room.drinking_players.includes(clueGiver);
                    
                    if (isClueGiverDrinking) {
                      return 'אף אחד לא ניחש נכון – נותן הרמז חייבת לשתות!';
                    } else if (room.drinking_players.length === 1) {
                      return 'פספסת את התדר!';
                    } else {
                      return 'פספסתם את התדר!';
                    }
                  })()}
                </Text>
                <View style={styles.drinkingPlayersList}>
                  {room.drinking_players.map((name, idx) => (
                    <View key={idx} style={styles.drinkingPlayerBadge}>
                      <Text style={styles.drinkingPlayerName}>{name}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.drinkingEmoji}>🍻</Text>
                <Text style={styles.drinkingAction}>
                  {room.drinking_players.length === 1 ? 'קח שוט! 🥃' : 'קחו שוט! 🥃'}
                </Text>
                <GradientButton
                  title="המשך"
                  onPress={async () => {
                    if (!room?.id) return;
                    try {
                      const roomRef = doc(db, 'FrequencyRoom', room.id);
                      await updateDoc(roomRef, {
                        drinking_players: null
                      });
                    } catch (error) {
                      console.error('Error clearing drinking players:', error);
                    }
                  }}
                  variant="frequency"
                  style={styles.continueButton}
                />
              </View>
            </View>
          </Modal>
        )}

        {/* Playing State */}
        {room.game_status === 'playing' && (
          <View style={styles.gameContainer}>
            <View style={styles.gameMain}>
              <View style={styles.statusCard}>
                {isMyTurn() ? (
                  <>
                    <View style={styles.turnBadge}>
                      <Text style={styles.turnBadgeText}>🎮 התור שלך!</Text>
                    </View>
                    <Text style={styles.turnMessage}>תן רמז לשחקנים האחרים - השחקנים מנחשים...</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.turnMessage}>התור של {getCurrentPlayerName()}</Text>
                    {!hasPlayerSubmittedGuess(room, currentPlayerName) && (
                      <Text style={styles.guessHint}>גע או גרור את המחוגן למיקום הנכון ולחץ שלח ניחוש</Text>
                    )}
                    {hasPlayerSubmittedGuess(room, currentPlayerName) && (
                      <View style={styles.submittedBadge}>
                        <Text style={styles.submittedText}>✓ ניחשת!</Text>
                      </View>
                    )}
                  </>
                )}
              </View>

              <View
                style={styles.gaugeContainer}
                onStartShouldSetResponder={() => canGuess}
                onMoveShouldSetResponder={() => canGuess}
                onResponderTerminationRequest={() => false}
                onTouchStart={(e) => {
                  if (canGuess) {
                    e.stopPropagation();
                  }
                }}
                onTouchMove={(e) => {
                  if (canGuess) {
                    e.stopPropagation();
                  }
                }}
              >
                <FrequencyGauge
                  // Remount per round so the needle starts centered every round
                  key={room.current_round_id || `turn-${room.current_turn_index}`}
                  leftLabel={room.current_topic?.left_side || ''}
                  rightLabel={room.current_topic?.right_side || ''}
                  targetPosition={room.target_position}
                  showTarget={isMyTurn()}
                  needlePosition={(() => {
                    if (pendingGuessAngle !== null) return pendingGuessAngle;
                    const storedPosition = room.needle_positions?.[currentPlayerName];
                    if (hasPlayerSubmittedGuess(room, currentPlayerName) && storedPosition !== undefined) {
                      return storedPosition;
                    }
                    return 90;
                  })()}
                  canMove={canGuess}
                  showAllNeedles={isMyTurn() || allPlayersGuessed()}
                  allNeedles={room.needle_positions}
                  sectors={room.current_round_sectors}
                  players={room.players}
                  currentPlayerName={currentPlayerName}
                />
              </View>

              {/* Guess Progress */}
              {isGuessingPhase(room) && (
                <View style={styles.progressCard}>
                  <Text style={styles.progressText}>
                    {activeGuessers.filter(p => hasPlayerSubmittedGuess(room, p.name)).length} מתוך {activeGuessers.length} שחקנים ניחשו
                  </Text>
                  <View style={styles.submittedPlayersList}>
                    {(() => {
                      const submittedPlayers = activeGuessers
                        .filter(p => hasPlayerSubmittedGuess(room, p.name))
                        .map(p => p.name);

                      if (submittedPlayers.length === 0) {
                        return <Text style={styles.noGuessesText}>אין שחקנים שניחשו עדיין</Text>;
                      }

                      return submittedPlayers.map((playerName, idx) => (
                        <View key={`${playerName}-${idx}`} style={styles.submittedPlayerBadge}>
                          <Text style={styles.submittedPlayerText}>✓ {playerName}</Text>
                        </View>
                      ));
                    })()}
                  </View>
                </View>
              )}

              {!isMyTurn() && isGuessingPhase(room) && !hasPlayerSubmittedGuess(room, currentPlayerName) && (
                <GradientButton
                  title={pendingGuessAngle !== null ? 'שולח...' : 'שלח ניחוש'}
                  onPress={handleSubmitGuess}
                  variant="frequency"
                  style={styles.submitButton}
                  disabled={pendingGuessAngle !== null}
                />
              )}

              {/* Host escape hatch: a player closed the app / lost connection and the round is stuck */}
              {isActingHost && isGuessingPhase(room) && activeGuessers.some(p => !hasPlayerSubmittedGuess(room, p.name)) && (
                <TouchableOpacity onPress={handleForceEndRound} style={styles.forceEndButton}>
                  <Text style={styles.forceEndText}>⏭ מישהו נתקע? סיים את הסבב עכשיו</Text>
                </TouchableOpacity>
              )}

              {isMyTurn() && room.turn_phase === 'summary' && (
                <View style={styles.waitingSummaryCard}>
                  <Text style={styles.waitingSummaryText}>📊 ממתין לסיכום הסיבוב...</Text>
                </View>
              )}
            </View>

            <View style={styles.scoreboardContainer}>
              <ScoreBoard players={room.players.filter(p => p && p.name && (p.active !== false))} currentTurnIndex={room.current_turn_index} />
            </View>
          </View>
        )}

        {/* Finished State Modal */}
        {room.game_status === 'finished' && !forceCloseModal && (
          <Modal
            visible={true}
            transparent={true}
            animationType="fade"
            onRequestClose={() => {}}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.finishedHeader}>
                  <Text style={styles.finishedTitle}>🎉 המשחק הסתיים! 🎉</Text>
                </View>

                {/* Podium */}
                <View style={styles.podiumContainer}>
                  {[...room.players]
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 3)
                    .map((player, idx) => {
                      const position = idx === 0 ? 1 : idx === 1 ? 2 : 3;
                      const medals = ['🥇', '🥈', '🥉'];
                      const order = idx === 0 ? 1 : idx === 1 ? 0 : 2;
                      
                      return (
                        <View key={player.name} style={[styles.podiumItem, { order }]}>
                          <Text style={styles.medal}>{medals[idx]}</Text>
                          <Text style={styles.podiumName}>{player.name}</Text>
                          <View style={styles.podiumScore}>
                            <Text style={styles.podiumScoreText}>{player.score} נקודות</Text>
                          </View>
                          <View style={[styles.podiumBase, styles[`podium${position}`]]}>
                            <Text style={styles.podiumNumber}>{position}</Text>
                          </View>
                        </View>
                      );
                    })}
                </View>

                {/* All Players Results */}
                {room.players.length > 3 && (
                  <View style={styles.otherPlayersSection}>
                    <Text style={styles.otherPlayersTitle}>שאר השחקנים:</Text>
                    {[...room.players]
                      .sort((a, b) => b.score - a.score)
                      .slice(3)
                      .map((player, idx) => (
                        <View key={player.name} style={styles.otherPlayerRow}>
                          <Text style={styles.otherPlayerRank}>#{idx + 4}</Text>
                          <Text style={styles.otherPlayerName}>{player.name}</Text>
                          <Text style={styles.otherPlayerScore}>{player.score} נקודות</Text>
                        </View>
                      ))}
                  </View>
                )}

                <View style={styles.finishedActions}>
                  <GradientButton
                    title="משחק חדש"
                    onPress={resetGame}
                    variant="frequency"
                    style={styles.resetButton}
                    disabled={!isHost}
                  />
                  {!isHost && (
                    <Text style={styles.hostOnlyText}>רק המארח יכול להתחיל משחק חדש</Text>
                  )}
                  <GradientButton
                    title="חזרה לתפריט הראשי"
                    onPress={goBack}
                    variant="outline"
                    style={styles.backHomeButton}
                  />
                </View>
              </View>
            </View>
          </Modal>
        )}
      </ScrollView>
      <BannerAd />
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    padding: 10,
    paddingBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
    position: 'relative',
  },
  headerCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1,
    gap: 4,
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 'auto',
    zIndex: 2,
  },
  copyLinkButtonCompact: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  copyLinkIcon: {
    fontSize: 14,
  },
  exitButtonHeader: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    minWidth: 60,
  },
  drinkingBadgeWrapper: {
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  drinkingBadge: {
    backgroundColor: '#F97316',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  drinkingBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  roomCodeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  whiteCopyLinkButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  whiteCopyLinkButtonText: {
    color: '#7A2FE2',
    fontSize: 14,
    fontWeight: '600',
  },
  roomCodeLabel: {
    color: '#6B7280',
    fontSize: 12,
  },
  roomCodeText: {
    color: '#0A1A3A', // Frequency theme color - navy blue
    fontSize: 14,
    fontWeight: '700',
  },
  copyButton: {
    padding: 4,
  },
  copyIcon: {
    fontSize: 14,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 18,
    marginTop: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  errorMessage: {
    color: '#FFFFFF',
    fontSize: 16,
    marginBottom: 24,
    textAlign: 'center',
  },
  errorButton: {
    minWidth: 120,
  },
  lobbyCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  lobbyHeader: {
    backgroundColor: '#0A1A3A', // Frequency theme color - navy blue
    padding: 20,
    alignItems: 'center',
  },
  lobbyTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  lobbyContent: {
    padding: 20,
    gap: 16,
  },
  hostCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#0A1A3A', // Frequency theme color - navy blue
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  crownIcon: {
    fontSize: 16,
  },
  hostText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
  },
  drinkingToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  drinkingToggleLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },
  playersSection: {
    gap: 12,
  },
  playersTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  playersList: {
    gap: 12,
    paddingVertical: 4,
  },
  playerCard: {
    minWidth: 100,
    backgroundColor: '#F9FAFB',
    borderWidth: 2,
    borderColor: '#0A1A3A', // Frequency theme color - navy blue
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  playerCardName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0A1A3A', // Frequency theme color - כחול כהה
  },
  crownIconSmall: {
    fontSize: 12,
  },
  startButton: {
    marginTop: 8,
  },
  waitingText: {
    textAlign: 'center',
    color: '#6B7280',
    fontSize: 14,
  },
  gameContainer: {
    gap: 16,
  },
  gameMain: {
    gap: 16,
  },
  statusCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  turnBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  turnBadgeText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  turnMessage: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
    textAlign: 'center',
  },
  guessHint: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3B82F6',
    textAlign: 'center',
  },
  submittedBadge: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  submittedText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  gaugeContainer: {
    alignItems: 'center',
    // Prevent scroll when interacting with gauge
    touchAction: 'none',
    zIndex: 10,
  },
  progressCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  progressText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
  submittedPlayersList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  noGuessesText: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  submittedPlayerBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  submittedPlayerText: {
    color: '#0A1A3A', // Frequency theme color - כחול כהה
    fontSize: 12,
    fontWeight: '600',
  },
  submitButton: {
    marginTop: 8,
  },
  waitingSummaryCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#0A1A3A', // Frequency theme color - navy blue
    borderRadius: 16,
    padding: 16,
  },
  waitingSummaryText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#0A1A3A', // Frequency theme color - navy blue
    textAlign: 'center',
  },
  forceEndButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    alignSelf: 'center',
  },
  forceEndText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  waitingForHostText: {
    marginTop: 16,
    fontSize: 15,
    fontWeight: '600',
    color: '#0A1A3A',
    textAlign: 'center',
  },
  scoreboardContainer: {
    marginTop: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 600,
    maxHeight: '90%',
    gap: 16,
  },
  summaryHeader: {
    alignItems: 'center',
    gap: 8,
  },
  summaryIcon: {
    fontSize: 48,
  },
  summaryTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0A1A3A', // Frequency theme color - navy blue
  },
  summarySubtitle: {
    fontSize: 16,
    color: '#374151',
  },
  summaryGuesses: {
    maxHeight: 200,
  },
  guessRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  clueGiverRow: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
    borderWidth: 2,
    marginBottom: 12,
  },
  clueGiverPointsBadge: {
    backgroundColor: '#DBEAFE',
  },
  guessInfo: {
    flex: 1,
  },
  guessPlayerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0A1A3A', // Frequency theme color - כחול כהה
  },
  guessAngle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  pointsBadge: {
    backgroundColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  pointsBadgeSuccess: {
    backgroundColor: '#10B981',
  },
  pointsText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  pointsTextSuccess: {
    color: '#FFFFFF',
  },
  summaryGauge: {
    alignItems: 'center',
  },
  continueButton: {
    marginTop: 8,
  },
  drinkingIcon: {
    fontSize: 56,
    textAlign: 'center',
  },
  drinkingTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#F97316',
    textAlign: 'center',
  },
  drinkingMessage: {
    fontSize: 20,
    color: '#374151',
    textAlign: 'center',
  },
  drinkingPlayersList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 16,
  },
  drinkingPlayerBadge: {
    backgroundColor: '#F97316',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  drinkingPlayerName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  drinkingEmoji: {
    fontSize: 48,
    textAlign: 'center',
  },
  drinkingAction: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F97316',
    textAlign: 'center',
  },
  finishedHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  finishedTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
  },
  podiumContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 24,
  },
  podiumItem: {
    alignItems: 'center',
    gap: 8,
  },
  medal: {
    fontSize: 40,
  },
  podiumName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  podiumScore: {
    backgroundColor: '#0A1A3A', // Frequency theme color - navy blue
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  podiumScoreText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  podiumBase: {
    width: 80,
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  podium1: {
    height: 120,
    backgroundColor: '#FCD34D',
  },
  podium2: {
    height: 100,
    backgroundColor: '#D1D5DB',
  },
  podium3: {
    height: 80,
    backgroundColor: '#F59E0B',
  },
  podiumNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  otherPlayersSection: {
    gap: 8,
    marginBottom: 24,
  },
  otherPlayersTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
  },
  otherPlayerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
  },
  otherPlayerRank: {
    fontSize: 14,
    color: '#6B7280',
  },
  otherPlayerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  otherPlayerScore: {
    fontSize: 14,
    color: '#6B7280',
  },
  finishedActions: {
    gap: 12,
    width: '100%',
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  resetButton: {
    width: '100%',
    minHeight: 48,
  },
  hostOnlyText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  backHomeButton: {
    marginTop: 8,
  },
});
