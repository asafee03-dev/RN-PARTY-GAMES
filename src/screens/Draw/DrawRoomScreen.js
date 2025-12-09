import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator, Modal, Switch, TouchableOpacity, TextInput, Image } from 'react-native';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';
import DrawCanvas from '../../components/draw/DrawCanvas';
import ColorPicker from '../../components/draw/ColorPicker';
import DrawingTools from '../../components/draw/DrawingTools';
import Timer from '../../components/game/Timer';
import { db, waitForFirestoreReady } from '../../firebase';
import { doc, getDoc, updateDoc, onSnapshot, query, collection, where, getDocs } from 'firebase/firestore';
import storage from '../../utils/storage';
import { copyRoomCode, copyRoomLink } from '../../utils/clipboard';
import { saveCurrentRoom, loadCurrentRoom, clearCurrentRoom } from '../../utils/navigationState';

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
  const [room, setRoom] = useState(null);
  const [currentPlayerName, setCurrentPlayerName] = useState('');
  const [copied, setCopied] = useState(false);
  const [selectedColor, setSelectedColor] = useState('#000000');
  const [toolType, setToolType] = useState('pencil');
  const [brushSize, setBrushSize] = useState(3);
  const [localStrokes, setLocalStrokes] = useState([]);
  const [guessInput, setGuessInput] = useState('');
  const [drinkingMode, setDrinkingMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(60);

  const timerCheckInterval = useRef(null);
  const unsubscribeRef = useRef(null);
  const roomRef = useRef(room);
  const currentPlayerNameRef = useRef(currentPlayerName);

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
    setupRealtimeListener();

    return () => {
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
    const unsubscribe = navigation.addListener('beforeRemove', () => {
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

  const setupRealtimeListener = () => {
    // Prevent duplicate listeners
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    const roomRef = doc(db, 'DrawRoom', roomCode);
    
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
        
        // Always update room so strokes propagate to all players
        setRoom(newRoom);
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
        }
      } else {
        // Room deleted - cleanup everything
        if (timerCheckInterval.current) {
          clearInterval(timerCheckInterval.current);
          timerCheckInterval.current = null;
        }
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
          unsubscribeRef.current = null;
        }
        Alert.alert('שגיאה', 'החדר נמחק');
        navigation.goBack();
      }
    }, (error) => {
      console.error('Error in realtime listener:', error);
      // Cleanup on error
      if (timerCheckInterval.current) {
        clearInterval(timerCheckInterval.current);
        timerCheckInterval.current = null;
      }
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
  }, [room?.drawing_data, room?.game_status]);

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
      
      const roomRef = doc(db, 'DrawRoom', roomCode);
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

      // Add player if not already in room
      const playerExists = roomData.players && Array.isArray(roomData.players) && roomData.players.some(p => p && p.name === playerName);
      if (!playerExists && roomData.game_status === 'lobby' && playerName) {
        const updatedPlayers = [...(roomData.players || []), { name: playerName, score: 0 }];
        console.log('🔵 Adding player to Draw room:', playerName);
        try {
          await updateDoc(roomRef, { players: updatedPlayers });
          const updatedSnapshot = await getDoc(roomRef);
          if (updatedSnapshot.exists()) {
            const updatedRoom = { id: updatedSnapshot.id, ...updatedSnapshot.data() };
            setRoom(updatedRoom);
            return;
          }
        } catch (updateErr) {
          console.error('❌ Error adding player:', updateErr);
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
        setRoom(prev => ({ ...prev, ...updates }));
        console.log('✅ Game started successfully');
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
    if (!isMyTurn() || !roomRef.current || !roomRef.current.id) return;

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

  const handleCopyRoomCode = async () => {
    await copyRoomCode(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyRoomLink = async () => {
    await copyRoomLink(roomCode, 'draw');
  };

  const resetGame = async () => {
    if (!room || !room.id) return;

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
        final_draw_image: null
      });
      setLocalStrokes([]);
    } catch (error) {
      console.error('Error resetting game:', error);
    }
  };

  const goBack = async () => {
    await clearCurrentRoom();
    navigation.navigate('DrawHome');
  };

  const isMyTurn = () => {
    if (!room || !room.players) return false;
    return room.players[room.current_turn_index]?.name === currentPlayerName;
  };

  const getCurrentPlayerName = () => {
    if (!room || !room.players) return '';
    return room.players[room.current_turn_index]?.name || '';
  };

  if (error) {
    return (
      <GradientBackground variant="purple">
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
            variant="purple"
            style={styles.errorButton}
          />
        </View>
      </GradientBackground>
    );
  }

  if (isLoading || !room) {
    return (
      <GradientBackground variant="purple">
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
    <GradientBackground variant="purple">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>← יציאה</Text>
          </TouchableOpacity>

          <View style={styles.headerRight}>
            <Pressable onPress={handleCopyRoomCode} style={styles.roomCodeContainer}>
              <Text style={styles.roomCodeLabel}>קוד:</Text>
              <Text style={styles.roomCodeText}>{roomCode}</Text>
              <Text style={styles.copyIcon}>{copied ? '✓' : '📋'}</Text>
            </Pressable>
            <GradientButton
              title="📋 העתק קישור"
              onPress={handleCopyRoomLink}
              variant="ghost"
              style={styles.copyLinkButton}
            />
          </View>
        </View>

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
                  variant="purple"
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
            <View style={styles.gameMain}>
              {/* Status Card */}
              <View style={styles.statusCard}>
                <View style={styles.statusContent}>
                  {/* Timer Display */}
                  {room.game_status === 'playing' && room.turn_start_time && !room.show_round_summary && (
                    <View style={styles.timerContainer}>
                      <Timer
                        duration={60}
                        startTime={room.turn_start_time}
                        onTimeUp={handleTimerExpiration}
                        compact={true}
                      />
                    </View>
                  )}
                  
                  {isMyTurn() ? (
                    <>
                      <View style={styles.turnBadge}>
                        <Text style={styles.turnBadgeText}>🎮 התור שלך לצייר!</Text>
                      </View>
                      <View style={styles.wordCard}>
                        <Text style={styles.wordLabel}>המילה לציור:</Text>
                        <Text style={styles.wordText}>{room.current_word}</Text>
                      </View>
                    </>
                  ) : (
                    <>
                      <View style={styles.drawerInfo}>
                        <Text style={styles.drawerIcon}>👁️</Text>
                        <Text style={styles.drawerText}>{currentDrawerName} מצייר...</Text>
                      </View>
                      <Text style={styles.guessHint}>נסה לנחש מה הוא מצייר!</Text>

                      {/* Guess Input */}
                      <View style={styles.guessInputContainer}>
                        <TextInput
                          style={styles.guessInput}
                          value={guessInput}
                          onChangeText={setGuessInput}
                          placeholder="כתוב את הניחוש שלך..."
                          placeholderTextColor="#999"
                          editable={!isMyTurn() && !room.show_round_summary}
                          onSubmitEditing={handleGuessSubmit}
                        />
                        <Pressable
                          onPress={handleGuessSubmit}
                          disabled={!guessInput.trim() || isMyTurn() || room.show_round_summary}
                          style={[
                            styles.sendButton,
                            (!guessInput.trim() || isMyTurn() || room.show_round_summary) && styles.sendButtonDisabled
                          ]}
                        >
                          <Text style={styles.sendButtonText}>📤</Text>
                        </Pressable>
                      </View>
                    </>
                  )}
                </View>
              </View>

              {/* Drawing Tools - Only for drawer */}
              {isMyTurn() && (
                <View style={styles.toolsSection}>
                  <DrawingTools
                    toolType={toolType}
                    onToolChange={setToolType}
                    brushSize={brushSize}
                    onBrushSizeChange={setBrushSize}
                  />
                  
                  {toolType === 'pencil' && (
                    <ColorPicker 
                      selectedColor={selectedColor} 
                      onColorChange={setSelectedColor} 
                    />
                  )}
                  
                  <View style={styles.toolButtons}>
                    <GradientButton
                      title="↶ בטל קו אחרון"
                      onPress={handleUndo}
                      variant="outline"
                      style={styles.toolButton}
                      disabled={localStrokes.length === 0}
                    />
                    <GradientButton
                      title="🧹 נקה הכל"
                      onPress={handleClearAll}
                      variant="red"
                      style={styles.toolButton}
                      disabled={localStrokes.length === 0}
                    />
                  </View>
                </View>
              )}

              {/* Canvas */}
              <View style={styles.canvasContainer}>
                <DrawCanvas
                  strokes={localStrokes}
                  onStrokeComplete={handleStrokeComplete}
                  canDraw={isMyTurn()}
                  color={selectedColor}
                  brushSize={brushSize}
                  toolType={toolType}
                />
              </View>
            </View>

            {/* Sidebar */}
            <View style={styles.sidebar}>
              {/* Shared Guesses Box */}
              {room.game_status === 'playing' && !room.show_round_summary && (
                <View style={styles.guessesCard}>
                  <View style={styles.guessesHeader}>
                    <Text style={styles.guessesTitle}>📤 ניחושים</Text>
                  </View>
                  <ScrollView style={styles.guessesList} nestedScrollEnabled>
                    {allGuesses.length === 0 ? (
                      <Text style={styles.noGuessesText}>עדיין אין ניחושים...</Text>
                    ) : (
                      allGuesses.map((guess, idx) => {
                        const normalizedWord = room.current_word?.toLowerCase().trim();
                        const normalizedGuess = guess.guess?.toLowerCase().trim();
                        const isCorrect = normalizedWord && normalizedGuess === normalizedWord;
                        return (
                          <View
                            key={idx}
                            style={[styles.guessItem, isCorrect && styles.guessItemCorrect]}
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
                      })
                    )}
                  </ScrollView>
                </View>
              )}

              {/* Players Scoreboard */}
              <View style={styles.scoreboardCard}>
                <View style={styles.scoreboardHeader}>
                  <Text style={styles.scoreboardTitle}>🏆 שחקנים</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scoreboardList}>
                  {[...room.players].sort((a, b) => b.score - a.score).map((player, idx) => {
                    const isCurrentTurn = room.players[room.current_turn_index]?.name === player.name;
                    
                    return (
                      <View
                        key={player.name}
                        style={[styles.scoreboardPlayerCard, isCurrentTurn && styles.scoreboardPlayerCardActive]}
                      >
                        <View style={styles.scoreboardPlayerContent}>
                          <View style={styles.scoreboardRankRow}>
                            <Text style={styles.scoreboardRank}>#{idx + 1}</Text>
                            {idx === 0 && player.score > 0 && (
                              <Text style={styles.trophyIcon}>🏆</Text>
                            )}
                          </View>
                          <Text style={styles.scoreboardPlayerName}>{player.name}</Text>
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
                </ScrollView>
              </View>
            </View>
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
        {room.show_round_summary && !room.drinking_players && 
         room.players && Array.isArray(room.players) && 
         room.players.some(p => p && p.name === currentPlayerName) && (
          <Modal
            visible={true}
            transparent={true}
            animationType="fade"
            onRequestClose={() => {}}
          >
            <View style={styles.modalOverlay}>
              <ScrollView 
                contentContainerStyle={styles.modalScrollContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.modalContent}>
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

                  {/* Drawing */}
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

                  {/* Guesses */}
                  <View style={styles.guessesSection}>
                    <Text style={styles.guessesSectionTitle}>ניחושים:</Text>
                    <ScrollView style={styles.summaryGuessesList} nestedScrollEnabled>
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
                    </ScrollView>
                  </View>

                  {/* Updated Scores */}
                  <View style={styles.scoresSection}>
                    <Text style={styles.scoresSectionTitle}>לוח תוצאות:</Text>
                    <View style={styles.scoresGrid}>
                      {[...room.players].sort((a, b) => b.score - a.score).map((player) => {
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
                              <Text style={styles.scoreItemBadgeText}>{player.score} נקודות</Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>

                  <GradientButton
                    title="המשך לסבב הבא"
                    onPress={continueToNextRound}
                    variant="purple"
                    style={styles.continueButton}
                  />
                </View>
              </ScrollView>
            </View>
          </Modal>
        )}

        {/* Finished State Modal */}
        {room.game_status === 'finished' && 
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
                  {isHost && (
                    <GradientButton
                      title="משחק חדש"
                      onPress={resetGame}
                      variant="purple"
                      style={styles.resetButton}
                    />
                  )}
                  <GradientButton
                    title="חזרה לתפריט הראשי"
                    onPress={goBack}
                    variant="outline"
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
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
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
    gap: 8,
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
    color: '#9C27B0',
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
    backgroundColor: '#9C27B0',
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
    borderColor: '#C084FC',
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
    borderColor: '#C084FC',
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
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  gameMain: {
    flex: 1,
    minWidth: 300,
    maxWidth: 600,
    gap: 16,
    alignItems: 'center',
  },
  statusCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusContent: {
    gap: 12,
    alignItems: 'center',
  },
  timerContainer: {
    marginBottom: 8,
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
  wordCard: {
    backgroundColor: '#FEF3C7',
    borderWidth: 2,
    borderColor: '#FCD34D',
    borderRadius: 16,
    padding: 16,
    width: '100%',
    alignItems: 'center',
  },
  wordLabel: {
    fontSize: 12,
    color: '#92400E',
    marginBottom: 8,
  },
  wordText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#92400E',
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
    borderColor: '#C084FC',
  },
  sendButton: {
    backgroundColor: '#10B981',
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
    gap: 12,
  },
  toolButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  toolButton: {
    flex: 1,
  },
  canvasContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  sidebar: {
    width: 300,
    gap: 16,
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
    padding: 12,
    alignItems: 'center',
  },
  guessesTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  guessesList: {
    maxHeight: 240,
    padding: 12,
    gap: 8,
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
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 8,
  },
  guessItemCorrect: {
    backgroundColor: '#D1FAE5',
    borderColor: '#10B981',
  },
  guessItemContent: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  guessPlayerName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },
  guessText: {
    fontSize: 14,
    color: '#374151',
  },
  guessTextCorrect: {
    color: '#059669',
    fontWeight: '700',
  },
  checkmark: {
    fontSize: 16,
    color: '#10B981',
  },
  scoreboardCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  scoreboardHeader: {
    backgroundColor: '#9C27B0',
    padding: 16,
    alignItems: 'center',
  },
  scoreboardTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  scoreboardList: {
    gap: 12,
    padding: 16,
  },
  scoreboardPlayerCard: {
    minWidth: 140,
    backgroundColor: '#F9FAFB',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 12,
  },
  scoreboardPlayerCardActive: {
    backgroundColor: '#F3E8FF',
    borderColor: '#C084FC',
  },
  scoreboardPlayerContent: {
    alignItems: 'center',
    gap: 8,
  },
  scoreboardRankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  scoreboardRank: {
    fontSize: 20,
    fontWeight: '900',
    color: '#9CA3AF',
  },
  trophyIcon: {
    fontSize: 20,
  },
  scoreboardPlayerName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },
  drawingBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  drawingBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  scoreboardScore: {
    fontSize: 24,
    fontWeight: '900',
    color: '#9C27B0',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 600,
    maxHeight: '90%',
    gap: 24,
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
    backgroundColor: '#10B981',
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
  },
  summaryTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  winnerCard: {
    backgroundColor: '#D1FAE5',
    borderWidth: 2,
    borderColor: '#10B981',
    borderRadius: 16,
    padding: 20,
    gap: 12,
    alignItems: 'center',
  },
  trophyIconLarge: {
    fontSize: 48,
  },
  winnerTitle: {
    fontSize: 24,
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
    backgroundColor: '#10B981',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  winnerBadgeText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  eyeIconLarge: {
    fontSize: 48,
  },
  noWinnerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#7C3AED',
    textAlign: 'center',
  },
  wordReveal: {
    fontSize: 16,
    color: '#059669',
    textAlign: 'center',
  },
  wordRevealBold: {
    fontWeight: '700',
  },
  drawingSection: {
    gap: 12,
  },
  drawingSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
  },
  drawingDisplay: {
    borderWidth: 4,
    borderColor: '#C084FC',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  guessesSection: {
    gap: 12,
  },
  guessesSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  summaryGuessesList: {
    maxHeight: 240,
    gap: 8,
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
    borderWidth: 2,
    borderColor: '#D1D5DB',
    borderRadius: 16,
    padding: 12,
  },
  summaryGuessItemCorrect: {
    backgroundColor: '#D1FAE5',
    borderColor: '#10B981',
  },
  summaryGuessContent: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  summaryGuessPlayerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  summaryGuessLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  summaryGuessText: {
    fontSize: 14,
    color: '#374151',
  },
  summaryGuessTextCorrect: {
    color: '#059669',
    fontWeight: '700',
  },
  summaryCheckmark: {
    fontSize: 20,
    color: '#10B981',
  },
  scoresSection: {
    gap: 12,
  },
  scoresSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  scoresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  scoreItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#F9FAFB',
    borderWidth: 2,
    borderColor: '#D1D5DB',
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scoreItemEarned: {
    backgroundColor: '#D1FAE5',
    borderColor: '#10B981',
  },
  scoreItemName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  scoreItemBadge: {
    backgroundColor: '#9C27B0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  scoreItemBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  continueButton: {
    marginTop: 8,
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
    backgroundColor: '#9C27B0',
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
  },
  resetButton: {
    marginBottom: 8,
  },
  exitButton: {
    marginTop: 8,
  },
});
