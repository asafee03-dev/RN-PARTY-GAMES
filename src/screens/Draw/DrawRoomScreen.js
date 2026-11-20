import { collection, doc, getDocs, onSnapshot, query, runTransaction, updateDoc, where } from 'firebase/firestore';
import { atomicPlayerJoin } from '../../utils/playerJoin';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';
import BannerAd from '../../components/shared/BannerAd';
import DrawCanvas from '../../components/draw/DrawCanvas';
import Timer from '../../components/game/Timer';
import RulesModal from '../../components/shared/RulesModal';
import UnifiedTopBar from '../../components/shared/UnifiedTopBar';
import { db, waitForFirestoreReady } from '../../firebase';
import { clearCurrentRoom, loadCurrentRoom, saveCurrentRoom } from '../../utils/navigationState';
import { showInterstitialIfAvailable } from '../../utils/interstitialAd';
import storage from '../../utils/storage';
import { getActingHostName, getFirstActiveIndex, getNextActiveIndex, markPlayerInactive } from '../../utils/gameSync';
import { serverNow, syncServerClock } from '../../utils/serverClock';

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

const pickRandomWord = async (avoidWord) => {
  const wordsSnapshot = await getDocs(collection(db, 'DrawWord'));
  const words = [];
  wordsSnapshot.forEach((d) => {
    const w = d.data()?.word;
    if (w) words.push(w);
  });
  if (words.length === 0) return null;
  const candidates = words.length > 1 ? words.filter(w => w !== avoidWord) : words;
  return candidates[Math.floor(Math.random() * candidates.length)];
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
            Alert.alert('שגיאה', 'קוד חדר חסר');
            navigation.goBack();
            return;
          }
        } catch (error) {
          console.warn('⚠️ Error restoring room:', error);
          await clearCurrentRoom();
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

    const roomRef = doc(db, 'DrawRoom', roomId);
    
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
        
        // If player left the room, don't process updates or show popups
        if (!isPlayerInRoom && playerName) {
          console.log('⚠️ Player left room, ignoring updates');
          // Cleanup and navigate away
          if (timerCheckInterval.current) {
            clearInterval(timerCheckInterval.current);
            timerCheckInterval.current = null;
          }
          if (unsubscribeRef.current) {
            unsubscribeRef.current();
            unsubscribeRef.current = null;
          }
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
      await waitForFirestoreReady();
      
      // Query by room_code field instead of document ID
      const q = query(collection(db, 'DrawRoom'), where('room_code', '==', roomCode.toUpperCase()));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        console.warn('❌ Room not found with code:', roomCode);
        await clearCurrentRoom();
        Alert.alert('שגיאה', 'החדר לא נמצא');
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
              Alert.alert('שגיאה', 'לא הצלחנו להצטרף לחדר. נסה שוב.');
              navigation.goBack();
              return;
            }
          } else if (roomData.game_status === 'playing') {
            // Game in progress - new players cannot join
            console.warn('⚠️ New player tried to join game that is already in progress');
            Alert.alert('שגיאה', 'המשחק כבר התחיל. לא ניתן להצטרף כעת.');
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
      Alert.alert('שגיאה', 'לא הצלחנו לטעון את החדר');
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
      Alert.alert('שגיאה', 'צריך לפחות 2 שחקנים פעילים כדי להתחיל!');
      return;
    }

    try {
      const word = await pickRandomWord(null);
      if (!word) {
        Alert.alert('שגיאה', 'אין מילים זמינות במערכת!');
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
        const firstActive = getFirstActiveIndex(players);
        transaction.update(roomDocRef, {
          game_status: 'playing',
          current_turn_index: firstActive === -1 ? 0 : firstActive,
          current_word: word,
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
      Alert.alert('שגיאה', 'שגיאה בהתחלת המשחק. נסה שוב.');
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
      Alert.alert('שגיאה', 'שגיאה בשליחת הניחוש. נסה שוב.');
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
      // Word list is a query, which can't run inside a transaction - pick it first
      const word = await pickRandomWord(currentRoom.current_word);
      if (!word) {
        Alert.alert('שגיאה', 'אין מילים זמינות במערכת!');
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

        transaction.update(roomDocRef, {
          current_turn_index: nextTurnIndex,
          current_word: word,
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
      Alert.alert('שגיאה', 'לא הצלחנו לעבור לסבב הבא. נסה שוב.');
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
      Alert.alert('שגיאה', 'לא הצלחנו לאפס את המשחק. נסה שוב.');
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
      <GradientBackground variant="draw">
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>שגיאה בטעינת החדר</Text>
          <Text style={styles.errorMessage}>לא הצלחנו לטעון את חדר המשחק</Text>
          <GradientButton
            title="חזרה"
            onPress={() => {
              setError(null);
              setIsLoading(true);
              navigation.navigate('DrawHome');
            }}
            variant="draw"
            style={styles.errorButton}
          />
        </View>
      </GradientBackground>
    );
  }

  if (isLoading || !room) {
    return (
      <GradientBackground variant="draw">
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.loadingText}>טוען משחק ציור...</Text>
        </View>
      </GradientBackground>
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

  return (
    <GradientBackground variant="draw">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!isMyTurn() || !room || room.show_round_summary}
      >
        {/* Unified Top Bar */}
        <UnifiedTopBar
          roomCode={roomCode}
          variant="draw"
          onExit={goBack}
          onRulesPress={handleRulesPress}
          drinkingMode={drinkingMode}
        />

        {/* Rules Modal */}
        <RulesModal
          visible={showRulesModal}
          onClose={() => setShowRulesModal(false)}
          variant="draw"
        />

        {/* Lobby State */}
        {room.game_status === 'lobby' && (
          <View style={styles.lobbyCard}>
            <View style={styles.lobbyHeader}>
              <Text style={styles.lobbyTitle}>לובי - ממתינים לשחקנים</Text>
            </View>
            <View style={styles.lobbyContent}>
              {isHost && (
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
                            const roomRef = doc(db, 'DrawRoom', room.id);
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
              )}

              {!isHost && drinkingMode && (
                <View style={styles.drinkingBadge}>
                  <Text style={styles.drinkingBadgeText}>🍺 מצב שתייה פעיל</Text>
                </View>
              )}

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
                  variant="draw"
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

        {/* Playing State */}
        {room.game_status === 'playing' && (
          <View style={styles.gameContainer}>
            {/* Top Bar - Word (Centered) */}
            <View style={styles.topBarCentered}>
              {isMyTurn() && room.current_word ? (
                <View style={styles.wordCardCentered}>
                  <Text style={styles.wordTextCentered}>{room.current_word}</Text>
                </View>
              ) : (
                <View style={styles.drawerInfoCentered}>
                  <Text style={styles.drawerTextCentered}>{currentDrawerName || 'ממתין...'} מצייר...</Text>
                </View>
              )}
            </View>

            {/* Timer Bar (Below Word, Centered) */}
            {room.game_status === 'playing' && room.turn_start_time && !room.show_round_summary && (
              <View style={styles.timerBarCentered}>
                <Timer
                  duration={60}
                  startTime={room.turn_start_time}
                  onTimeUp={handleTimerExpiration}
                  compact={true}
                />
              </View>
            )}

              {/* Canvas - CENTER (full width) */}
            <View 
              style={styles.canvasWrapper}
              onStartShouldSetResponder={() => isMyTurn() && !room?.show_round_summary}
              onMoveShouldSetResponder={() => isMyTurn() && !room?.show_round_summary}
              onResponderTerminationRequest={() => false}
              onTouchStart={(e) => {
                if (isMyTurn() && !room?.show_round_summary) {
                  e.stopPropagation();
                }
              }}
              onTouchMove={(e) => {
                if (isMyTurn() && !room?.show_round_summary) {
                  e.stopPropagation();
                }
              }}
            >
                <View 
                  style={styles.canvasContainer} 
                  collapsable={false}
                >
                  <DrawCanvas
                    strokes={localStrokes}
                    onStrokeComplete={handleStrokeComplete}
                    canDraw={isMyTurn()}
                    color={selectedColor}
                    brushSize={brushSize}
                    toolType={toolType}
                  />
                </View>

                {/* Bottom Tools - Only for drawer */}
                {isMyTurn() && (
                  <View style={styles.bottomToolsContainer}>
                    {/* Top Row: Left (Tool Toggle), Center (Brush Sizes), Right (Undo + Clear) */}
                    <View style={styles.toolsTopRow}>
                      {/* Left Side: Tool Toggle */}
                      <View style={styles.toolToggleContainer}>
                        <Pressable
                          onPress={() => setToolType('pencil')}
                          style={[
                            styles.toolToggleButton,
                            toolType === 'pencil' && styles.toolToggleButtonActive
                          ]}
                        >
                          <Text style={[
                            styles.toolToggleText,
                            toolType === 'pencil' && styles.toolToggleTextActive
                          ]}>✏️</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setToolType('eraser')}
                          style={[
                            styles.toolToggleButton,
                            toolType === 'eraser' && styles.toolToggleButtonActive
                          ]}
                        >
                          <Text style={[
                            styles.toolToggleText,
                            toolType === 'eraser' && styles.toolToggleTextActive
                          ]}>🧹</Text>
                        </Pressable>
                      </View>

                      {/* Center: Brush Sizes */}
                      <View style={styles.brushSizesRow}>
                        {[3, 6, 9].map((size) => (
                          <Pressable
                            key={size}
                            onPress={() => setBrushSize(size)}
                            style={[
                              styles.brushSizeButton,
                              brushSize === size && styles.brushSizeButtonActive
                            ]}
                          >
                            <View
                              style={[
                                styles.brushSizeIndicator,
                                { width: size * 2, height: size * 2, borderRadius: size },
                                brushSize === size && styles.brushSizeIndicatorActive,
                                toolType === 'eraser' && styles.brushSizeIndicatorEraser
                              ]}
                            />
                          </Pressable>
                        ))}
                      </View>

                      {/* Right Side: Undo + Clear All */}
                      <View style={styles.actionButtonsContainer}>
                        <GradientButton
                          title="↶ בטל"
                          onPress={handleUndo}
                          variant="draw"
                          style={styles.actionButton}
                          disabled={localStrokes.length === 0}
                        />
                        <GradientButton
                          title="🧹 נקה"
                          onPress={handleClearAll}
                          variant="draw"
                          style={styles.actionButton}
                          disabled={localStrokes.length === 0}
                        />
                      </View>
                    </View>

                    {/* Bottom Row: All Colors (only when pencil is selected) */}
                    {toolType === 'pencil' && (
                      <View style={styles.colorsRow}>
                        {['#000000', '#EF4444', '#F59E0B', '#FCD34D', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#6B7280'].map((color) => (
                          <Pressable
                            key={color}
                            onPress={() => setSelectedColor(color)}
                            style={[
                              styles.colorButtonCompact,
                              { backgroundColor: color },
                              color === '#FFFFFF' && styles.colorButtonWhite,
                              selectedColor === color && styles.colorButtonSelected
                            ]}
                          >
                            {selectedColor === color && (
                              <View style={styles.colorCheckmark}>
                                <View style={styles.colorCheckmarkInner} />
                              </View>
                            )}
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>
                )}

                {/* Guess Input - For non-drawers */}
                {!isMyTurn() && (
                  <View style={styles.guessInputRow}>
                    <TextInput
                      style={styles.guessInputCompact}
                      value={guessInput}
                      onChangeText={setGuessInput}
                      placeholder="כתוב את הניחוש שלך..."
                      placeholderTextColor="#999"
                      editable={!room.show_round_summary}
                      onSubmitEditing={handleGuessSubmit}
                      autoComplete="off"
                      textContentType="none"
                      autoCorrect={false}
                    />
                    <Pressable
                      onPress={handleGuessSubmit}
                      disabled={!guessInput.trim() || room.show_round_summary}
                      style={[
                        styles.sendButtonCompact,
                        (!guessInput.trim() || room.show_round_summary) && styles.sendButtonDisabled
                      ]}
                    >
                      <Text style={styles.sendButtonText}>📤</Text>
                    </Pressable>
                  </View>
                )}
              </View>

            {/* Bottom Section - Players and Guesses */}
            {room.game_status === 'playing' && !room.show_round_summary && (
              <View style={styles.bottomSection}>
                {/* Shared Guesses Box */}
                <View style={styles.guessesCardBottom}>
                  <View style={styles.guessesHeader}>
                    <Text style={styles.guessesTitle}>📤 ניחושים</Text>
                  </View>
                  <ScrollView 
                    style={styles.guessesListBottom} 
                    nestedScrollEnabled
                    horizontal={true}
                    showsHorizontalScrollIndicator={false}
                  >
                    {allGuesses.length === 0 ? (
                      <Text style={styles.noGuessesText}>עדיין אין ניחושים...</Text>
                    ) : (
                      <View style={styles.guessesHorizontalContainer}>
                        {[...allGuesses].reverse().map((guess, idx) => {
                          const normalizedWord = room.current_word?.toLowerCase().trim();
                          const normalizedGuess = guess.guess?.toLowerCase().trim();
                          const isCorrect = normalizedWord && normalizedGuess === normalizedWord;
                          return (
                            <View
                              key={idx}
                              style={[styles.guessItemBottom, isCorrect && styles.guessItemCorrect]}
                            >
                              <View style={styles.guessItemContent}>
                                <Text style={styles.guessPlayerName}>{guess.playerName}:</Text>
                                <Text style={[styles.guessText, isCorrect && styles.guessTextCorrect]}>
                                  {guess.guess}
                                </Text>
                              </View>
                              {isCorrect && (
                                <Text style={styles.checkmark}>✓</Text>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </ScrollView>
                </View>

                {/* Players Scoreboard */}
                <View style={styles.scoreboardCardBottom}>
                  <View style={styles.scoreboardHeader}>
                    <Text style={styles.scoreboardTitle}>🏆 שחקנים</Text>
                  </View>
                  <ScrollView 
                    style={styles.scoreboardListBottom}
                    showsVerticalScrollIndicator={false}
                    nestedScrollEnabled
                    horizontal={true}
                    showsHorizontalScrollIndicator={false}
                  >
                    <View style={styles.scoreboardHorizontalContainer}>
                      {[...room.players].filter(p => p && p.name && (p.active !== false)).sort((a, b) => b.score - a.score).map((player, idx) => {
                        const isCurrentTurn = room.players[room.current_turn_index]?.name === player.name;
                        
                        return (
                          <View
                            key={player.name}
                            style={[styles.scoreboardPlayerCardBottom, isCurrentTurn && styles.scoreboardPlayerCardActive]}
                          >
                            <View style={styles.scoreboardPlayerContent}>
                              <View style={styles.scoreboardRankRow}>
                                <Text style={styles.scoreboardRank}>#{idx + 1}</Text>
                                {idx === 0 && player.score > 0 && (
                                  <Text style={styles.trophyIcon}>🏆</Text>
                                )}
                              </View>
                              <Text style={styles.scoreboardPlayerName} numberOfLines={1}>{player.name}</Text>
                              <Text style={styles.scoreboardScore}>{player.score} נקודות</Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Drinking Mode Modal */}
        {room.drinking_players && room.drinking_players.length > 0 && 
         room.players && Array.isArray(room.players) && 
         room.players.some(p => p && p.name === currentPlayerName) && (
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
                    const currentDrawer = room.players[room.current_turn_index]?.name;
                    const isDrawerDrinking = room.drinking_players.includes(currentDrawer);
                    
                    if (isDrawerDrinking) {
                      return `אף אחד לא ניחש נכון – ${currentDrawer} חייבת לשתות!`;
                    } else if (room.drinking_players.length === 1) {
                      return 'לא ניחשת נכון!';
                    } else {
                      return 'לא ניחשתם נכון!';
                    }
                  })()}
                </Text>
                <View style={styles.drinkingPlayersList}>
                  {room.drinking_players && Array.isArray(room.drinking_players) && room.drinking_players
                    .filter((name) => name != null)
                    .map((name, idx) => {
                      const playerName = typeof name === 'string' ? name : String(name || '');
                      return (
                        <View key={`drinking-${idx}`} style={styles.drinkingPlayerBadge}>
                          <Text style={styles.drinkingPlayerName}>{playerName}</Text>
                        </View>
                      );
                    })}
                </View>
                <Text style={styles.drinkingEmoji}>🍻</Text>
                <Text style={styles.drinkingAction}>
                  {room.drinking_players.length === 1 ? 'קח שוט! 🥃' : 'קחו שוט! 🥃'}
                </Text>
                <GradientButton
                  title="המשך"
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
                  variant="orange"
                  style={styles.continueButton}
                />
              </View>
            </View>
          </Modal>
        )}

        {/* Round Summary Modal */}
        {room && room.show_round_summary && !room.drinking_players && !forceCloseModal &&
         room.game_status !== 'finished' &&
         room.players && Array.isArray(room.players) && 
         room.players.some(p => p && p.name === currentPlayerName) &&
         currentPlayerName && (
          <Modal
            visible={true}
            transparent={true}
            animationType="fade"
            onRequestClose={() => {}}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContentSummary}>
                <ScrollView 
                  style={styles.summaryScrollContent}
                  contentContainerStyle={styles.summaryScrollContainer}
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled={true}
                >
                  <View style={styles.summaryHeader}>
                    <Text style={styles.summaryTitle}>סיכום הסבב</Text>
                  </View>

                  {/* Winner announcement */}
                  <View style={styles.winnerCard}>
                    {correctGuessers.length > 0 ? (
                      <>
                        <Text style={styles.trophyIconLarge}>🏆</Text>
                        <Text style={styles.winnerTitle}>
                          {correctGuessers.length === 1
                            ? `${correctGuessers[0].name} ניחש נכון!`
                            : 'כל הכבוד למנחשים המהירים!'}
                        </Text>
                        <View style={styles.winnersList}>
                          {correctGuessers.map((player) => (
                            <View key={player.name} style={styles.winnerBadge}>
                              <Text style={styles.winnerBadgeText}>
                                {player.name} +{player.pointsEarned} נקודות
                              </Text>
                            </View>
                          ))}
                          {/* Show drawer points if someone guessed correctly */}
                          {currentDrawerName && room.players.find(p => p.name === currentDrawerName) && (
                            <View key={`drawer-${currentDrawerName}`} style={styles.winnerBadge}>
                              <Text style={styles.winnerBadgeText}>
                                {currentDrawerName} (הצייר) +1 נקודה
                              </Text>
                            </View>
                          )}
                        </View>
                      </>
                    ) : (
                      <>
                        <Text style={styles.eyeIconLarge}>👁️</Text>
                        <Text style={styles.noWinnerTitle}>אף אחד לא ניחש נכון הפעם...</Text>
                      </>
                    )}
                    <Text style={styles.wordReveal}>
                      המילה הייתה: <Text style={styles.wordRevealBold}>{room.current_word}</Text>
                    </Text>
                  </View>

                  {/* Drawing - Full Display */}
                  <View style={styles.drawingSection}>
                    <Text style={styles.drawingSectionTitle}>הציור:</Text>
                    <View style={styles.drawingDisplay}>
                      <DrawCanvas
                        strokes={(() => {
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
                        })()}
                        onStrokeComplete={() => {}}
                        canDraw={false}
                        color={selectedColor}
                        brushSize={brushSize}
                        toolType={toolType}
                      />
                    </View>
                  </View>

                  {/* Guesses - Scrollable list */}
                  <View style={styles.guessesSection}>
                    <Text style={styles.guessesSectionTitle}>ניחושים:</Text>
                    <View style={styles.summaryGuessesList}>
                      {allGuesses.length === 0 ? (
                        <Text style={styles.noGuessesTextSummary}>לא היו ניחושים בסבב זה</Text>
                      ) : (
                        [...allGuesses].reverse().map((guess, idx) => {
                          const isCorrect = guess.isCorrect;
                          return (
                            <View
                              key={idx}
                              style={[styles.summaryGuessItem, isCorrect && styles.summaryGuessItemCorrect]}
                            >
                              <View style={styles.summaryGuessContent}>
                                <Text style={styles.summaryGuessPlayerName}>{guess.playerName}</Text>
                                <Text style={styles.summaryGuessLabel}>ניחש:</Text>
                                <Text style={[styles.summaryGuessText, isCorrect && styles.summaryGuessTextCorrect]}>
                                  {guess.guess}
                                </Text>
                              </View>
                              {isCorrect && (
                                <Text style={styles.summaryCheckmark}>✓</Text>
                              )}
                            </View>
                          );
                        })
                      )}
                    </View>
                  </View>

                  {/* Updated Scores - Compact */}
                  <View style={styles.scoresSection}>
                    <Text style={styles.scoresSectionTitle}>לוח תוצאות:</Text>
                    <View style={styles.scoresGrid}>
                      {[...room.players].sort((a, b) => b.score - a.score).slice(0, 4).map((player) => {
                        const earnedPointThisRound = correctGuessers.some(
                          (winner) => winner.name === player.name
                        );
                        return (
                          <View
                            key={player.name}
                            style={[styles.scoreItem, earnedPointThisRound && styles.scoreItemEarned]}
                          >
                            <Text style={styles.scoreItemName}>{player.name}</Text>
                            <View style={styles.scoreItemBadge}>
                              <Text style={styles.scoreItemBadgeText}>{player.score}</Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                </ScrollView>

                {/* Fixed button at bottom */}
                <View style={styles.summaryButtonContainer}>
                  {/* Only one player advances, so two devices can't each pick a different word */}
                  {isActingHost ? (
                    <GradientButton
                      title={isContinuingRound ? 'עובר לסבב הבא...' : 'המשך לסבב הבא'}
                      onPress={continueToNextRound}
                      variant="draw"
                      style={styles.continueButton}
                      disabled={isContinuingRound}
                    />
                  ) : (
                    <Text style={styles.waitingForHostText}>
                      ממתין ל{getActingHostName(room)} להמשיך לסבב הבא...
                    </Text>
                  )}
                </View>
              </View>
            </View>
          </Modal>
        )}

        {/* Finished State Modal */}
        {room.game_status === 'finished' && !forceCloseModal &&
         room.players && Array.isArray(room.players) && 
         room.players.some(p => p && p.name === currentPlayerName) && (
          <Modal
            visible={true}
            transparent={true}
            animationType="fade"
            onRequestClose={() => {}}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.finishedHeader}>
                  <Text style={styles.finishedTrophy}>🎉</Text>
                  <Text style={styles.finishedTitle}>המשחק הסתיים! 🎉</Text>
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
                    variant="draw"
                    style={styles.resetButton}
                    disabled={!isHost}
                  />
                  {!isHost && (
                    <Text style={styles.hostOnlyText}>רק המארח יכול להתחיל משחק חדש</Text>
                  )}
                  <GradientButton
                    title="חזרה לתפריט הראשי"
                    onPress={goBack}
                    variant="draw"
                    style={styles.exitButton}
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
    padding: 4,
    paddingBottom: 120, // Extra padding to allow scrolling to see input field when keyboard is open
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 2,
    position: 'relative',
  },
  headerCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1,
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
  roomCodeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  roomCodeLabel: {
    color: '#6B7280',
    fontSize: 12,
  },
  roomCodeText: {
    color: '#C48CFF', // Draw theme color
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
    backgroundColor: '#C48CFF', // Draw theme color
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
    backgroundColor: '#F3E8FF',
    borderWidth: 1,
    borderColor: '#C48CFF', // Draw theme color
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
  drinkingBadge: {
    backgroundColor: '#F97316',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    alignSelf: 'center',
  },
  drinkingBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
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
    borderColor: '#C48CFF', // Draw theme color
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  playerCardName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
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
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 8,
    width: '100%',
  },
  topBarCentered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    width: '100%',
    marginBottom: 4,
  },
  wordCardCentered: {
    backgroundColor: 'rgba(196, 140, 255, 0.25)',
    borderWidth: 2,
    borderColor: '#C48CFF',
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
    minWidth: 160,
    maxWidth: '90%',
  },
  wordTextCentered: {
    fontSize: 20,
    fontWeight: '900',
    color: '#C48CFF',
  },
  drawerInfoCentered: {
    alignItems: 'center',
    padding: 8,
  },
  drawerTextCentered: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  timerBarCentered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    width: '100%',
    marginBottom: 6,
    maxWidth: 250,
    alignSelf: 'center',
  },
  timerWrapper: {
    flex: 1,
    maxWidth: 120,
  },
  wordCardCompact: {
    backgroundColor: 'rgba(196, 140, 255, 0.25)',
    borderWidth: 2,
    borderColor: '#C48CFF',
    borderRadius: 12,
    padding: 8,
    flex: 1,
    alignItems: 'center',
  },
  wordTextCompact: {
    fontSize: 16,
    fontWeight: '900',
    color: '#C48CFF',
  },
  drawerInfoCompact: {
    flex: 1,
    alignItems: 'center',
    padding: 8,
  },
  drawerTextCompact: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  statusCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusContent: {
    gap: 8,
    alignItems: 'center',
  },
  timerContainer: {
    marginBottom: 4,
  },
  turnBadge: {
    backgroundColor: '#C48CFF', // Draw theme color
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  turnBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  wordCard: {
    backgroundColor: 'rgba(196, 140, 255, 0.25)', // Draw theme color with less transparency
    borderWidth: 2,
    borderColor: '#C48CFF', // Draw theme color
    borderRadius: 12,
    padding: 10,
    width: '100%',
    alignItems: 'center',
  },
  wordLabel: {
    fontSize: 10,
    color: '#C48CFF', // Draw theme color
    marginBottom: 4,
  },
  wordText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#C48CFF', // Draw theme color
  },
  drawerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  drawerIcon: {
    fontSize: 20,
  },
  drawerText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
  },
  guessHint: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  guessInputContainer: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  guessInput: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 12,
    fontSize: 16,
    textAlign: 'right',
    borderWidth: 2,
    borderColor: '#C48CFF', // Draw theme color
  },
  sendButton: {
    backgroundColor: '#C48CFF', // Draw theme color
    borderRadius: 16,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 50,
  },
  sendButtonDisabled: {
    backgroundColor: '#D1D5DB',
    opacity: 0.5,
  },
  sendButtonText: {
    fontSize: 20,
  },
  toolsSection: {
    gap: 8,
  },
  toolButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  toolButton: {
    flex: 1,
  },
  canvasSidebarRow: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'flex-start',
    flex: 1,
    paddingHorizontal: 2,
  },
  canvasWrapper: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    minHeight: 0,
    // Prevent scrolling when touching canvas
    zIndex: 10,
  },
  canvasContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    width: '100%',
    maxWidth: '100%',
    flex: 1,
    minHeight: 200,
    aspectRatio: 1,
    maxHeight: '100%',
  },
  bottomToolsContainer: {
    width: '100%',
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 8,
  },
  toolsTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 4,
  },
  brushSizesRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    maxWidth: 150,
  },
  brushSizeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  brushSizeButtonActive: {
    borderColor: '#C48CFF',
    backgroundColor: '#F3E8FF',
  },
  brushSizeIndicator: {
    backgroundColor: '#6B7280',
  },
  brushSizeIndicatorActive: {
    backgroundColor: '#C48CFF',
  },
  brushSizeIndicatorEraser: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#9CA3AF',
  },
  toolToggleContainer: {
    flexDirection: 'row',
    gap: 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 3,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    flexShrink: 0,
  },
  toolToggleButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: 'transparent',
  },
  toolToggleButtonActive: {
    backgroundColor: '#C48CFF',
  },
  toolToggleText: {
    fontSize: 16,
  },
  toolToggleTextActive: {
    opacity: 1,
  },
  colorsRow: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    width: '100%',
    paddingHorizontal: 8,
  },
  colorButtonCompact: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorButtonWhite: {
    borderWidth: 2,
    borderColor: '#D1D5DB',
  },
  colorButtonSelected: {
    borderWidth: 3,
    borderColor: '#C48CFF',
    transform: [{ scale: 1.1 }],
  },
  colorCheckmark: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#C48CFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorCheckmarkInner: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#FFFFFF',
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    gap: 4,
    flexShrink: 0,
  },
  actionButton: {
    minWidth: 50,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  guessInputRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 8,
    width: '100%',
    alignItems: 'center',
  },
  guessInputCompact: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 10,
    fontSize: 16, // Minimum 16px to prevent zoom on mobile
    textAlign: 'right',
    borderWidth: 2,
    borderColor: '#C48CFF',
  },
  sendButtonCompact: {
    backgroundColor: '#C48CFF',
    borderRadius: 12,
    padding: 10,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 50,
  },
  sidebar: {
    width: 80,
    maxWidth: 80,
    gap: 4,
    flexShrink: 0,
  },
  guessesCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  guessesHeader: {
    backgroundColor: '#3B82F6',
    padding: 6,
    alignItems: 'center',
  },
  guessesTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  guessesList: {
    maxHeight: 180,
    padding: 6,
    gap: 4,
  },
  noGuessesText: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingVertical: 16,
  },
  guessItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 4,
  },
  guessItemCorrect: {
    backgroundColor: '#D1FAE5',
    borderColor: '#C48CFF', // Draw theme color
  },
  guessItemContent: {
    flex: 1,
    flexDirection: 'column',
    gap: 2,
    alignItems: 'flex-start',
  },
  guessPlayerName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1F2937',
  },
  guessText: {
    fontSize: 11,
    color: '#374151',
  },
  guessTextCorrect: {
    color: '#059669',
    fontWeight: '700',
  },
  checkmark: {
    fontSize: 16,
    color: '#C48CFF', // Draw theme color
  },
  scoreboardCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    maxHeight: 200,
  },
  scoreboardHeader: {
    backgroundColor: '#C48CFF', // Draw theme color
    padding: 6,
    alignItems: 'center',
  },
  scoreboardTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  scoreboardList: {
    padding: 4,
    maxHeight: 160,
  },
  scoreboardPlayerCard: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    padding: 4,
    marginBottom: 3,
  },
  scoreboardPlayerCardActive: {
    backgroundColor: '#F3E8FF',
    borderColor: '#C48CFF', // Draw theme color
  },
  scoreboardPlayerContent: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 3,
    width: '100%', // Ensure content takes full width of card
  },
  scoreboardRankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    width: '100%',
  },
  scoreboardRank: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  trophyIcon: {
    fontSize: 12,
  },
  scoreboardPlayerName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1F2937',
    width: '100%', // Take full width instead of flex: 1
  },
  drawingBadge: {
    backgroundColor: '#C48CFF', // Draw theme color
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 2,
    alignSelf: 'flex-start', // Don't stretch to full width
  },
  drawingBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  scoreboardScore: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937', // Dark color for better visibility
    marginTop: 8,
    paddingTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    width: '100%',
    maxWidth: 500,
    maxHeight: '85%',
    gap: 10,
  },
  modalContentSummary: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
    overflow: 'hidden',
    flexDirection: 'column',
    flex: 1,
  },
  summaryScrollContent: {
    flex: 1,
    minHeight: 200,
  },
  summaryScrollContainer: {
    padding: 16,
    gap: 12,
    paddingBottom: 8,
    flexGrow: 1,
  },
  summaryButtonContainer: {
    padding: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  waitingForHostText: {
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'center',
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
  summaryHeader: {
    backgroundColor: '#C48CFF', // Draw theme color
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  winnerCard: {
    backgroundColor: '#D1FAE5',
    borderWidth: 2,
    borderColor: '#C48CFF', // Draw theme color
    borderRadius: 10,
    padding: 12,
    gap: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  trophyIconLarge: {
    fontSize: 32,
  },
  winnerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#059669',
    textAlign: 'center',
  },
  winnersList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  winnerBadge: {
    backgroundColor: '#C48CFF', // Draw theme color
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  winnerBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  eyeIconLarge: {
    fontSize: 24,
  },
  noWinnerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7C3AED',
    textAlign: 'center',
  },
  wordReveal: {
    fontSize: 12,
    color: '#059669',
    textAlign: 'center',
  },
  wordRevealBold: {
    fontWeight: '700',
  },
  drawingSection: {
    gap: 8,
    marginBottom: 8,
  },
  drawingSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
  },
  drawingDisplay: {
    borderWidth: 2,
    borderColor: '#C48CFF', // Draw theme color
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    aspectRatio: 1,
    maxWidth: '100%',
    minHeight: 200,
    maxHeight: 350,
    padding: 8,
  },
  guessesSection: {
    gap: 8,
    marginBottom: 8,
  },
  guessesSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  summaryGuessesList: {
    gap: 4,
  },
  moreGuessesText: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  noGuessesTextSummary: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingVertical: 16,
  },
  summaryGuessItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 10,
    marginBottom: 4,
  },
  summaryGuessItemCorrect: {
    backgroundColor: '#D1FAE5',
    borderColor: '#C48CFF', // Draw theme color
  },
  summaryGuessContent: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  summaryGuessPlayerName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },
  summaryGuessLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  summaryGuessText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '600',
  },
  summaryGuessTextCorrect: {
    color: '#059669',
    fontWeight: '700',
  },
  summaryCheckmark: {
    fontSize: 20,
    color: '#C48CFF', // Draw theme color
  },
  scoresSection: {
    gap: 8,
    marginBottom: 8,
  },
  scoresSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  scoresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  scoreItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scoreItemEarned: {
    backgroundColor: '#D1FAE5',
    borderColor: '#C48CFF', // Draw theme color
  },
  scoreItemName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1F2937',
  },
  scoreItemBadge: {
    backgroundColor: '#C48CFF', // Draw theme color
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  scoreItemBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  continueButton: {
    marginTop: 4,
  },
  finishedHeader: {
    alignItems: 'center',
    gap: 16,
  },
  finishedTrophy: {
    fontSize: 96,
  },
  finishedTitle: {
    fontSize: 32,
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
    backgroundColor: '#C48CFF', // Draw theme color
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
    backgroundColor: '#C48CFF', // Draw theme color
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
  exitButton: {
    width: '100%',
    minHeight: 48,
  },
  hostOnlyText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
  },
  bottomSection: {
    width: '100%',
    paddingHorizontal: 4,
    paddingTop: 8,
    gap: 8,
    maxHeight: 200,
  },
  guessesCardBottom: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    maxHeight: 100,
  },
  guessesListBottom: {
    maxHeight: 80,
    padding: 6,
  },
  guessesHorizontalContainer: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 4,
  },
  guessItemBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 120,
    maxWidth: 200,
  },
  scoreboardCardBottom: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    maxHeight: 100,
  },
  scoreboardListBottom: {
    maxHeight: 80,
    padding: 6,
  },
  scoreboardHorizontalContainer: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 4,
  },
  scoreboardPlayerCardBottom: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    paddingBottom: 10,
    minWidth: 100,
    maxWidth: 140,
    overflow: 'visible', // Allow content to be fully visible
  },
});
