import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, Alert, ActivityIndicator, Switch, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BannerAd from '../../components/shared/BannerAd';
import FrequencyGauge from '../../components/frequency/FrequencyGauge';
import ScoreBoard from '../../components/frequency/ScoreBoard';
import UnifiedTopBar from '../../components/shared/UnifiedTopBar';
import RulesModal from '../../components/shared/RulesModal';
import { db, waitForFirestoreReady } from '../../firebase';
import { arrayUnion, doc, getDoc, updateDoc, onSnapshot, collection, getDocs, runTransaction } from 'firebase/firestore';
import { atomicPlayerJoin } from '../../utils/playerJoin';
import storage from '../../utils/storage';
import { pickForGame, pickRandom } from '../../utils/random';
import { saveCurrentRoom, loadCurrentRoom, clearCurrentRoom } from '../../utils/navigationState';
import { setupGameEndDeletion, setupAllAutoDeletions } from '../../utils/roomManagement';
import { showInterstitialIfAvailable } from '../../utils/interstitialAd';
import { S } from '../../strings';
import { colors, radii, spacing, useGameTheme } from '../../theme';
import { AppText, Badge, Button, Card, Dialog, Icon, PlayerChip, Screen, feedback } from '../../ui';

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

const topicKey = (t) => (t.left_side || t.left || '') + '|' + (t.right_side || t.right || '');

// All topics, in the room's { left_side, right_side } shape (a query, which
// can't run inside a transaction). The pick happens inside the transaction.
const loadTopicPool = async () => {
  const topicsSnapshot = await getDocs(collection(db, 'FrequencyTopic'));
  const valid = [];
  topicsSnapshot.forEach((d) => {
    const data = d.data();
    if (data && data.left && data.right) {
      valid.push({ left_side: data.left, right_side: data.right });
    }
  });
  return valid;
};

/**
 * Picks the next topic: never one already played in this game (used_topics,
 * by topicKey). When every topic was played, a new cycle starts without the
 * topic just played. Returns { topic, usedUpdate } or null for an empty pool.
 */
const pickGameTopic = (pool, fresh, { newGame = false } = {}) => {
  const currentKey = fresh.current_topic ? topicKey(fresh.current_topic) : null;
  const r = pickForGame(pool, { used: fresh.used_topics, currentKey, newGame, keyOf: topicKey });
  if (!r) return null;
  return { topic: r.item, usedUpdate: r.append ? arrayUnion(r.key) : r.nextUsed };
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
    { text: S.common.cancel, style: 'cancel' },
    { text: S.common.confirm, style: 'destructive', onPress: onConfirm }
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
        Alert.alert(S.common.error, S.frequency.room.roomNotFound);
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
              Alert.alert(S.common.error, S.frequency.room.joinFailed);
              navigation.goBack();
              return;
            }
          } else if (roomData.game_status === 'playing' || roomData.game_status === 'finished') {
            // Game in progress - new players cannot join
            console.warn('⚠️ New player tried to join game that is already in progress');
            Alert.alert(S.common.error, S.frequency.room.gameStarted);
            navigation.goBack();
            return;
          }
        }
      }
      setRoom(roomData);
    } catch (error) {
      console.error('❌ Error loading room:', error);
      Alert.alert(S.common.error, S.frequency.room.loadFailed);
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
            Alert.alert(S.common.error, S.frequency.room.missingRoomCode);
            await clearCurrentRoom();
            navigation.goBack();
            return;
          }
        } catch (error) {
          console.warn('⚠️ Error restoring room:', error);
          Alert.alert(S.common.error, S.frequency.room.missingRoomCode);
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
      Alert.alert(S.common.error, S.frequency.room.needTwoPlayers);
      return;
    }

    try {
      const pool = await loadTopicPool();
      if (pool.length === 0) {
        Alert.alert(S.common.error, S.frequency.room.noTopics);
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
        // Random first clue-giver among active players (it used to be the host)
        const activeIndexes = players.map((p, i) => (p && p.name && p.active !== false ? i : -1)).filter(i => i !== -1);
        const startIndex = activeIndexes.length ? pickRandom(activeIndexes) : 0;
        // New game: the used-topics list starts over
        const { topic, usedUpdate } = pickGameTopic(pool, fresh, { newGame: true });

        transaction.update(roomRef, {
          game_status: 'playing',
          current_turn_index: startIndex,
          current_topic: topic,
          used_topics: usedUpdate,
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
      Alert.alert(S.common.error, S.frequency.room.startFailed);
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
        Alert.alert(S.frequency.room.heads, S.frequency.room.roundAlreadyOver);
      }
      console.log('🔵 Guess submit outcome:', outcome);
    } catch (error) {
      console.error('❌ Error submitting guess:', error);
      Alert.alert(S.common.error, S.frequency.room.guessFailed);
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
      S.frequency.room.endRoundConfirmTitle,
      S.frequency.room.endRoundConfirmBody,
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
      // Topic list is a query, which can't run inside a transaction - load it first
      const pool = await loadTopicPool();
      if (pool.length === 0) {
        Alert.alert(S.common.error, S.frequency.room.noTopics);
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

        // Picked from the server's used_topics, so a topic is never played twice in a game
        const { topic: newTopic, usedUpdate } = pickGameTopic(pool, fresh);
        transaction.update(roomRef, {
          players: updatedPlayers,
          current_turn_index: nextTurnIndex,
          current_topic: newTopic,
          used_topics: usedUpdate,
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
      Alert.alert(S.common.error, S.frequency.room.advanceFailed);
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

  const theme = useGameTheme();

  // Haptic cues for the moments that matter (no-op on web)
  const summaryVisible = room?.last_guess_result?.type === 'round_summary' && !!room?.last_guess_result?.show_popup;
  useEffect(() => {
    if (summaryVisible) feedback.reveal();
  }, [summaryVisible]);
  useEffect(() => {
    if (room?.game_status === 'finished') feedback.success();
  }, [room?.game_status]);

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
        used_topics: [],
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
      <Screen contentStyle={styles.centered}>
        <Card style={styles.stateCard}>
          <Icon name="alert" size={40} color={colors.danger} />
          <AppText variant="title" align="center">
            {S.frequency.room.loadErrorTitle}
          </AppText>
          <AppText align="center" color={colors.inkSoft}>
            {S.frequency.room.loadErrorMessage}
          </AppText>
          <Button
            title={S.common.back}
            icon="back"
            fullWidth
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
          {S.frequency.room.loading}
        </AppText>
      </Screen>
    );
  }

  const isHost = room.host_name === currentPlayerName;
  const activeGuessers = getActiveGuessers(room);
  const canGuess = !isMyTurn() &&
    isGuessingPhase(room) &&
    !hasPlayerSubmittedGuess(room, currentPlayerName) &&
    pendingGuessAngle === null;
  const summary = room.last_guess_result;
  const showSummary = summary?.type === 'round_summary' && summary.show_popup;
  const submittedGuessers = activeGuessers.filter(p => hasPlayerSubmittedGuess(room, p.name));

  return (
    <Screen
      header={
        <UnifiedTopBar
          roomCode={roomCode}
          variant="frequency"
          onExit={goBack}
          onRulesPress={handleRulesPress}
          drinkingMode={drinkingMode}
        />
      }
      footer={<BannerAd />}
      scrollEnabled={!canGuess}
    >
      {drinkingMode && <Badge label={S.common.drinkingMode} icon="drink" tone="gold" />}

      <RulesModal
        visible={showRulesModal}
        onClose={() => setShowRulesModal(false)}
        variant="frequency"
      />

      {/* Lobby State */}
      {room.game_status === 'lobby' && (
        <Card style={styles.section}>
          <View style={styles.titleRow}>
            <Icon name="players" size={26} color={theme.accentInk} />
            <AppText variant="title" color={theme.accentInk} accessibilityRole="header" style={styles.flexShrink}>
              {S.frequency.room.lobbyTitle}
            </AppText>
          </View>

          {isHost ? (
            <Card tone="tint" padding="md" style={styles.hostBox}>
              <Badge label={S.frequency.room.youAreHost} icon="crown" tone="gold" />
              <View style={styles.toggleRow}>
                <Icon name="drink" size={22} color={colors.ink} />
                <AppText variant="bodyStrong" style={styles.flex}>
                  {S.frequency.room.drinkingToggle}
                </AppText>
                <Switch
                  value={drinkingMode}
                  accessibilityLabel={S.frequency.room.drinkingToggle}
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
                      Alert.alert(S.common.error, S.frequency.room.drinkingUpdateFailed);
                    }
                  }}
                  trackColor={{ false: colors.line, true: theme.accent }}
                  thumbColor={colors.card}
                />
              </View>
            </Card>
          ) : drinkingMode ? (
            <Badge label={S.frequency.room.drinkingActive} icon="drink" tone="gold" />
          ) : null}

          <AppText variant="label" color={colors.inkSoft}>
            {S.frequency.room.playersInRoom(getActivePlayers(room).length)}
          </AppText>
          <View style={styles.chips}>
            {room.players && Array.isArray(room.players) && room.players
              .filter((player) => player != null && player.name != null)
              .map((player, idx) => {
                const playerName = typeof player.name === 'string' ? player.name : String(player.name || '');
                return (
                  <PlayerChip
                    key={`player-${idx}`}
                    name={playerName}
                    color={player.color}
                    isHost={playerName === room.host_name}
                    isMe={playerName === currentPlayerName}
                    hostLabel={S.common.host}
                    meLabel={S.common.you}
                    dimmed={player.active === false}
                  />
                );
              })}
          </View>

          {isHost && (
            <Button
              title={S.frequency.room.startGame}
              icon="play"
              onPress={startGame}
              disabled={getActivePlayers(room).length < 2}
              fullWidth
            />
          )}

          {!isHost && (
            <View style={styles.waitingRow}>
              <Icon name="hourglass" size={22} color={colors.inkSoft} />
              <AppText color={colors.inkSoft}>{S.frequency.room.waitingForHostStart}</AppText>
            </View>
          )}
        </Card>
      )}

      {/* Round Summary - must be answered (no close) */}
      <Dialog visible={!!showSummary} icon="target" title={S.frequency.room.summaryTitle}>
        {showSummary ? (
          <>
            <AppText align="center" color={colors.inkSoft}>
              {S.frequency.room.clueGiverLine(summary.clue_giver || getCurrentPlayerName())}
            </AppText>

            {summary.clue_giver && (
              <View style={[styles.resultRow, { backgroundColor: theme.tint, borderColor: theme.accent }]}>
                <View style={styles.flexShrink}>
                  <AppText variant="bodyStrong">
                    {summary.clue_giver} {S.frequency.room.clueGiverTag}
                  </AppText>
                  <AppText variant="caption" color={colors.inkSoft}>
                    {S.frequency.room.clueGiverHalf}
                  </AppText>
                </View>
                <Badge
                  label={(summary.clue_giver_points || 0) > 0
                    ? S.frequency.room.pointsPlus((summary.clue_giver_points || 0).toFixed(1))
                    : S.frequency.room.zeroPoints}
                  icon={(summary.clue_giver_points || 0) > 0 ? 'plus' : undefined}
                  tone={(summary.clue_giver_points || 0) > 0 ? 'success' : 'neutral'}
                />
              </View>
            )}

            {(summary.guesses || []).map((guess, idx) => (
              <View key={`${guess.player_name}-${idx}`} style={styles.resultRow}>
                <View style={styles.flexShrink}>
                  <AppText variant="bodyStrong">{guess.player_name}</AppText>
                  <AppText variant="caption" color={colors.inkSoft}>
                    {guess.guess_angle !== null
                      ? S.frequency.room.guessedAngle(Math.round(guess.guess_angle))
                      : S.frequency.room.noGuess}
                  </AppText>
                </View>
                <Badge
                  label={guess.points_earned > 0 ? S.frequency.room.pointsPlus(guess.points_earned) : S.frequency.room.zeroPoints}
                  icon={guess.points_earned > 0 ? 'check' : undefined}
                  tone={guess.points_earned > 0 ? 'success' : 'neutral'}
                />
              </View>
            ))}

            <View style={styles.summaryGauge}>
              <FrequencyGauge
                leftLabel={room.current_topic?.left_side || ''}
                rightLabel={room.current_topic?.right_side || ''}
                targetPosition={summary.target_angle}
                showTarget={true}
                needlePosition={summary.target_angle}
                canMove={false}
                showAllNeedles={true}
                allNeedles={room.needle_positions}
                sectors={summary.sectors || room.current_round_sectors}
                players={room.players}
                currentPlayerName={currentPlayerName}
              />
            </View>

            {/* Only one player advances the round, so two devices can't each
                pick a different topic / add the round's points twice */}
            {isActingHost ? (
              <Button
                title={isAdvancingTurn ? S.frequency.room.advancing : S.frequency.room.nextRound}
                icon="forward"
                iconPosition="end"
                onPress={handleRoundSummaryContinue}
                loading={isAdvancingTurn}
                fullWidth
              />
            ) : (
              <View style={styles.waitingRow}>
                <Icon name="hourglass" size={22} color={colors.inkSoft} />
                <AppText color={colors.inkSoft} style={styles.flexShrink}>
                  {S.frequency.room.waitingForNext(getActingHostName(room))}
                </AppText>
              </View>
            )}
          </>
        ) : null}
      </Dialog>

      {/* Drinking Mode */}
      <Dialog
        visible={!!(room.drinking_players && room.drinking_players.length > 0)}
        icon="drink"
        title={S.frequency.room.drinkingTitle}
        actions={
          <Button
            title={S.common.continue}
            fullWidth
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
          />
        }
      >
        {room.drinking_players && room.drinking_players.length > 0 ? (
          <>
            <AppText align="center" variant="bodyStrong">
              {(() => {
                const clueGiver = room.players[room.current_turn_index]?.name;
                const isClueGiverDrinking = room.drinking_players.includes(clueGiver);

                if (isClueGiverDrinking) {
                  return S.frequency.room.drinkClueGiver;
                } else if (room.drinking_players.length === 1) {
                  return S.frequency.room.drinkOne;
                } else {
                  return S.frequency.room.drinkMany;
                }
              })()}
            </AppText>
            <View style={[styles.chips, styles.centerChips]}>
              {room.drinking_players.map((name, idx) => (
                <Badge key={idx} label={name} icon="player" tone="gold" />
              ))}
            </View>
            <AppText variant="title" align="center" color={theme.accentInk}>
              {room.drinking_players.length === 1 ? S.frequency.room.shotOne : S.frequency.room.shotMany}
            </AppText>
          </>
        ) : null}
      </Dialog>

      {/* Playing State */}
      {room.game_status === 'playing' && (
        <>
          <Card tone={isMyTurn() ? 'tint' : 'paper'} style={styles.section}>
            {isMyTurn() ? (
              <>
                <Badge label={S.frequency.room.yourTurn} icon="clue" tone="accent" />
                <AppText variant="bodyStrong">{S.frequency.room.giveClue}</AppText>
              </>
            ) : (
              <>
                <AppText variant="title">{S.frequency.room.turnOf(getCurrentPlayerName())}</AppText>
                {!hasPlayerSubmittedGuess(room, currentPlayerName) && (
                  <AppText color={colors.inkSoft}>{S.frequency.room.guessHint}</AppText>
                )}
                {hasPlayerSubmittedGuess(room, currentPlayerName) && (
                  <Badge label={S.frequency.room.youGuessed} icon="check" tone="success" />
                )}
              </>
            )}
          </Card>

          <Card padding="sm" style={styles.gaugeCard}>
            <View
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
          </Card>

          {!isMyTurn() && isGuessingPhase(room) && !hasPlayerSubmittedGuess(room, currentPlayerName) && (
            <Button
              title={pendingGuessAngle !== null ? S.frequency.room.sending : S.frequency.room.submitGuess}
              icon="target"
              onPress={handleSubmitGuess}
              loading={pendingGuessAngle !== null}
              fullWidth
            />
          )}

          {/* Guess Progress */}
          {isGuessingPhase(room) && (
            <Card style={styles.section}>
              <AppText variant="bodyStrong">
                {S.frequency.room.guessedCount(submittedGuessers.length, activeGuessers.length)}
              </AppText>
              <View style={styles.chips}>
                {submittedGuessers.length === 0 ? (
                  <AppText color={colors.inkSoft}>{S.frequency.room.noGuessesYet}</AppText>
                ) : (
                  submittedGuessers.map((p, idx) => (
                    <Badge key={`${p.name}-${idx}`} label={p.name} icon="check" tone="success" />
                  ))
                )}
              </View>
            </Card>
          )}

          {/* Host escape hatch: a player closed the app / lost connection and the round is stuck */}
          {isActingHost && isGuessingPhase(room) && activeGuessers.some(p => !hasPlayerSubmittedGuess(room, p.name)) && (
            <Button
              title={S.frequency.room.forceEnd}
              icon="skip"
              variant="ghost"
              size="sm"
              onPress={handleForceEndRound}
            />
          )}

          {isMyTurn() && room.turn_phase === 'summary' && (
            <View style={styles.waitingRow}>
              <Icon name="hourglass" size={22} color={colors.inkSoft} />
              <AppText color={colors.inkSoft}>{S.frequency.room.waitingSummary}</AppText>
            </View>
          )}

          <ScoreBoard players={room.players.filter(p => p && p.name && (p.active !== false))} currentTurnIndex={room.current_turn_index} />
        </>
      )}

      {/* Finished */}
      <Dialog
        visible={room.game_status === 'finished' && !forceCloseModal}
        icon="trophy"
        title={S.frequency.room.gameOver}
        actions={
          <>
            <Button title={S.frequency.room.newGame} icon="dice" onPress={resetGame} disabled={!isHost} fullWidth />
            {!isHost && (
              <AppText variant="caption" align="center" color={colors.inkSoft}>
                {S.frequency.room.hostOnlyNewGame}
              </AppText>
            )}
            <Button title={S.frequency.room.backToMenu} icon="home" variant="secondary" onPress={goBack} fullWidth />
          </>
        }
      >
        {room.game_status === 'finished' ? (
          <>
            {/* Podium: 2nd - 1st - 3rd */}
            <View style={styles.podium}>
              {(() => {
                const top = getActivePlayers(room).sort((a, b) => b.score - a.score).slice(0, 3);
                const order = [top[1], top[0], top[2]].map((p, i) => (p ? { player: p, rank: [2, 1, 3][i] } : null)).filter(Boolean);
                return order.map(({ player, rank }) => (
                  <View key={player.name} style={styles.podiumItem} accessible accessibilityLabel={`${rank}. ${player.name}, ${S.frequency.room.pointsN(player.score)}`}>
                    <View style={[styles.medal, { backgroundColor: MEDAL_COLORS[rank - 1] }]}>
                      {rank === 1 ? <Icon name="crown" size={18} color={colors.ink} /> : null}
                      <AppText variant="title" align="center" maxScale={1.2}>
                        {rank}
                      </AppText>
                    </View>
                    <AppText variant="bodyStrong" align="center" numberOfLines={1}>
                      {player.name}
                    </AppText>
                    <AppText variant="caption" align="center" color={colors.inkSoft}>
                      {S.frequency.room.pointsN(player.score)}
                    </AppText>
                    <View style={[styles.podiumBase, { height: [64, 44, 30][rank - 1], backgroundColor: rank === 1 ? theme.accent : colors.cardboard }]} />
                  </View>
                ));
              })()}
            </View>

            {getActivePlayers(room).length > 3 && (
              <View style={styles.section}>
                <AppText variant="label" color={colors.inkSoft}>
                  {S.frequency.room.otherPlayers}
                </AppText>
                {getActivePlayers(room)
                  .sort((a, b) => b.score - a.score)
                  .slice(3)
                  .map((player, idx) => (
                    <View key={player.name} style={styles.resultRow}>
                      <AppText variant="bodyStrong" color={colors.inkSoft}>
                        #{idx + 4}
                      </AppText>
                      <AppText variant="bodyStrong" style={styles.flex}>
                        {player.name}
                      </AppText>
                      <AppText color={colors.inkSoft}>{S.frequency.room.pointsN(player.score)}</AppText>
                    </View>
                  ))}
              </View>
            )}
          </>
        ) : null}
      </Dialog>
    </Screen>
  );
}

// Gold / silver / bronze (ink text on all three)
const MEDAL_COLORS = ['#E0A526', '#C9CED6', '#D49A62'];

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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  hostBox: {
    gap: spacing.md,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  centerChips: {
    justifyContent: 'center',
  },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  gaugeCard: {
    alignItems: 'center',
  },
  summaryGauge: {
    alignItems: 'center',
    marginVertical: spacing.xs,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.paper,
  },
  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  podiumItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  medal: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.card,
    marginBottom: spacing.xs,
  },
  podiumBase: {
    width: '100%',
    borderTopLeftRadius: radii.sm,
    borderTopRightRadius: radii.sm,
    marginTop: spacing.xs,
  },
});
