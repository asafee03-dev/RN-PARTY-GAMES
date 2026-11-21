import { arrayUnion, collection, doc, getDocs, onSnapshot, query, runTransaction, updateDoc, where } from 'firebase/firestore';
import { atomicPlayerJoin } from '../../utils/playerJoin';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BannerAd from '../../components/shared/BannerAd';
import DrawCanvas from '../../components/draw/DrawCanvas';
import Timer from '../../components/game/Timer';
import RulesModal from '../../components/shared/RulesModal';
import UnifiedTopBar from '../../components/shared/UnifiedTopBar';
import { db } from '../../firebase';
import { clearCurrentRoom, loadCurrentRoom, saveCurrentRoom } from '../../utils/navigationState';
import { showInterstitialIfAvailable } from '../../utils/interstitialAd';
import storage from '../../utils/storage';
import { S } from '../../strings';
import { colors, radii, spacing, useGameTheme } from '../../theme';
import { AppText, Badge, Button, Card, Dialog, Icon, IconButton, PlayerChip, Screen, TextField, feedback } from '../../ui';
import { getActingHostName, getFirstActiveIndex, getNextActiveIndex, markPlayerInactive } from '../../utils/gameSync';
import { serverNow, syncServerClock } from '../../utils/serverClock';
import { pickForGame, pickRandom } from '../../utils/random';

const WINNING_SCORE = 12;
const TURN_SECONDS = 60;
// If the acting host's phone is asleep, any player may end an overdue round
// after this grace period (the transaction makes duplicate attempts harmless).
const OVERDUE_GRACE_SECONDS = 5;

const getAllGuesses = (roomData) => {
  if (!roomData) return [];
  const guesses = roomData.all_guesses;
  if (Array.isArray(guesses)) {
    return guesses;
  }
  return [];
};

const parseStrokes = (drawingData) => {
  if (!drawingData) return [];
  try {
    const strokes = typeof drawingData === 'string' ? JSON.parse(drawingData) : drawingData;
    return Array.isArray(strokes) ? strokes : [];
  } catch (error) {
    console.error('Error parsing strokes:', error);
    return [];
  }
};

// 3 points for first 20s, 2 for 21-40s, 1 for 41-60s
const calculatePointsByTime = (timestamp, turnStartTime) => {
  if (!timestamp || !turnStartTime) return 1;
  const elapsed = Math.floor((timestamp - turnStartTime) / 1000);
  if (elapsed <= 20) return 3;
  if (elapsed <= 40) return 2;
  return 1;
};

// A "turn" is identified by drawer index + start time (a new start time is
// written for every turn). Used inside transactions to make sure a write is
// applied to the turn the player was actually looking at.
const isSameTurn = (a, b) =>
  a?.current_turn_index === b?.current_turn_index &&
  (a?.turn_start_time ?? null) === (b?.turn_start_time ?? null);

// Players who left the room stay in the list (active: false, score kept) but
// don't count for the lobby, podium or ranking.
const getActivePlayers = (roomData) => (roomData?.players || []).filter(p => p && p.name && p.active !== false);

const getDrawerName = (roomData) => roomData?.players?.[roomData.current_turn_index]?.name || '';

/**
 * Fields to write when a round ends (correct guess or time up), computed from
 * the given room data. Single implementation so every path scores identically.
 */
const buildRoundEnd = (roomData, guesses) => {
  const currentDrawer = getDrawerName(roomData);
  const drinkingModeActive = roomData.drinking_mode === true;

  const correctGuessers = new Map(); // playerName -> points
  let firstWinner = null;
  guesses.forEach(g => {
    if (g.isCorrect && g.timestamp) {
      const points = calculatePointsByTime(g.timestamp, roomData.turn_start_time);
      if (!correctGuessers.has(g.playerName) || correctGuessers.get(g.playerName) < points) {
        correctGuessers.set(g.playerName, points);
      }
      if (!firstWinner) {
        firstWinner = g.playerName;
      }
    }
  });
  const hasCorrectGuess = correctGuessers.size > 0;

  // Drinking: nobody correct -> drawer drinks; otherwise everyone who missed drinks
  const drinkingPlayers = [];
  if (drinkingModeActive) {
    if (!hasCorrectGuess) {
      drinkingPlayers.push(currentDrawer);
    } else {
      (roomData.players || [])
        .filter(p => p && p.name && p.name !== currentDrawer && p.active !== false)
        .forEach(p => {
          if (!correctGuessers.has(p.name)) drinkingPlayers.push(p.name);
        });
    }
  }

  const players = (roomData.players || []).map(player => {
    if (!player || player.active === false) return player;
    if (player.name === currentDrawer) {
      return { ...player, score: (player.score || 0) + (hasCorrectGuess ? 1 : 0) };
    }
    if (correctGuessers.has(player.name)) {
      return { ...player, score: (player.score || 0) + correctGuessers.get(player.name) };
    }
    return player;
  });

  const update = {
    players,
    show_round_summary: true,
    round_winner: firstWinner,
    drinking_players: drinkingModeActive && drinkingPlayers.length > 0 ? drinkingPlayers : null,
    final_draw_image: null
  };

  const winner = players
    .filter(p => p && p.name && p.active !== false && p.score >= WINNING_SCORE)
    .sort((a, b) => b.score - a.score)[0];
  if (winner) {
    update.game_status = 'finished';
    update.winner_name = winner.name;
  }
  return update;
};

// All words (a query, which can't run inside a transaction). The pick itself
// happens inside the transaction, against the room's used_words.
const loadWordPool = async () => {
  const wordsSnapshot = await getDocs(collection(db, 'DrawWord'));
  const words = [];
  wordsSnapshot.forEach((d) => {
    const w = d.data()?.word;
    if (typeof w === 'string' && w.trim()) words.push(w.trim());
  });
  return words;
};

/**
 * Picks this turn's word: never one already played in this game (used_words).
 * When every word was played, a new cycle starts without the word just
 * played. Returns { word, usedUpdate } (the used_words write), or null.
 */
const pickGameWord = (pool, fresh, { newGame = false } = {}) => {
  const r = pickForGame(pool, { used: fresh.used_words, currentKey: fresh.current_word || null, newGame });
  if (!r) return null;
  return { word: r.item, usedUpdate: r.append ? arrayUnion(r.key) : r.nextUsed };
};

export default function DrawRoomScreen({ navigation, route }) {
  const roomCode = route?.params?.roomCode || '';
  const insets = useSafeAreaInsets();
  const [room, setRoom] = useState(null);
  const [currentPlayerName, setCurrentPlayerName] = useState('');
  const [selectedColor, setSelectedColor] = useState('#000000');
  const [toolType, setToolType] = useState('pencil');
  const [brushSize, setBrushSize] = useState(3);
  const [localStrokes, setLocalStrokes] = useState([]);
  // Space available for the canvas (measured), so it fits every screen size
  const [canvasArea, setCanvasArea] = useState({ width: 0, height: 0 });
  const [guessInput, setGuessInput] = useState('');
  const [drinkingMode, setDrinkingMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(60);
  const [forceCloseModal, setForceCloseModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [isContinuingRound, setIsContinuingRound] = useState(false);

  const timerCheckInterval = useRef(null);
  const unsubscribeRef = useRef(null);
  const roomRef = useRef(room);
  const currentPlayerNameRef = useRef(currentPlayerName);
  const autoDeletionCleanupRef = useRef({ cancelGameEnd: () => {}, cancelEmptyRoom: () => {}, cancelAge: () => {} });
  const isContinuingRoundRef = useRef(false);
  const lastResetTriggerRef = useRef(null); // Track last reset trigger to show ad once per reset
  const isEndingRoundRef = useRef(false);
  const isSubmittingGuessRef = useRef(false);
  // Drawing writes are serialized so strokes are stored in the order drawn;
  // strokes still in flight are shown locally on top of the server strokes.
  const drawQueueRef = useRef(Promise.resolve());
  const pendingStrokesRef = useRef([]);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  // Measure this device's offset from the server clock once, so timers and
  // time-based points use the same clock on every phone
  useEffect(() => {
    if (room?.id) {
      syncServerClock('DrawRoom', room.id);
    }
  }, [room?.id]);

  useEffect(() => {
    currentPlayerNameRef.current = currentPlayerName;
  }, [currentPlayerName]);

  const theme = useGameTheme();

  // Haptic cues: round summary / game over (no-op on web)
  useEffect(() => {
    if (room?.show_round_summary) feedback.reveal();
  }, [room?.show_round_summary]);
  useEffect(() => {
    if (room?.game_status === 'finished') feedback.success();
  }, [room?.game_status]);

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

  // Cleanup: Reset modal state when room changes or player leaves
  useEffect(() => {
    // If room is null or player is not in room, ensure modals are closed
    if (!room || !room.players || !Array.isArray(room.players) || 
        !room.players.some(p => p && p.name === currentPlayerName)) {
      // Player is not in this room - modals should not be visible
      // The modal visibility is already controlled by the condition, but this ensures cleanup
    }
  }, [room, currentPlayerName]);

  // Save room state for reconnection on refresh
  useEffect(() => {
    if (roomCode) {
      saveCurrentRoom('draw', roomCode, {});
    }
  }, [roomCode]);

  // Initialize room and set up listener (like Alias does)
  useEffect(() => {
    if (!roomCode) {
      // Try to restore from saved state on refresh
      const restoreRoom = async () => {
        try {
          const savedRoom = await loadCurrentRoom();
          if (savedRoom && savedRoom.gameType === 'draw' && savedRoom.roomCode) {
            navigation.replace('DrawRoom', { roomCode: savedRoom.roomCode });
            return;
          } else {
            await clearCurrentRoom();
            Alert.alert(S.common.error, S.draw.room.missingRoomCode);
            navigation.goBack();
            return;
          }
        } catch (error) {
          console.warn('⚠️ Error restoring room:', error);
          await clearCurrentRoom();
          Alert.alert(S.common.error, S.draw.room.missingRoomCode);
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
    if (timerCheckInterval.current) {
      clearInterval(timerCheckInterval.current);
      timerCheckInterval.current = null;
    }

    loadRoom();
    // setupRealtimeListener will be called from loadRoom after room is loaded

    return () => {
      // Mark player as inactive instead of removing
      const currentRoom = roomRef.current;
      const playerName = currentPlayerNameRef.current;
      if (currentRoom && currentRoom.id && playerName) {
        markPlayerInactive('DrawRoom', currentRoom.id, playerName).catch(error => {
          console.error('Error marking player as inactive on unmount:', error);
        });
      }
      
      // Cleanup on unmount
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      if (timerCheckInterval.current) {
        clearInterval(timerCheckInterval.current);
        timerCheckInterval.current = null;
      }
    };
  }, [roomCode]);

  // Cleanup on navigation away and mark player as inactive
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', async () => {
      // Mark player as inactive instead of removing
      const currentRoom = roomRef.current;
      const playerName = currentPlayerNameRef.current;
      if (currentRoom && currentRoom.id && playerName) {
        try {
          await markPlayerInactive('DrawRoom', currentRoom.id, playerName);
          console.log('🔄 Marked player as inactive on navigation:', playerName);
        } catch (error) {
          console.error('Error marking player as inactive on navigation:', error);
        }
      }
      
      // Cleanup timers and listeners when navigating away
      if (timerCheckInterval.current) {
        clearInterval(timerCheckInterval.current);
        timerCheckInterval.current = null;
      }
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    });

    return unsubscribe;
  }, [navigation]);

  const setupRealtimeListener = (roomId) => {
    // Prevent duplicate listeners
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    if (!roomId) {
      console.warn('⚠️ Cannot setup listener: roomId is missing');
      return;
    }

    // Named roomDocRef so it doesn't shadow the roomRef (latest room) ref below
    const roomDocRef = doc(db, 'DrawRoom', roomId);

    unsubscribeRef.current = onSnapshot(roomDocRef, (snapshot) => {
      if (snapshot.exists()) {
        const newRoom = { id: snapshot.id, ...snapshot.data() };
        
        // Sync drinking mode from room data
        if (newRoom.drinking_mode !== undefined) {
          setDrinkingMode(newRoom.drinking_mode);
          // Also sync to local storage
          storage.setItem('drinkingMode', newRoom.drinking_mode.toString()).catch(() => {});
        }
        
        // Handle reset trigger for showing ad to all players (non-host)
        const playerName = currentPlayerNameRef.current || '';
        // Handle reset trigger for showing ad to all players (non-host)
        // Show ad AFTER state has been updated to lobby (all players are on lobby screen)
        if (newRoom.reset_triggered_at && 
            newRoom.reset_triggered_at !== lastResetTriggerRef.current &&
            newRoom.game_status === 'lobby' &&
            newRoom.host_name !== playerName) {
          lastResetTriggerRef.current = newRoom.reset_triggered_at;
          // Show ad to non-host players - they're already on lobby screen
          showInterstitialIfAvailable(() => {
            // Ad closed, continue normally
          });
        }
        
        // Check if current player is still in the room
        const isPlayerInRoom = newRoom.players && Array.isArray(newRoom.players) && 
          newRoom.players.some(p => p && p.name === playerName);
        
        // Skip snapshots that don't include this player, but keep listening.
        // Right after joining, the first snapshot(s) can still show the room
        // from before the join (the join is a transaction, which doesn't update
        // the local cache), so they don't list the player yet. Detaching here
        // used to leave every joiner stuck in the lobby when the host started.
        if (!isPlayerInRoom && playerName) {
          console.log(`⚠️ [DRAW] Snapshot without this player (fromCache=${snapshot.metadata.fromCache}), skipping`);
          return;
        }
        
        // Log game status changes for debugging
        const prevRoom = roomRef.current;
        if (prevRoom && prevRoom.game_status !== newRoom.game_status) {
          console.log(`🔄 [DRAW] Game status changed: ${prevRoom.game_status} → ${newRoom.game_status}`);
        }
        
        // Always update room so strokes propagate to all players and UI updates
        setRoom(newRoom);
        
        roomRef.current = newRoom; // Update ref immediately for isMyTurn() checks
        setIsLoading(false); // Ensure loading state is cleared when room updates
        
        // Force re-check of drawing permissions when room updates
        // This ensures isMyTurn() works correctly after room state changes
        if (newRoom.game_status === 'playing' && newRoom.current_turn_index !== undefined) {
          const playerName = currentPlayerNameRef.current || '';
          const isMyTurnNow = newRoom.players && Array.isArray(newRoom.players) && 
            newRoom.players[newRoom.current_turn_index]?.name === playerName;
          console.log(`🔄 [DRAW] Turn check - Player: ${playerName}, Turn index: ${newRoom.current_turn_index}, Is my turn: ${isMyTurnNow}`);
        }
        
        // Server strokes are the source of truth. The drawer also sees their own
        // strokes that are still being saved, so the canvas doesn't flicker.
        const isDrawerNow = newRoom.game_status === 'playing' && getDrawerName(newRoom) === playerName;
        const pending = isDrawerNow ? pendingStrokesRef.current : [];
        setLocalStrokes([...parseStrokes(newRoom.drawing_data), ...pending]);
      } else {
        // Room deleted - cleanup everything and redirect
        if (timerCheckInterval.current) {
          clearInterval(timerCheckInterval.current);
          timerCheckInterval.current = null;
        }
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
      console.error('❌ Error in realtime listener:', error);
      // Cleanup on error
      if (timerCheckInterval.current) {
        clearInterval(timerCheckInterval.current);
        timerCheckInterval.current = null;
      }
      setIsLoading(false);
    });
  };

  // Strokes are synced by the realtime listener (it also merges in-flight local strokes)
  useEffect(() => {
    // Reset force close modal flag when game status changes back to lobby
    if (room?.game_status === 'lobby' && forceCloseModal) {
      setForceCloseModal(false);
    }
  }, [room?.game_status, forceCloseModal]);

  // Timer management - with proper cleanup
  useEffect(() => {
    // Cleanup on unmount or when conditions change
    if (!room || room.game_status !== 'playing' || !room.turn_start_time || room.game_status === 'finished') {
      if (timerCheckInterval.current) {
        clearInterval(timerCheckInterval.current);
        timerCheckInterval.current = null;
      }
      return;
    }

    const updateTimer = () => {
      const currentRoom = roomRef.current;
      // Check if room still exists and is in playing state
      if (!currentRoom || !currentRoom.id || currentRoom.game_status !== 'playing' || !currentRoom.turn_start_time || currentRoom.game_status === 'finished') {
        if (timerCheckInterval.current) {
          clearInterval(timerCheckInterval.current);
          timerCheckInterval.current = null;
        }
        return;
      }

      const elapsed = Math.floor((serverNow() - currentRoom.turn_start_time) / 1000);
      const remaining = Math.max(0, 60 - elapsed);
      setTimeRemaining(remaining);

      if (remaining === 0 && !currentRoom.show_round_summary) {
        handleTimerExpiration();
      }
    };

    updateTimer();
    timerCheckInterval.current = setInterval(updateTimer, 1000);

    return () => {
      if (timerCheckInterval.current) {
        clearInterval(timerCheckInterval.current);
        timerCheckInterval.current = null;
      }
    };
  }, [room?.game_status, room?.turn_start_time, room?.show_round_summary, room?.id]);

  // End the round when time is up. Only the acting host does this, so every
  // device doesn't add the round's points again. If the host's phone is
  // asleep, any player takes over once the round is overdue; the transaction
  // re-checks the turn on the server, so a duplicate attempt is a no-op.
  const handleTimerExpiration = async () => {
    const currentRoom = roomRef.current;
    const me = currentPlayerNameRef.current;
    if (!currentRoom || !currentRoom.id || currentRoom.game_status !== 'playing') return;
    if (currentRoom.show_round_summary || !currentRoom.turn_start_time) return;
    if (isEndingRoundRef.current) return;

    const isActingHostNow = getActingHostName(currentRoom) === me;
    const overdue = serverNow() - currentRoom.turn_start_time >= (TURN_SECONDS + OVERDUE_GRACE_SECONDS) * 1000;
    if (!isActingHostNow && !overdue) return;

    isEndingRoundRef.current = true;
    const turnAtCall = {
      current_turn_index: currentRoom.current_turn_index,
      turn_start_time: currentRoom.turn_start_time
    };

    try {
      const roomDocRef = doc(db, 'DrawRoom', currentRoom.id);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(roomDocRef);
        if (!snap.exists()) return;
        const fresh = snap.data();
        if (fresh.game_status !== 'playing' || fresh.show_round_summary || !isSameTurn(fresh, turnAtCall)) {
          return; // Round already ended (by a correct guess or another device)
        }
        transaction.update(roomDocRef, buildRoundEnd(fresh, getAllGuesses(fresh)));
      });
    } catch (error) {
      console.error('❌ Error handling timer expiration:', error);
    } finally {
      isEndingRoundRef.current = false;
    }
  };

  const loadRoom = async () => {
    console.log('🔵 Loading Draw room with code:', roomCode);
    try {
      setIsLoading(true);
      
      // Query by room_code field instead of document ID
      const q = query(collection(db, 'DrawRoom'), where('room_code', '==', roomCode.toUpperCase()));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        console.warn('❌ Room not found with code:', roomCode);
        await clearCurrentRoom();
        Alert.alert(S.common.error, S.draw.room.roomNotFound);
        navigation.goBack();
        return;
      }
      
      const roomSnap = querySnapshot.docs[0];
      
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
            console.log('🔄 Player rejoining Draw room:', playerName);
            const result = await atomicPlayerJoin(
              'DrawRoom',
              roomData.id,
              playerName,
              null, // createPlayerObject (not needed for rejoin)
              (players, name) => players.findIndex(p => p && p.name === name), // findPlayerIndex
              (existingPlayer) => ({ ...existingPlayer, active: true }), // updatePlayerObject
              3 // maxRetries
            );
            
            if (result.success && result.roomData) {
              console.log('✅ Player rejoined Draw room successfully:', playerName);
              setRoom(result.roomData);
              setIsLoading(false);
              // Setup realtime listener with room ID
              if (result.roomData.id) {
                setupRealtimeListener(result.roomData.id);
              }
              return;
            } else {
              console.error('❌ Failed to rejoin Draw room:', result.error);
              // Continue anyway - player exists, just couldn't update active status
            }
          }
          // Player already active, continue normally
        } else {
          // New player joining
          if (roomData.game_status === 'lobby') {
            // Only allow new players in lobby - use atomic join
            const result = await atomicPlayerJoin(
              'DrawRoom',
              roomData.id,
              playerName,
              () => ({ name: playerName, score: 0, active: true }), // createPlayerObject
              (players, name) => players.findIndex(p => p && p.name === name), // findPlayerIndex
              null, // updatePlayerObject
              3 // maxRetries
            );
            
            if (result.success && result.roomData) {
              console.log('✅ Player joined Draw room successfully:', playerName);
              setRoom(result.roomData);
              setIsLoading(false);
              // Setup realtime listener with room ID
              if (result.roomData.id) {
                setupRealtimeListener(result.roomData.id);
              }
              return;
            } else {
              console.error('❌ Failed to join Draw room:', result.error);
              Alert.alert(S.common.error, S.draw.room.joinFailed);
              navigation.goBack();
              return;
            }
          } else if (roomData.game_status === 'playing') {
            // Game in progress - new players cannot join
            console.warn('⚠️ New player tried to join game that is already in progress');
            Alert.alert(S.common.error, S.draw.room.gameStarted);
            navigation.goBack();
            return;
          }
        }
      }
      
      setRoom(roomData);
      setIsLoading(false);
      
      // Setup realtime listener with room ID (not room code)
      if (roomData.id) {
        setupRealtimeListener(roomData.id);
      }
    } catch (error) {
      console.error('❌ Error loading room:', error);
      Alert.alert(S.common.error, S.draw.room.loadFailed);
      navigation.goBack();
    } finally {
      setIsLoading(false);
    }
  };

  const startGame = async () => {
    const currentRoom = roomRef.current || room;
    if (!currentRoom || !currentRoom.id || currentRoom.host_name !== currentPlayerName) return;

    const validPlayers = (currentRoom.players || []).filter(p => p && p.name && p.active !== false);
    if (validPlayers.length < 2) {
      Alert.alert(S.common.error, S.draw.room.needTwoActive);
      return;
    }

    try {
      const pool = await loadWordPool();
      if (pool.length === 0) {
        Alert.alert(S.common.error, S.draw.room.noWords);
        return;
      }

      const roomDocRef = doc(db, 'DrawRoom', currentRoom.id);
      const started = await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(roomDocRef);
        if (!snap.exists()) return false;
        const fresh = snap.data();
        // Guard against double-start (double tap / two devices)
        if (fresh.game_status !== 'lobby') return false;

        const players = fresh.players || [];
        // Random first drawer among active players (it used to be the host every game)
        const activeIndexes = players.map((p, i) => (p && p.name && p.active !== false ? i : -1)).filter(i => i !== -1);
        const firstDrawer = activeIndexes.length ? pickRandom(activeIndexes) : Math.max(0, getFirstActiveIndex(players));
        // New game: the used-words list starts over
        const { word, usedUpdate } = pickGameWord(pool, fresh, { newGame: true });
        transaction.update(roomDocRef, {
          game_status: 'playing',
          current_turn_index: firstDrawer,
          current_word: word,
          used_words: usedUpdate,
          drawing_data: null,
          players: players.map(p => (p ? { ...p, current_guess: '', has_submitted: false } : p)),
          final_draw_image: null,
          all_guesses: [],
          turn_start_time: serverNow(),
          show_round_summary: false,
          round_winner: null,
          drinking_players: null,
          winner_name: null
        });
        return true;
      });

      if (started) {
        console.log('✅ Game started successfully');
        const { logGameStart } = await import('../../utils/analytics');
        logGameStart('draw', currentRoom.id);
      }
    } catch (error) {
      console.error('❌ Error starting game:', error);
      Alert.alert(S.common.error, S.draw.room.startFailed);
    }
  };

  /**
   * Update the drawing on the server. Runs in a transaction that checks it's
   * still this player's turn, so a stroke finished right as the round ends
   * can't leak onto the next drawer's canvas. Writes are queued so strokes are
   * stored in the order they were drawn.
   */
  const queueDrawingWrite = (computeStrokes) => {
    const currentRoom = roomRef.current;
    const me = currentPlayerNameRef.current || currentPlayerName;
    if (!currentRoom?.id || !me) return Promise.resolve();

    const turnAtCall = {
      current_turn_index: currentRoom.current_turn_index,
      turn_start_time: currentRoom.turn_start_time
    };
    const roomDocRef = doc(db, 'DrawRoom', currentRoom.id);

    const run = async () => {
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(roomDocRef);
        if (!snap.exists()) return;
        const fresh = snap.data();
        if (fresh.game_status !== 'playing' || fresh.show_round_summary || !isSameTurn(fresh, turnAtCall)) return;
        if (getDrawerName(fresh) !== me) return;
        const next = computeStrokes(parseStrokes(fresh.drawing_data));
        transaction.update(roomDocRef, { drawing_data: next.length > 0 ? JSON.stringify(next) : null });
      });
    };

    drawQueueRef.current = drawQueueRef.current.then(run).catch(error => {
      console.error('❌ Error saving drawing:', error);
    });
    return drawQueueRef.current;
  };

  const handleStrokeComplete = (stroke) => {
    if (!isMyTurn()) {
      console.warn('⚠️ [DRAW] Stroke rejected - not my turn');
      return;
    }

    // Show immediately; the listener keeps it on screen until it's saved
    pendingStrokesRef.current = [...pendingStrokesRef.current, stroke];
    setLocalStrokes(prev => [...prev, stroke]);

    queueDrawingWrite(strokes => [...strokes, stroke]).finally(() => {
      pendingStrokesRef.current = pendingStrokesRef.current.filter(s => s !== stroke);
    });
  };

  const handleUndo = () => {
    if (!isMyTurn() || localStrokes.length === 0) return;
    setLocalStrokes(prev => prev.slice(0, -1));
    queueDrawingWrite(strokes => strokes.slice(0, -1));
  };

  const handleClearAll = () => {
    if (!isMyTurn()) return;
    setLocalStrokes([]);
    queueDrawingWrite(() => []);
  };

  const handleGuessSubmit = async () => {
    if (!guessInput.trim() || isMyTurn() || !room || !room.id) return;
    if (room.game_status !== 'playing' || room.show_round_summary) return;
    if (isSubmittingGuessRef.current) return;

    isSubmittingGuessRef.current = true;
    const guess = guessInput.trim();
    const me = currentPlayerNameRef.current || currentPlayerName;
    const turnAtSubmit = {
      current_turn_index: room.current_turn_index,
      turn_start_time: room.turn_start_time
    };

    try {
      const roomDocRef = doc(db, 'DrawRoom', room.id);
      const outcome = await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(roomDocRef);
        if (!snap.exists()) return 'missing';
        const fresh = snap.data();
        if (fresh.game_status !== 'playing' || fresh.show_round_summary || !isSameTurn(fresh, turnAtSubmit)) {
          return 'round_changed';
        }
        if (getDrawerName(fresh) === me) return 'not_allowed';

        const normalizedWord = fresh.current_word?.toLowerCase().trim();
        const isCorrect = !!normalizedWord && guess.toLowerCase() === normalizedWord;
        const now = serverNow();

        // Append to the *server's* guesses so simultaneous guesses aren't lost
        const updatedGuesses = [...getAllGuesses(fresh), { playerName: me, guess, timestamp: now, isCorrect }];
        const update = { all_guesses: updatedGuesses };

        const timerExpired = fresh.turn_start_time && now - fresh.turn_start_time >= TURN_SECONDS * 1000;
        if (isCorrect || timerExpired) {
          Object.assign(update, buildRoundEnd(fresh, updatedGuesses));
        }

        transaction.update(roomDocRef, update);
        return 'ok';
      });

      if (outcome === 'ok' || outcome === 'round_changed') {
        setGuessInput('');
      }
    } catch (error) {
      console.error('❌ Error submitting guess:', error);
      Alert.alert(S.common.error, S.draw.room.guessFailed);
    } finally {
      isSubmittingGuessRef.current = false;
    }
  };

  // Move to the next drawer. Only the acting host can do this (button is
  // hidden for everyone else), and the transaction makes sure the round is
  // still the one in the summary - so a second press can't swap the word
  // the new drawer already started drawing.
  const continueToNextRound = async () => {
    if (isContinuingRoundRef.current) return;
    const currentRoom = roomRef.current || room;
    if (!currentRoom?.id || !currentRoom.show_round_summary || currentRoom.game_status !== 'playing') return;

    isContinuingRoundRef.current = true;
    setIsContinuingRound(true);

    const turnAtCall = {
      current_turn_index: currentRoom.current_turn_index,
      turn_start_time: currentRoom.turn_start_time
    };

    try {
      // Word list is a query, which can't run inside a transaction - load it first
      const pool = await loadWordPool();
      if (pool.length === 0) {
        Alert.alert(S.common.error, S.draw.room.noWords);
        return;
      }

      const roomDocRef = doc(db, 'DrawRoom', currentRoom.id);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(roomDocRef);
        if (!snap.exists()) return;
        const fresh = snap.data();
        if (fresh.game_status !== 'playing' || !fresh.show_round_summary || !isSameTurn(fresh, turnAtCall)) {
          return; // Already advanced
        }

        const players = fresh.players || [];
        // Next active player after the current drawer (indexes into the full array)
        const nextTurnIndex = getNextActiveIndex(players, fresh.current_turn_index);
        if (nextTurnIndex === -1) {
          console.warn('⚠️ [DRAW] continueToNextRound - no active players');
          return;
        }

        // Picked from the server's used_words, so a word is never played twice in a game
        const { word, usedUpdate } = pickGameWord(pool, fresh);
        transaction.update(roomDocRef, {
          current_turn_index: nextTurnIndex,
          current_word: word,
          used_words: usedUpdate,
          drawing_data: null,
          show_round_summary: false,
          round_winner: null,
          drinking_players: null,
          players: players.map(p => (p && p.name ? { ...p, current_guess: '', has_submitted: false } : p)),
          all_guesses: [],
          final_draw_image: null,
          turn_start_time: serverNow()
        });
      });
    } catch (error) {
      console.error('❌ Error moving to next turn:', error);
      Alert.alert(S.common.error, S.draw.room.advanceFailed);
    } finally {
      isContinuingRoundRef.current = false;
      setIsContinuingRound(false);
    }
  };

  const handleRulesPress = () => {
    setShowRulesModal(true);
  };

  const resetGame = async () => {
    if (!room || !room.id || !isHost) return;

    // Cancel game end auto-deletion since we're resetting
    if (autoDeletionCleanupRef.current.cancelGameEnd) {
      autoDeletionCleanupRef.current.cancelGameEnd();
      autoDeletionCleanupRef.current.cancelGameEnd = () => {};
    }

    // Force close modal immediately
    setForceCloseModal(true);

    // Cancel all timers
    if (timerCheckInterval.current) {
      clearInterval(timerCheckInterval.current);
      timerCheckInterval.current = null;
    }

    const resetPlayers = room.players.map(p => ({ ...p, score: 0, current_guess: '', has_submitted: false }));

    try {
      // Update game state FIRST - this moves all players to lobby screen
      const roomRef = doc(db, 'DrawRoom', room.id);
      await updateDoc(roomRef, {
        players: resetPlayers,
        game_status: 'lobby',
        current_turn_index: 0,
        current_word: null,
        used_words: [],
        drawing_data: null,
        show_round_summary: false,
        round_winner: null,
        winner_name: null,
        drinking_players: null,
        all_guesses: [],
        final_draw_image: null,
        turn_start_time: null,
        reset_triggered_at: Date.now() // Signal to other players to show ad
      });
      setLocalStrokes([]);
      
      // Reset force close flag after a short delay to allow state to update
      setTimeout(() => {
        setForceCloseModal(false);
      }, 100);

      // Show ad AFTER state is updated - all players are now on lobby screen
      showInterstitialIfAvailable(() => {
        // Ad closed, continue normally
      });
    } catch (error) {
      console.error('Error resetting game:', error);
      Alert.alert(S.common.error, S.draw.room.resetFailed);
      setForceCloseModal(false);
    }
  };

  const goBack = async () => {
    // Show interstitial ad before navigating to main menu
    showInterstitialIfAvailable(async () => {
      // Cleanup: Clear any active modals/popups in local state
      // Note: We don't update Firestore show_round_summary here because other players might still be viewing it
      // Instead, we rely on the component unmounting and the modal visibility being tied to room state
      
      // Mark player as inactive instead of removing
      if (room && room.id && currentPlayerName) {
        try {
          await markPlayerInactive('DrawRoom', room.id, currentPlayerName);
          console.log('🔄 Marked player as inactive on goBack:', currentPlayerName);
        } catch (error) {
          console.error('Error marking player as inactive:', error);
        }
      }
      
      // Cleanup all listeners and timers
      if (timerCheckInterval.current) {
        clearInterval(timerCheckInterval.current);
        timerCheckInterval.current = null;
      }
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

  const isMyTurn = () => {
    // Use roomRef for most up-to-date state
    const currentRoom = roomRef.current || room;
    if (!currentRoom || !currentRoom.players || !Array.isArray(currentRoom.players)) {
      return false;
    }
    
    if (currentRoom.current_turn_index === undefined || currentRoom.current_turn_index === null) {
      return false;
    }
    
    if (currentRoom.game_status !== 'playing') {
      return false;
    }
    
    // Don't show word during round summary
    if (currentRoom.show_round_summary) {
      return false;
    }
    
    const playerName = currentPlayerNameRef.current || currentPlayerName;
    if (!playerName) {
      return false;
    }
    
    // Validate turn index is within bounds
    if (currentRoom.current_turn_index < 0 || currentRoom.current_turn_index >= currentRoom.players.length) {
      return false;
    }
    
    const currentDrawer = currentRoom.players[currentRoom.current_turn_index];
    if (!currentDrawer || !currentDrawer.name) {
      return false;
    }
    
    const result = currentDrawer.name === playerName;
    return result;
  };

  const getCurrentPlayerName = () => {
    if (!room || !room.players) return '';
    return room.players[room.current_turn_index]?.name || '';
  };

  if (error) {
    return (
      <Screen contentStyle={styles.centered}>
        <Card style={styles.stateCard}>
          <Icon name="alert" size={40} color={colors.danger} />
          <AppText variant="title" align="center">
            {S.draw.room.loadErrorTitle}
          </AppText>
          <AppText align="center" color={colors.inkSoft}>
            {S.draw.room.loadErrorMessage}
          </AppText>
          <Button
            title={S.common.back}
            icon="back"
            fullWidth
            onPress={() => {
              setError(null);
              setIsLoading(true);
              navigation.navigate('DrawHome');
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
          {S.draw.room.loading}
        </AppText>
      </Screen>
    );
  }

  const isHost = room.host_name === currentPlayerName;
  const currentDrawerName = getCurrentPlayerName();
  const allGuesses = getAllGuesses(room);

  const isActingHost = !!currentPlayerName && getActingHostName(room) === currentPlayerName;

  // Create map of correct guessers with their points
  const correctGuessersMap = new Map();
  allGuesses.forEach(g => {
    if (g.isCorrect && g.timestamp) {
      const points = calculatePointsByTime(g.timestamp, room.turn_start_time);
      // If player already guessed correctly, take the highest points
      if (!correctGuessersMap.has(g.playerName) || correctGuessersMap.get(g.playerName) < points) {
        correctGuessersMap.set(g.playerName, points);
      }
    }
  });

  // Convert to array with points information
  const correctGuessers = Array.from(correctGuessersMap.entries())
    .map(([name, points]) => {
      const player = room.players.find(p => p.name === name);
      return player ? { ...player, pointsEarned: points } : null;
    })
    .filter(Boolean);

  const iAmDrawing = isMyTurn();
  const summaryStrokes = (() => {
    // Use room.drawing_data as source of truth for summary
    if (room?.drawing_data) {
      try {
        const strokes = typeof room.drawing_data === 'string'
          ? JSON.parse(room.drawing_data)
          : room.drawing_data;
        return Array.isArray(strokes) ? strokes : [];
      } catch (error) {
        console.error('Error parsing strokes for summary:', error);
        return localStrokes;
      }
    }
    return localStrokes;
  })();
  const showSummary = !!(room && room.show_round_summary && !room.drinking_players && !forceCloseModal &&
    room.game_status !== 'finished' &&
    room.players && Array.isArray(room.players) &&
    room.players.some(p => p && p.name === currentPlayerName) &&
    currentPlayerName);
  const showDrinking = !!(room.drinking_players && room.drinking_players.length > 0 &&
    room.players && Array.isArray(room.players) &&
    room.players.some(p => p && p.name === currentPlayerName));
  const showFinished = !!(room.game_status === 'finished' && !forceCloseModal &&
    room.players && Array.isArray(room.players) &&
    room.players.some(p => p && p.name === currentPlayerName));

  // Drawer's turn: no scrolling. Word, timer and toolbar always stay on screen
  // and the (square) canvas takes the space that is left.
  const drawerMode = !!(iAmDrawing && room.game_status === 'playing' && !room.show_round_summary);
  const canvasSize = canvasArea.width > 0
    ? Math.max(120, Math.floor(drawerMode
      ? Math.min(canvasArea.width - FRAME_X, canvasArea.height - FRAME_Y)
      : Math.min(canvasArea.width - FRAME_X, MAX_GUESSER_CANVAS)))
    : 0;

  return (
    <Screen
      header={
        <UnifiedTopBar
          roomCode={roomCode}
          variant="draw"
          onExit={goBack}
          onRulesPress={handleRulesPress}
          drinkingMode={drinkingMode}
        />
      }
      footer={<BannerAd />}
      scroll={!drawerMode}
      contentStyle={drawerMode ? styles.drawerContent : undefined}
    >
      <RulesModal
        visible={showRulesModal}
        onClose={() => setShowRulesModal(false)}
        variant="draw"
      />

      {/* Lobby State */}
      {room.game_status === 'lobby' && (
        <Card style={styles.section}>
          <View style={styles.titleRow}>
            <Icon name="players" size={26} color={theme.accentInk} />
            <AppText variant="title" color={theme.accentInk} accessibilityRole="header" style={styles.flexShrink}>
              {S.draw.room.lobbyTitle}
            </AppText>
          </View>

          {isHost && (
            <Card tone="tint" padding="md" style={styles.section}>
              <Badge label={S.draw.room.youAreHost} icon="crown" tone="gold" />
              <View style={styles.toggleRow}>
                <Icon name="drink" size={22} color={colors.ink} />
                <AppText variant="bodyStrong" style={styles.flex}>
                  {S.draw.room.drinkingToggle}
                </AppText>
                <Switch
                  value={drinkingMode}
                  accessibilityLabel={S.draw.room.drinkingToggle}
                  onValueChange={async (checked) => {
                    setDrinkingMode(checked);
                    try {
                      // Save to local storage
                      await storage.setItem('drinkingMode', checked.toString());

                      // Save to Firestore room data so all players see it
                      if (room && room.id) {
                        const roomRef = doc(db, 'DrawRoom', room.id);
                        await updateDoc(roomRef, {
                          drinking_mode: checked
                        });
                        console.log('✅ Drinking mode updated:', checked);
                      }
                    } catch (error) {
                      console.error('Error saving drinking mode:', error);
                      setDrinkingMode(!checked); // Revert on error
                      Alert.alert(S.common.error, S.draw.room.drinkingUpdateFailed);
                    }
                  }}
                  trackColor={{ false: colors.line, true: theme.accent }}
                  thumbColor={colors.card}
                />
              </View>
            </Card>
          )}

          {!isHost && drinkingMode && (
            <Badge label={S.draw.room.drinkingActive} icon="drink" tone="gold" />
          )}

          <AppText variant="label" color={colors.inkSoft}>
            {S.draw.room.playersInRoom(getActivePlayers(room).length)}
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
                    color={PLAYER_TOKEN_COLORS[idx % PLAYER_TOKEN_COLORS.length]}
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
              title={S.draw.room.startGame}
              icon="play"
              onPress={startGame}
              disabled={getActivePlayers(room).length < 2}
              fullWidth
            />
          )}

          {!isHost && (
            <View style={styles.waitingRow}>
              <Icon name="hourglass" size={22} color={colors.inkSoft} />
              <AppText color={colors.inkSoft}>{S.draw.room.waitingForHostStart}</AppText>
            </View>
          )}
        </Card>
      )}

      {/* Playing State */}
      {room.game_status === 'playing' && (
        <>
          {/* Word (drawer) or who's drawing (guessers) */}
          {iAmDrawing && room.current_word ? (
            <View style={[styles.wordBar, { backgroundColor: theme.accent, borderColor: theme.accentDeep }]}>
              <View style={styles.wordText}>
                <AppText variant="label" color={theme.onAccent}>
                  {S.draw.room.yourWord}
                </AppText>
                <AppText variant="title" color={theme.onAccent} numberOfLines={1}>
                  {room.current_word}
                </AppText>
              </View>
              <IconButton icon="undo" label={S.draw.room.undo} onPress={handleUndo} disabled={localStrokes.length === 0} />
              <IconButton icon="trash" label={S.draw.room.clear} onPress={handleClearAll} disabled={localStrokes.length === 0} />
            </View>
          ) : (
            <View style={styles.drawerRow}>
              <Icon name="pencil" size={22} color={theme.accentInk} />
              <AppText variant="title" color={theme.accentInk}>
                {S.draw.room.drawing(currentDrawerName)}
              </AppText>
            </View>
          )}

          {room.turn_start_time && !room.show_round_summary && (
            <Timer
              duration={60}
              startTime={room.turn_start_time}
              onTimeUp={handleTimerExpiration}
              compact={true}
            />
          )}

          {/* Canvas - a sheet of paper in a cardboard frame, sized to the space it gets */}
          <View
            style={drawerMode ? styles.canvasAreaFill : styles.canvasArea}
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              setCanvasArea((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
            }}
          >
            {canvasSize > 0 ? (
              <View style={[styles.canvasFrame, { borderColor: iAmDrawing ? theme.accent : colors.cardboardDeep }]}>
                <DrawCanvas
                  strokes={localStrokes}
                  onStrokeComplete={handleStrokeComplete}
                  canDraw={drawerMode}
                  color={selectedColor}
                  brushSize={brushSize}
                  toolType={toolType}
                  size={canvasSize}
                />
              </View>
            ) : null}
          </View>

          {/* Drawing tools - drawer only */}
          {drawerMode && (
            <Card padding="sm" style={styles.toolbar}>
              <View style={styles.toolsRow}>
                {/* Tool toggle */}
                <View style={styles.toolGroup} accessibilityRole="radiogroup">
                  {[
                    { value: 'pencil', icon: 'pencil', label: S.draw.room.pencil },
                    { value: 'eraser', icon: 'eraser', label: S.draw.room.eraser },
                  ].map((tool) => {
                    const active = toolType === tool.value;
                    return (
                      <Pressable
                        key={tool.value}
                        onPress={() => {
                          feedback.select();
                          setToolType(tool.value);
                        }}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={tool.label}
                        style={[styles.toolButton, active && { backgroundColor: theme.accent, borderColor: theme.accentDeep }]}
                      >
                        <Icon name={tool.icon} size={24} color={active ? theme.onAccent : theme.accentInk} />
                      </Pressable>
                    );
                  })}
                </View>

                {/* Brush sizes */}
                <View style={styles.toolGroup} accessibilityRole="radiogroup">
                  {[3, 6, 9].map((size) => {
                    const active = brushSize === size;
                    return (
                      <Pressable
                        key={size}
                        onPress={() => {
                          feedback.select();
                          setBrushSize(size);
                        }}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={S.draw.room.brushSize(size)}
                        style={[styles.toolButton, active && { borderColor: theme.accent, backgroundColor: theme.tint }]}
                      >
                        <View
                          style={{
                            width: size * 2,
                            height: size * 2,
                            borderRadius: size,
                            backgroundColor: toolType === 'eraser' ? colors.inkFaint : selectedColor,
                          }}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Crayon colors (pencil only): selected one gets a check mark, not just a ring */}
              {toolType === 'pencil' && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.crayons}
                  accessibilityRole="radiogroup"
                >
                  {CRAYONS.map(({ color, name }) => {
                    const active = selectedColor === color;
                    return (
                      <Pressable
                        key={color}
                        onPress={() => {
                          feedback.select();
                          setSelectedColor(color);
                        }}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`${S.draw.room.color} ${S.draw.colorNames[name]}`}
                        hitSlop={4}
                        style={[styles.crayon, { backgroundColor: color }, active && styles.crayonActive]}
                      >
                        {active ? <Icon name="check" size={18} color={name === 'yellow' ? colors.ink : colors.white} /> : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}

            </Card>
          )}

          {/* Guess input - guessers only */}
          {!iAmDrawing && (
            <View style={styles.guessRow}>
              <TextField
                value={guessInput}
                onChangeText={setGuessInput}
                placeholder={S.draw.room.guessPlaceholder}
                accessibilityLabel={S.draw.room.guessPlaceholder}
                editable={!room.show_round_summary}
                onSubmitEditing={handleGuessSubmit}
                autoComplete="off"
                textContentType="none"
                autoCorrect={false}
                returnKeyType="send"
                style={styles.flex}
              />
              <IconButton
                icon="forward"
                variant="accent"
                label={S.draw.room.sendGuess}
                onPress={handleGuessSubmit}
                disabled={!guessInput.trim() || room.show_round_summary}
                size={52}
              />
            </View>
          )}

          {/* Drawer: latest guesses in one compact line (newest first) */}
          {drawerMode && allGuesses.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.guessStrip}>
              {[...allGuesses].reverse().map((guess, idx) => {
                const isCorrect = room.current_word && guess.guess?.toLowerCase().trim() === room.current_word.toLowerCase().trim();
                return (
                  <Badge
                    key={idx}
                    label={`${guess.playerName}: ${guess.guess}`}
                    icon={isCorrect ? 'check' : undefined}
                    tone={isCorrect ? 'success' : 'neutral'}
                  />
                );
              })}
            </ScrollView>
          )}

          {/* Guesses feed + players (guessers) */}
          {!room.show_round_summary && !drawerMode && (
            <>
              <Card padding="md" style={styles.section}>
                <View style={styles.titleRow}>
                  <Icon name="clue" size={22} color={theme.accentInk} />
                  <AppText variant="subtitle" color={theme.accentInk}>{S.draw.room.guessesTitle}</AppText>
                </View>
                {allGuesses.length === 0 ? (
                  <AppText color={colors.inkSoft}>{S.draw.room.noGuessesYet}</AppText>
                ) : (
                  <View style={styles.chips}>
                    {[...allGuesses].reverse().map((guess, idx) => {
                      const normalizedWord = room.current_word?.toLowerCase().trim();
                      const normalizedGuess = guess.guess?.toLowerCase().trim();
                      const isCorrect = normalizedWord && normalizedGuess === normalizedWord;
                      return (
                        <Badge
                          key={idx}
                          label={`${guess.playerName}: ${guess.guess}`}
                          icon={isCorrect ? 'check' : undefined}
                          tone={isCorrect ? 'success' : 'neutral'}
                        />
                      );
                    })}
                  </View>
                )}
              </Card>

              <Card padding="md" style={styles.section}>
                <View style={styles.titleRow}>
                  <Icon name="trophy" size={22} color={theme.accentInk} />
                  <AppText variant="subtitle" color={theme.accentInk}>{S.draw.room.playersTitle}</AppText>
                </View>
                <View style={styles.chips}>
                  {[...room.players].filter(p => p && p.name && (p.active !== false)).sort((a, b) => b.score - a.score).map((player, idx) => {
                    const isCurrentTurn = room.players[room.current_turn_index]?.name === player.name;
                    return (
                      <PlayerChip
                        key={player.name}
                        name={player.name}
                        color={idx === 0 && player.score > 0 ? colors.gold : PLAYER_TOKEN_COLORS[room.players.findIndex(p => p.name === player.name) % PLAYER_TOKEN_COLORS.length]}
                        isMe={player.name === currentPlayerName}
                        meLabel={S.common.you}
                        status={{
                          label: isCurrentTurn ? `${S.draw.room.pointsN(player.score)} · ${S.draw.room.drawerTag}` : S.draw.room.pointsN(player.score),
                          icon: isCurrentTurn ? 'pencil' : 'star',
                          tone: isCurrentTurn ? 'accent' : 'muted',
                        }}
                      />
                    );
                  })}
                </View>
              </Card>
            </>
          )}
        </>
      )}

      {/* Drinking */}
      <Dialog
        visible={showDrinking}
        icon="drink"
        title={S.draw.room.drinkingTitle}
        actions={
          <Button
            title={S.common.continue}
            fullWidth
            onPress={async () => {
              try {
                const roomRef = doc(db, 'DrawRoom', room.id);
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
        {showDrinking ? (
          <>
            <AppText align="center" variant="bodyStrong">
              {(() => {
                const currentDrawer = room.players[room.current_turn_index]?.name;
                const isDrawerDrinking = room.drinking_players.includes(currentDrawer);

                if (isDrawerDrinking) {
                  return S.draw.room.drinkDrawer(currentDrawer);
                } else if (room.drinking_players.length === 1) {
                  return S.draw.room.drinkOne;
                } else {
                  return S.draw.room.drinkMany;
                }
              })()}
            </AppText>
            <View style={[styles.chips, styles.centerChips]}>
              {room.drinking_players
                .filter((name) => name != null)
                .map((name, idx) => (
                  <Badge key={`drinking-${idx}`} label={typeof name === 'string' ? name : String(name || '')} icon="player" tone="gold" />
                ))}
            </View>
            <AppText variant="title" align="center" color={theme.accentInk}>
              {room.drinking_players.length === 1 ? S.draw.room.shotOne : S.draw.room.shotMany}
            </AppText>
          </>
        ) : null}
      </Dialog>

      {/* Round Summary - must be answered (no close) */}
      <Dialog
        visible={showSummary}
        icon={correctGuessers.length > 0 ? 'trophy' : 'eye'}
        title={S.draw.room.summaryTitle}
        actions={
          // Only one player advances, so two devices can't each pick a different word
          isActingHost ? (
            <Button
              title={isContinuingRound ? S.draw.room.advancing : S.draw.room.nextRound}
              icon="forward"
              iconPosition="end"
              onPress={continueToNextRound}
              loading={isContinuingRound}
              fullWidth
            />
          ) : (
            <View style={styles.waitingRow}>
              <Icon name="hourglass" size={22} color={colors.inkSoft} />
              <AppText color={colors.inkSoft} style={styles.flexShrink}>
                {S.draw.room.waitingForNext(getActingHostName(room))}
              </AppText>
            </View>
          )
        }
      >
        {showSummary ? (
          <>
            {correctGuessers.length > 0 ? (
              <>
                <AppText variant="title" align="center" color={theme.accentInk}>
                  {correctGuessers.length === 1
                    ? S.draw.room.oneGuessed(correctGuessers[0].name)
                    : S.draw.room.manyGuessed}
                </AppText>
                <View style={[styles.chips, styles.centerChips]}>
                  {correctGuessers.map((player) => (
                    <Badge key={player.name} label={S.draw.room.guesserPoints(player.name, player.pointsEarned)} icon="check" tone="success" />
                  ))}
                  {/* Drawer point when someone guessed correctly */}
                  {currentDrawerName && room.players.find(p => p.name === currentDrawerName) && (
                    <Badge key={`drawer-${currentDrawerName}`} label={S.draw.room.drawerPoint(currentDrawerName)} icon="pencil" tone="accent" />
                  )}
                </View>
              </>
            ) : (
              <AppText variant="title" align="center" color={colors.inkSoft}>
                {S.draw.room.nobodyGuessed}
              </AppText>
            )}

            <View style={[styles.reveal, { backgroundColor: theme.tint }]}>
              <AppText variant="label" color={colors.inkSoft} align="center">
                {S.draw.room.wordWas}
              </AppText>
              <AppText variant="heading" align="center" color={theme.accentInk}>
                {room.current_word}
              </AppText>
            </View>

            {/* The drawing, scaled to fit the dialog */}
            <AppText variant="label" color={colors.inkSoft}>{S.draw.room.drawingTitle}</AppText>
            <View style={styles.summaryCanvasBox}>
              <DrawCanvas strokes={summaryStrokes} canDraw={false} size={SUMMARY_CANVAS} />
            </View>

            <AppText variant="label" color={colors.inkSoft}>{S.draw.room.guessesSectionTitle}</AppText>
            {allGuesses.length === 0 ? (
              <AppText color={colors.inkSoft}>{S.draw.room.noGuessesThisRound}</AppText>
            ) : (
              [...allGuesses].reverse().map((guess, idx) => (
                <View key={idx} style={[styles.resultRow, guess.isCorrect && { borderColor: colors.success, backgroundColor: colors.successTint }]}>
                  <AppText variant="bodyStrong">{guess.playerName}</AppText>
                  <AppText color={colors.inkSoft}>{S.draw.room.guessedLabel}</AppText>
                  <AppText variant="bodyStrong" color={guess.isCorrect ? colors.successDeep : colors.ink} style={styles.flex}>
                    {guess.guess}
                  </AppText>
                  {guess.isCorrect ? <Icon name="checkCircle" size={22} color={colors.success} label={S.draw.room.correct} /> : null}
                </View>
              ))
            )}

            <AppText variant="label" color={colors.inkSoft}>{S.draw.room.scoresTitle}</AppText>
            <View style={styles.chips}>
              {getActivePlayers(room).sort((a, b) => b.score - a.score).slice(0, 4).map((player) => {
                const earnedPointThisRound = correctGuessers.some((winner) => winner.name === player.name);
                return (
                  <Badge
                    key={player.name}
                    label={`${player.name} · ${player.score}`}
                    icon={earnedPointThisRound ? 'plus' : 'star'}
                    tone={earnedPointThisRound ? 'success' : 'neutral'}
                  />
                );
              })}
            </View>
          </>
        ) : null}
      </Dialog>

      {/* Finished */}
      <Dialog
        visible={showFinished}
        icon="trophy"
        title={S.draw.room.gameOver}
        actions={
          <>
            <Button title={S.draw.room.newGame} icon="dice" onPress={resetGame} disabled={!isHost} fullWidth />
            {!isHost && (
              <AppText variant="caption" align="center" color={colors.inkSoft}>
                {S.draw.room.hostOnlyNewGame}
              </AppText>
            )}
            <Button title={S.draw.room.backToMenu} icon="home" variant="secondary" onPress={goBack} fullWidth />
          </>
        }
      >
        {showFinished ? (
          <>
            {/* Podium: 2nd - 1st - 3rd */}
            <View style={styles.podium}>
              {(() => {
                const top = getActivePlayers(room).sort((a, b) => b.score - a.score).slice(0, 3);
                const order = [top[1], top[0], top[2]].map((p, i) => (p ? { player: p, rank: [2, 1, 3][i] } : null)).filter(Boolean);
                return order.map(({ player, rank }) => (
                  <View key={player.name} style={styles.podiumItem} accessible accessibilityLabel={`${rank}. ${player.name}, ${S.draw.room.pointsN(player.score)}`}>
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
                      {S.draw.room.pointsN(player.score)}
                    </AppText>
                    <View style={[styles.podiumBase, { height: [64, 44, 30][rank - 1], backgroundColor: rank === 1 ? theme.accent : colors.cardboard }]} />
                  </View>
                ));
              })()}
            </View>

            {getActivePlayers(room).length > 3 && (
              <View style={styles.section}>
                <AppText variant="label" color={colors.inkSoft}>
                  {S.draw.room.otherPlayers}
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
                      <AppText color={colors.inkSoft}>{S.draw.room.pointsN(player.score)}</AppText>
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

// Crayon box - same colors as before, with names for screen readers
const CRAYONS = [
  { color: '#000000', name: 'black' },
  { color: '#EF4444', name: 'red' },
  { color: '#F59E0B', name: 'orange' },
  { color: '#FCD34D', name: 'yellow' },
  { color: '#10B981', name: 'green' },
  { color: '#3B82F6', name: 'blue' },
  { color: '#8B5CF6', name: 'purple' },
  { color: '#EC4899', name: 'pink' },
  { color: '#6B7280', name: 'gray' },
];

// Gold / silver / bronze (ink text on all three)
const MEDAL_COLORS = ['#E0A526', '#C9CED6', '#D49A62'];

// Visual token colors for players (Draw players have no color field)
const PLAYER_TOKEN_COLORS = ['#7A4FC2', '#2F6FB5', '#B83E33', '#3F7D3A', '#8A5A2B', '#22335C', '#B07E12', '#6B5443'];

// Canvas sizes. Drawings are stored in device-independent units (see
// DrawCanvas), so any size shows the whole drawing.
const WINDOW = Dimensions.get('window');
const SUMMARY_CANVAS = Math.min(WINDOW.width - 96, 280);
const MAX_GUESSER_CANVAS = Math.min(600, WINDOW.height * 0.6);
// canvasFrame padding + borders around the sheet
const FRAME_X = 2 * (4 + 3);
const FRAME_Y = 4 + 4 + 3 + 7;

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
  wordCard: {
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderBottomWidth: 6,
  },
  drawerContent: {
    gap: spacing.sm,
  },
  wordBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderBottomWidth: 5,
  },
  wordText: {
    flex: 1,
  },
  canvasArea: {
    width: '100%',
    alignItems: 'center',
  },
  canvasAreaFill: {
    flex: 1,
    minHeight: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbar: {
    gap: spacing.sm,
  },
  guessStrip: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  drawerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  canvasFrame: {
    alignSelf: 'center',
    padding: 4,
    borderRadius: radii.lg + 4,
    borderWidth: 3,
    borderBottomWidth: 7,
    backgroundColor: colors.cardboard,
  },
  toolsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  toolGroup: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  toolButton: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crayons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    flexGrow: 1,
    justifyContent: 'center',
  },
  crayon: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    borderWidth: 3,
    borderColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    // Outer ring so light crayons stay visible on the card
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  crayonActive: {
    transform: [{ scale: 1.15 }],
    borderColor: colors.ink,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  guessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  reveal: {
    gap: 2,
    padding: spacing.md,
    borderRadius: radii.md,
  },
  summaryCanvasBox: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
