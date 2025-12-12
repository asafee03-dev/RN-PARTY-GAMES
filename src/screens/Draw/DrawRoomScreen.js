import { collection, doc, getDoc, getDocs, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';
import DrawCanvas from '../../components/draw/DrawCanvas';
import Timer from '../../components/game/Timer';
import RulesModal from '../../components/shared/RulesModal';
import UnifiedTopBar from '../../components/shared/UnifiedTopBar';
import { db, waitForFirestoreReady } from '../../firebase';
import { clearCurrentRoom, loadCurrentRoom, saveCurrentRoom } from '../../utils/navigationState';
import storage from '../../utils/storage';

const WINNING_SCORE = 12;

const getAllGuesses = (roomData) => {
  if (!roomData) return [];
  const guesses = roomData.all_guesses;
  if (Array.isArray(guesses)) {
    return guesses;
  }
  return [];
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

  const timerCheckInterval = useRef(null);
  const unsubscribeRef = useRef(null);
  const roomRef = useRef(room);
  const currentPlayerNameRef = useRef(currentPlayerName);
  const autoDeletionCleanupRef = useRef({ cancelGameEnd: () => {}, cancelEmptyRoom: () => {}, cancelAge: () => {} });

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

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
        const savedMode = await storage.getItem('drinkingMode');
        if (savedMode) {
          setDrinkingMode(savedMode === 'true');
        }
      } catch (e) {
        console.warn('Could not load player name:', e);
      }
    };
    loadPlayerName();
  }, []);

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
      // Remove player from room on unmount
      const currentRoom = roomRef.current;
      const playerName = currentPlayerNameRef.current;
      if (currentRoom && currentRoom.id && playerName) {
        try {
          const updatedPlayers = currentRoom.players.filter(p => p && p.name !== playerName);
          const roomDocRef = doc(db, 'DrawRoom', currentRoom.id);
          updateDoc(roomDocRef, {
            players: updatedPlayers
          }).catch(error => {
            console.error('Error removing player from room on unmount:', error);
          });
        } catch (error) {
          console.error('Error removing player from room on unmount:', error);
        }
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

  // Cleanup on navigation away
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', async () => {
      // Remove player from room before leaving
      const currentRoom = roomRef.current;
      const playerName = currentPlayerNameRef.current;
      if (currentRoom && currentRoom.id && playerName) {
        try {
          const updatedPlayers = currentRoom.players.filter(p => p && p.name !== playerName);
          const roomDocRef = doc(db, 'DrawRoom', currentRoom.id);
          await updateDoc(roomDocRef, {
            players: updatedPlayers
          });
        } catch (error) {
          console.error('Error removing player from room on navigation:', error);
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
        
        // Check if current player is still in the room
        const playerName = currentPlayerNameRef.current || '';
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
        
        // Update local strokes from snapshot (source of truth)
        if (newRoom.drawing_data) {
          try {
            const strokes = typeof newRoom.drawing_data === 'string'
              ? JSON.parse(newRoom.drawing_data)
              : newRoom.drawing_data;
            setLocalStrokes(Array.isArray(strokes) ? strokes : []);
          } catch (error) {
            console.error('Error parsing strokes from listener:', error);
          }
        } else if (newRoom.game_status === 'playing' && !newRoom.drawing_data) {
          // Clear strokes when new round starts
          setLocalStrokes([]);
        }
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

  useEffect(() => {
    // Update local strokes when room data changes - source of truth is room.drawing_data
    if (room?.drawing_data) {
      try {
        const strokes = typeof room.drawing_data === 'string' 
          ? JSON.parse(room.drawing_data) 
          : room.drawing_data;
        setLocalStrokes(Array.isArray(strokes) ? strokes : []);
      } catch (error) {
        console.error('Error parsing strokes:', error);
        setLocalStrokes([]);
      }
    } else if (room?.game_status === 'playing' && !room?.drawing_data) {
      setLocalStrokes([]);
    }
    
    // Reset force close modal flag when game status changes back to lobby
    if (room?.game_status === 'lobby' && forceCloseModal) {
      setForceCloseModal(false);
    }
  }, [room?.drawing_data, room?.game_status, forceCloseModal]);

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

      const elapsed = Math.floor((Date.now() - currentRoom.turn_start_time) / 1000);
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

  const handleTimerExpiration = async () => {
    const currentRoom = roomRef.current;
    if (!currentRoom || !currentRoom.id || currentRoom.show_round_summary) return;

    const currentDrawer = currentRoom.players[currentRoom.current_turn_index]?.name;
    const normalizedWord = currentRoom.current_word?.toLowerCase().trim();
    const drinkingModeActive = await storage.getItem('drinkingMode') === 'true';
    let firstWinner = null;
    const drinkingPlayersList = [];

    // Calculate points based on time - 3 points for first 20s, 2 for 21-40s, 1 for 41-60s
    const calculatePointsByTime = (timestamp, turnStartTime) => {
      if (!timestamp || !turnStartTime) return 1;
      const elapsed = Math.floor((timestamp - turnStartTime) / 1000);
      if (elapsed <= 20) return 3;
      if (elapsed <= 40) return 2;
      return 1;
    };

    const allGuesses = getAllGuesses(currentRoom);
    
    const correctGuessers = new Map(); // Map of playerName -> points earned
    allGuesses.forEach(g => {
      if (g.isCorrect && g.timestamp) {
        const points = calculatePointsByTime(g.timestamp, currentRoom.turn_start_time);
        // If player already guessed correctly, take the highest points
        if (!correctGuessers.has(g.playerName) || correctGuessers.get(g.playerName) < points) {
          correctGuessers.set(g.playerName, points);
        }
        if (!firstWinner) {
          firstWinner = g.playerName;
        }
      }
    });

    const hasCorrectGuess = correctGuessers.size > 0;

    const finalPlayersWithScores = currentRoom.players.map(player => {
      if (player.name === currentDrawer) {
        return {
          ...player,
          score: player.score + (hasCorrectGuess ? 1 : 0)
        };
      }

      if (correctGuessers.has(player.name)) {
        const pointsEarned = correctGuessers.get(player.name);
        return { ...player, score: player.score + pointsEarned };
      }

      if (drinkingModeActive && !correctGuessers.has(player.name)) {
        drinkingPlayersList.push(player.name);
      }

      return player;
    });

    try {
      const roomDocRef = doc(db, 'DrawRoom', currentRoom.id);
      await updateDoc(roomDocRef, {
        players: finalPlayersWithScores,
        show_round_summary: true,
        round_winner: firstWinner,
        drinking_players: drinkingModeActive && drinkingPlayersList.length > 0 ? drinkingPlayersList : null,
        final_draw_image: null // Skip image upload for now
      });
    } catch (error) {
      console.error('❌ Error handling timer expiration:', error);
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

      // Add player if not already in room (only in lobby state)
      const playerExists = roomData.players && Array.isArray(roomData.players) && roomData.players.some(p => p && p.name === playerName);
      if (!playerExists && roomData.game_status === 'lobby' && playerName) {
        const updatedPlayers = [...(roomData.players || []), { name: playerName, score: 0 }];
        console.log('🔵 Adding player to Draw room:', playerName);
        try {
          const roomDocRef = doc(db, 'DrawRoom', roomData.id);
          await updateDoc(roomDocRef, { players: updatedPlayers });
          const updatedSnapshot = await getDoc(roomDocRef);
          if (updatedSnapshot.exists()) {
            const updatedRoom = { id: updatedSnapshot.id, ...updatedSnapshot.data() };
            setRoom(updatedRoom);
            setIsLoading(false);
            // Setup realtime listener with room ID
            if (updatedRoom.id) {
              setupRealtimeListener(updatedRoom.id);
            }
            return;
          }
        } catch (updateErr) {
          console.error('❌ Error adding player:', updateErr);
        }
      }
      
      // If game is already playing and player is not in room, show error
      if (!playerExists && roomData.game_status === 'playing' && playerName) {
        console.warn('⚠️ Player tried to join game that is already in progress');
        Alert.alert('שגיאה', 'המשחק כבר התחיל. לא ניתן להצטרף כעת.');
        navigation.goBack();
        return;
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
    if (!room || room.host_name !== currentPlayerName) return;
    if (room.players.length < 2) {
      Alert.alert('שגיאה', 'צריך לפחות 2 שחקנים כדי להתחיל!');
      return;
    }

    try {
      const wordsSnapshot = await getDocs(collection(db, 'DrawWord'));
      const allWords = [];
      wordsSnapshot.forEach((doc) => {
        allWords.push({ id: doc.id, ...doc.data() });
      });
      
      if (!allWords || allWords.length === 0) {
        Alert.alert('שגיאה', 'אין מילים זמינות במערכת!');
        return;
      }

      const randomWord = allWords[Math.floor(Math.random() * allWords.length)];

      const resetPlayers = room.players.map(p => ({
        ...p,
        current_guess: '',
        has_submitted: false
      }));

      if (!room || !room.id) {
        console.error('❌ Cannot start game: room or room.id is missing');
        Alert.alert('שגיאה', 'חדר לא נטען כראוי. נסה לרענן את הדף.');
        return;
      }

      console.log('🔵 Starting Draw game, updating room:', room.id);
      try {
        const roomRef = doc(db, 'DrawRoom', room.id);
        const turnStartTime = Date.now();
        const updates = {
          game_status: 'playing',
          current_turn_index: 0,
          current_word: randomWord.word,
          drawing_data: null,
          players: resetPlayers,
          final_draw_image: null,
          all_guesses: [],
          turn_start_time: turnStartTime
        };
        await updateDoc(roomRef, updates);
        const updatedRoom = { ...room, ...updates };
        setRoom(updatedRoom);
        roomRef.current = updatedRoom; // Update ref immediately so isMyTurn() works correctly for first turn
        console.log('✅ Game started successfully');
        console.log(`🔵 [DRAW] First turn - Player at index 0: ${updatedRoom.players[0]?.name}, Current player: ${currentPlayerName}`);
      } catch (error) {
        console.error('❌ Error starting game:', error);
        Alert.alert('שגיאה', 'שגיאה בהתחלת המשחק. נסה שוב.');
        return;
      }
    } catch (error) {
      console.error('Error starting game:', error);
      Alert.alert('שגיאה', 'שגיאה בהתחלת המשחק. נסה שוב.');
    }
  };

  const handleStrokeComplete = async (stroke) => {
    // Double-check it's my turn using current room state
    const currentRoom = roomRef.current || room;
    if (!currentRoom || !currentRoom.id || !currentRoom.players) {
      console.warn('⚠️ [DRAW] Stroke rejected - no room data');
      return;
    }
    
    if (currentRoom.current_turn_index === undefined || currentRoom.current_turn_index === null) {
      console.warn('⚠️ [DRAW] Stroke rejected - no current_turn_index');
      return;
    }
    
    const playerName = currentPlayerNameRef.current || currentPlayerName;
    if (!playerName) {
      console.warn('⚠️ [DRAW] Stroke rejected - no player name');
      return;
    }
    
    const currentDrawer = currentRoom.players[currentRoom.current_turn_index];
    if (!currentDrawer || !currentDrawer.name) {
      console.warn('⚠️ [DRAW] Stroke rejected - no current drawer');
      return;
    }
    
    const isMyTurnNow = currentDrawer.name === playerName;
    
    if (!isMyTurnNow) {
      console.warn(`⚠️ [DRAW] Stroke rejected - not my turn. Player: ${playerName}, Drawer: ${currentDrawer.name}, Turn index: ${currentRoom.current_turn_index}`);
      return;
    }
    
    console.log(`✅ [DRAW] Stroke accepted - Player: ${playerName}, Turn index: ${currentRoom.current_turn_index}`);

    try {
      // Get current strokes from latest snapshot and append
      let currentStrokes = roomRef.current.drawing_data 
        ? (typeof roomRef.current.drawing_data === 'string' ? JSON.parse(roomRef.current.drawing_data) : roomRef.current.drawing_data)
        : [];
      
      if (!Array.isArray(currentStrokes)) {
        console.warn('Current strokes is not an array, resetting');
        currentStrokes = [];
      }

      const updatedStrokes = [...currentStrokes, stroke];
      
      // Update local state immediately for responsive UI
      setLocalStrokes(updatedStrokes);

      // Save to Firestore (append full strokes array)
      const roomDocRef = doc(db, 'DrawRoom', roomRef.current.id);
      await updateDoc(roomDocRef, {
        drawing_data: JSON.stringify(updatedStrokes)
      });
      
      console.log('✅ Stroke saved successfully, total strokes:', updatedStrokes.length);
    } catch (error) {
      console.error('❌ Error saving stroke:', error);
      // Revert local state on error
      const currentStrokes = roomRef.current?.drawing_data 
        ? (typeof roomRef.current.drawing_data === 'string' ? JSON.parse(roomRef.current.drawing_data) : roomRef.current.drawing_data)
        : [];
      setLocalStrokes(Array.isArray(currentStrokes) ? currentStrokes : []);
    }
  };

  const handleUndo = async () => {
    if (!isMyTurn() || localStrokes.length === 0) return;

    const updatedStrokes = localStrokes.slice(0, -1);
    setLocalStrokes(updatedStrokes);

    try {
      const roomRef = doc(db, 'DrawRoom', room.id);
      await updateDoc(roomRef, {
        drawing_data: updatedStrokes.length > 0 ? JSON.stringify(updatedStrokes) : null
      });
    } catch (error) {
      console.error('Error undoing stroke:', error);
    }
  };

  const handleClearAll = async () => {
    if (!isMyTurn()) return;

    setLocalStrokes([]);

    try {
      const roomRef = doc(db, 'DrawRoom', room.id);
      await updateDoc(roomRef, {
        drawing_data: null
      });
    } catch (error) {
      console.error('Error clearing canvas:', error);
    }
  };

  const handleGuessSubmit = async () => {
    if (!guessInput.trim() || isMyTurn() || !room || !room.id || room.show_round_summary) {
      return;
    }

    const guess = guessInput.trim();
    const currentDrawer = getCurrentPlayerName();
    const normalizedWord = room.current_word?.toLowerCase().trim();
    const normalizedGuess = guess.toLowerCase().trim();
    const isCorrect = normalizedWord && normalizedGuess === normalizedWord;

    console.log('🔵 Submitting guess, updating room:', room.id);
    
    const currentGuesses = getAllGuesses(room);
    const newGuess = {
      playerName: currentPlayerName,
      guess: guess,
      timestamp: Date.now(),
      isCorrect: isCorrect
    };
    const updatedGuesses = [...currentGuesses, newGuess];

    const elapsed = room.turn_start_time ? Math.floor((Date.now() - room.turn_start_time) / 1000) : 0;
    const timerExpired = elapsed >= 60;
    const shouldEndRound = timerExpired || isCorrect;

    const updatePayload = {
      all_guesses: updatedGuesses
    };

    if (shouldEndRound) {
      const drinkingModeActive = await storage.getItem('drinkingMode') === 'true';
      let firstWinner = null;
      const drinkingPlayersList = [];
      let hasCorrectGuess = false;

      // Calculate points based on time - 3 points for first 20s, 2 for 21-40s, 1 for 41-60s
      const calculatePointsByTime = (timestamp, turnStartTime) => {
        if (!timestamp || !turnStartTime) return 1;
        const elapsed = Math.floor((timestamp - turnStartTime) / 1000);
        if (elapsed <= 20) return 3;
        if (elapsed <= 40) return 2;
        return 1;
      };

      const correctGuessers = new Map(); // Map of playerName -> points earned
      updatedGuesses.forEach(g => {
        if (g.isCorrect && g.timestamp) {
          const points = calculatePointsByTime(g.timestamp, room.turn_start_time);
          // If player already guessed correctly, take the highest points
          if (!correctGuessers.has(g.playerName) || correctGuessers.get(g.playerName) < points) {
            correctGuessers.set(g.playerName, points);
          }
          if (!firstWinner) {
            firstWinner = g.playerName;
          }
          hasCorrectGuess = true;
        }
      });

      const playersWithScores = room.players.map(player => {
        if (player.name === currentDrawer) {
          return {
            ...player,
            score: player.score + (hasCorrectGuess ? 1 : 0)
          };
        }

        if (correctGuessers.has(player.name)) {
          const pointsEarned = correctGuessers.get(player.name);
          return { ...player, score: player.score + pointsEarned };
        }

        if (drinkingModeActive && !correctGuessers.has(player.name)) {
          drinkingPlayersList.push(player.name);
        }

        return player;
      });

      updatePayload.players = playersWithScores;
      updatePayload.show_round_summary = true;
      updatePayload.round_winner = firstWinner;
      updatePayload.drinking_players = drinkingModeActive && drinkingPlayersList.length > 0 ? drinkingPlayersList : null;
      updatePayload.final_draw_image = null; // Skip image upload for now
    }

    try {
      const roomRef = doc(db, 'DrawRoom', room.id);
      await updateDoc(roomRef, updatePayload);
      console.log('✅ Guess submitted successfully');
      setRoom(prev => ({ ...prev, ...updatePayload }));
      setGuessInput('');
    } catch (error) {
      console.error('❌ Error submitting guess:', error);
      Alert.alert('שגיאה', 'שגיאה בשליחת הניחוש. נסה שוב.');
      return;
    }
  };

  const continueToNextRound = async () => {
    if (!room) return;

    const winner = room.players.find(p => p.score >= WINNING_SCORE);
    
    if (winner) {
      // Game finished
      try {
        const roomRef = doc(db, 'DrawRoom', room.id);
        await updateDoc(roomRef, {
          game_status: 'finished',
          winner_name: winner.name,
          final_draw_image: null
        });
      } catch (error) {
        console.error('Error finishing game:', error);
      }
    } else {
      // Get next word and move to next player
      try {
        const wordsSnapshot = await getDocs(collection(db, 'DrawWord'));
        const allWords = [];
        wordsSnapshot.forEach((doc) => {
          allWords.push({ id: doc.id, ...doc.data() });
        });
        
        if (!allWords || allWords.length === 0) {
          console.error('Error loading words: no words found');
          return;
        }
        
        const randomWord = allWords[Math.floor(Math.random() * allWords.length)];
        
        let nextTurnIndex = (room.current_turn_index + 1) % room.players.length;
        let attempts = 0;
        while (attempts < room.players.length && (!room.players[nextTurnIndex] || !room.players[nextTurnIndex].name)) {
          nextTurnIndex = (nextTurnIndex + 1) % room.players.length;
          attempts++;
        }
        if (attempts >= room.players.length) {
          nextTurnIndex = room.current_turn_index;
        }

        const resetPlayers = room.players.map(p => ({
          ...p,
          current_guess: '',
          has_submitted: false
        }));

        const roomRef = doc(db, 'DrawRoom', room.id);
        const turnStartTime = Date.now();
        await updateDoc(roomRef, {
          current_turn_index: nextTurnIndex,
          current_word: randomWord.word,
          drawing_data: null,
          show_round_summary: false,
          round_winner: null,
          drinking_players: null,
          players: resetPlayers,
          all_guesses: [],
          final_draw_image: null,
          turn_start_time: turnStartTime
        });

        setLocalStrokes([]);
      } catch (error) {
        console.error('Error moving to next turn:', error);
      }
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
        turn_start_time: null
      });
      setLocalStrokes([]);
      
      // Reset force close flag after a short delay to allow state to update
      setTimeout(() => {
        setForceCloseModal(false);
      }, 100);
    } catch (error) {
      console.error('Error resetting game:', error);
      Alert.alert('שגיאה', 'לא הצלחנו לאפס את המשחק. נסה שוב.');
      setForceCloseModal(false);
    }
  };

  const goBack = async () => {
    // Remove player from room before leaving
    if (room && room.id && currentPlayerName) {
      try {
        const updatedPlayers = room.players.filter(p => p && p.name !== currentPlayerName);
        const roomRef = doc(db, 'DrawRoom', room.id);
        await updateDoc(roomRef, {
          players: updatedPlayers
        });
      } catch (error) {
        console.error('Error removing player from room:', error);
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
  };

  const isMyTurn = () => {
    // Use roomRef for most up-to-date state
    const currentRoom = roomRef.current || room;
    if (!currentRoom || !currentRoom.players) {
      console.log('🔍 [DRAW] isMyTurn - no room or players');
      return false;
    }
    
    if (currentRoom.current_turn_index === undefined || currentRoom.current_turn_index === null) {
      console.log('🔍 [DRAW] isMyTurn - no current_turn_index');
      return false;
    }
    
    if (currentRoom.game_status !== 'playing') {
      console.log('🔍 [DRAW] isMyTurn - game not playing, status:', currentRoom.game_status);
      return false;
    }
    
    const playerName = currentPlayerNameRef.current || currentPlayerName;
    if (!playerName) {
      console.log('🔍 [DRAW] isMyTurn - no player name');
      return false;
    }
    
    const currentDrawer = currentRoom.players[currentRoom.current_turn_index];
    if (!currentDrawer || !currentDrawer.name) {
      console.log(`🔍 [DRAW] isMyTurn - no current drawer at index ${currentRoom.current_turn_index}`);
      return false;
    }
    
    const result = currentDrawer.name === playerName;
    console.log(`🔍 [DRAW] isMyTurn check - Player: ${playerName}, Drawer: ${currentDrawer.name}, Turn index: ${currentRoom.current_turn_index}, Result: ${result}`);
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
  const correctGuesserNames = new Set(
    allGuesses.filter(g => g.isCorrect).map(g => g.playerName)
  );
  const correctGuessers = Array.from(correctGuesserNames)
    .map(name => room.players.find(p => p.name === name))
    .filter(Boolean);

  return (
    <GradientBackground variant="draw">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
        keyboardShouldPersistTaps="handled"
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
                      onValueChange={(checked) => {
                        setDrinkingMode(checked);
                        storage.setItem('drinkingMode', checked.toString());
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
              {isMyTurn() ? (
                <View style={styles.wordCardCentered}>
                  <Text style={styles.wordTextCentered}>{room.current_word}</Text>
                </View>
              ) : (
                <View style={styles.drawerInfoCentered}>
                  <Text style={styles.drawerTextCentered}>{currentDrawerName} מצייר...</Text>
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
              onStartShouldSetResponder={() => isMyTurn()}
              onMoveShouldSetResponder={() => isMyTurn()}
              onResponderTerminationRequest={() => false}
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
                        {allGuesses.map((guess, idx) => {
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
                      {[...room.players].sort((a, b) => b.score - a.score).map((player, idx) => {
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
                              {isCurrentTurn && (
                                <View style={styles.drawingBadge}>
                                  <Text style={styles.drawingBadgeText}>🎨 מצייר</Text>
                                </View>
                              )}
                              <Text style={styles.scoreboardScore}>{player.score}</Text>
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
                  {room.drinking_players.length === 1 ? 'לא ניחשת נכון!' : 'לא ניחשתם נכון!'}
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
        {room.show_round_summary && !room.drinking_players && !forceCloseModal &&
         room.players && Array.isArray(room.players) && 
         room.players.some(p => p && p.name === currentPlayerName) && (
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
                              <Text style={styles.winnerBadgeText}>{player.name} +1 ⭐</Text>
                            </View>
                          ))}
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
                        allGuesses.map((guess, idx) => {
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
                  <GradientButton
                    title="המשך לסבב הבא"
                    onPress={continueToNextRound}
                    variant="draw"
                    style={styles.continueButton}
                  />
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
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    padding: 4,
    paddingBottom: 8,
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
    fontSize: 14,
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
    gap: 4,
  },
  scoreboardRankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    width: '100%',
  },
  scoreboardRank: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  trophyIcon: {
    fontSize: 11,
  },
  scoreboardPlayerName: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
  },
  drawingBadge: {
    backgroundColor: '#C48CFF', // Draw theme color
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 2,
  },
  drawingBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '600',
  },
  scoreboardScore: {
    fontSize: 14,
    fontWeight: '700',
    color: '#C48CFF', // Draw theme color
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
    maxHeight: '85%',
    overflow: 'hidden',
    flexDirection: 'column',
  },
  summaryScrollContent: {
    flex: 1,
  },
  summaryScrollContainer: {
    padding: 16,
    gap: 10,
    paddingBottom: 8,
  },
  summaryButtonContainer: {
    padding: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
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
    padding: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  summaryTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  winnerCard: {
    backgroundColor: '#D1FAE5',
    borderWidth: 2,
    borderColor: '#C48CFF', // Draw theme color
    borderRadius: 10,
    padding: 8,
    gap: 6,
    alignItems: 'center',
  },
  trophyIconLarge: {
    fontSize: 24,
  },
  winnerTitle: {
    fontSize: 13,
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
    gap: 4,
  },
  drawingSectionTitle: {
    fontSize: 11,
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
    padding: 8,
  },
  guessesSection: {
    gap: 4,
  },
  guessesSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1F2937',
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
    padding: 6,
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
    fontSize: 11,
    fontWeight: '700',
    color: '#1F2937',
  },
  summaryGuessLabel: {
    fontSize: 10,
    color: '#6B7280',
  },
  summaryGuessText: {
    fontSize: 10,
    color: '#374151',
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
    gap: 4,
  },
  scoresSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1F2937',
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
    padding: 6,
    minWidth: 80,
    maxWidth: 120,
  },
});
