import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator, Modal, Switch, TouchableOpacity, Platform, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';
import BannerAd from '../../components/shared/BannerAd';
import UnifiedTopBar from '../../components/shared/UnifiedTopBar';
import RulesModal from '../../components/shared/RulesModal';
import { db, waitForFirestoreReady } from '../../firebase';
import { doc, getDoc, updateDoc, onSnapshot, query, collection, where, getDocs } from 'firebase/firestore';
import { atomicPlayerJoin } from '../../utils/playerJoin';
import storage from '../../utils/storage';
import { saveCurrentRoom, loadCurrentRoom, clearCurrentRoom } from '../../utils/navigationState';
import { setupGameEndDeletion, setupAllAutoDeletions } from '../../utils/roomManagement';

export default function SpyRoomScreen({ navigation, route }) {
  const roomCode = route?.params?.roomCode || '';
  const insets = useSafeAreaInsets();
  const [room, setRoom] = useState(null);
  const [currentPlayerName, setCurrentPlayerName] = useState('');
  const [timeLeft, setTimeLeft] = useState(360); // 6 minutes
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [drinkingMode, setDrinkingMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showLocations, setShowLocations] = useState(false);
  const [numberOfSpies, setNumberOfSpies] = useState(1);
  const [spyGuess, setSpyGuess] = useState('');
  const [spyGuessSubmitted, setSpyGuessSubmitted] = useState(false);
  const [gameMode, setGameMode] = useState('locations'); // 'locations' or 'word'

  const timerInterval = useRef(null);
  const unsubscribeRef = useRef(null);
  const autoDeletionCleanupRef = useRef({ cancelGameEnd: () => {}, cancelEmptyRoom: () => {}, cancelAge: () => {} });

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
      saveCurrentRoom('spy', roomCode, {});
    }
  }, [roomCode]);

  // Initialize room and set up listener (like Alias does)
  useEffect(() => {
    if (!roomCode) {
      // Try to restore from saved state on refresh
      const restoreRoom = async () => {
        try {
          const savedRoom = await loadCurrentRoom();
          if (savedRoom && savedRoom.gameType === 'spy' && savedRoom.roomCode) {
            navigation.replace('SpyRoom', { roomCode: savedRoom.roomCode });
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
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
      timerInterval.current = null;
    }

    loadRoom();
    setupRealtimeListener();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
        timerInterval.current = null;
      }
    };
  }, [roomCode]);

  // Cleanup timers/listeners on navigation away
  useEffect(() => {
    const unsubscribeNav = navigation.addListener('beforeRemove', () => {
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
        timerInterval.current = null;
      }
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    });
    return unsubscribeNav;
  }, [navigation]);

  useEffect(() => {
    // Start timer when game starts
    if (room?.game_status === 'playing' && room?.game_start_time) {
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
      }

      const updateTimer = async () => {
        const elapsed = Math.floor((Date.now() - room.game_start_time) / 1000);
        const remaining = Math.max(0, 360 - elapsed);
        setTimeLeft(remaining);

        if (remaining === 0) {
          clearInterval(timerInterval.current);
          await endGame(room);
        }
      };

      updateTimer();
      timerInterval.current = setInterval(updateTimer, 1000);
    } else if (room?.game_status !== 'playing' && timerInterval.current) {
      clearInterval(timerInterval.current);
      timerInterval.current = null;
    }

    return () => {
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
        timerInterval.current = null;
      }
    };
  }, [room?.game_status, room?.game_start_time, room?.id]);

  const loadRoom = async () => {
    console.log('🔵 Loading Spy room with code:', roomCode);
    try {
      setIsLoading(true);
      await waitForFirestoreReady();
      
      const roomRef = doc(db, 'SpyRoom', roomCode);
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

      // Get player name from storage (needed early for host checks)
      const playerName = currentPlayerName || (await storage.getItem('playerName')) || '';
      if (playerName) {
        setCurrentPlayerName(playerName);
      }

      // Load numberOfSpies from room (default to 1)
      // Only write default if we're the host (to avoid race conditions with multiple players)
      if (roomData.number_of_spies !== undefined && roomData.number_of_spies !== null) {
        setNumberOfSpies(roomData.number_of_spies);
      } else {
        setNumberOfSpies(1);
        // Only write default if we're the host to avoid unnecessary concurrent writes
        if (roomData.id && roomData.host_name === playerName) {
          const roomRef = doc(db, 'SpyRoom', roomData.id);
          updateDoc(roomRef, { number_of_spies: 1 }).catch(err => {
            console.error('Error setting default number of spies:', err);
          });
        }
      }

      // Load game mode from room (default to 'locations')
      if (roomData.game_mode !== undefined && roomData.game_mode !== null) {
        setGameMode(roomData.game_mode);
      } else {
        setGameMode('locations');
        // Only write default if we're the host to avoid unnecessary concurrent writes
        if (roomData.id && roomData.host_name === playerName) {
          const roomRef = doc(db, 'SpyRoom', roomData.id);
          updateDoc(roomRef, { game_mode: 'locations' }).catch(err => {
            console.error('Error setting default game mode:', err);
          });
        }
      }

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

      // Check game status first - don't allow new joins if game is playing/finished
      if (playerName && (roomData.game_status === 'playing' || roomData.game_status === 'finished')) {
        const playerExists = roomData.players && Array.isArray(roomData.players) && 
          roomData.players.some(p => p && p.name === playerName);
        if (!playerExists) {
          console.warn('⚠️ Player tried to join game that is already in progress');
          Alert.alert('שגיאה', 'המשחק כבר התחיל. לא ניתן להצטרף כעת.');
          navigation.goBack();
          return;
        }
      }
      
      // Use atomic join for lobby state
      if (playerName && roomData.game_status === 'lobby') {
        const result = await atomicPlayerJoin(
          'SpyRoom',
          roomData.id,
          playerName,
          () => ({ name: playerName }), // createPlayerObject
          (players, name) => players.findIndex(p => p && p.name === name), // findPlayerIndex
          null, // updatePlayerObject (no update needed for new joins)
          3 // maxRetries
        );
        
        if (result.success && result.roomData) {
          console.log('✅ Player joined Spy room successfully:', playerName);
          setRoom(result.roomData);
          return;
        } else {
          console.error('❌ Failed to join Spy room:', result.error);
          Alert.alert('שגיאה', 'לא הצלחנו להצטרף לחדר. נסה שוב.');
          navigation.goBack();
          return;
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

  const setupRealtimeListener = () => {
    // Prevent duplicate listeners
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    const roomRef = doc(db, 'SpyRoom', roomCode);
    
    unsubscribeRef.current = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const newRoom = { id: snapshot.id, ...snapshot.data() };
        
        // Sync drinking mode from room data
        if (newRoom.drinking_mode !== undefined) {
          setDrinkingMode(newRoom.drinking_mode);
          // Also sync to local storage
          storage.setItem('drinkingMode', newRoom.drinking_mode.toString()).catch(() => {});
        }

        // Sync game mode from room data
        if (newRoom.game_mode !== undefined && newRoom.game_mode !== null) {
          setGameMode(newRoom.game_mode);
        }
        
        setRoom(prevRoom => {
          if (!prevRoom) {
            // Update numberOfSpies when room is first loaded
            if (newRoom.number_of_spies !== undefined && newRoom.number_of_spies !== null) {
              setNumberOfSpies(newRoom.number_of_spies);
            }
            return newRoom;
          }
          
          // If game is playing, only allow updates that don't change critical game state
          if (prevRoom.game_status === 'playing' && newRoom.game_status === 'playing') {
            const criticalFieldsChanged = 
              JSON.stringify(prevRoom.all_locations) !== JSON.stringify(newRoom.all_locations) ||
              JSON.stringify(prevRoom.chosen_location) !== JSON.stringify(newRoom.chosen_location) ||
              prevRoom.spy_name !== newRoom.spy_name ||
              JSON.stringify(prevRoom.players.map(p => ({ name: p.name, is_spy: p.is_spy, location: p.location, role: p.role }))) !==
              JSON.stringify(newRoom.players.map(p => ({ name: p.name, is_spy: p.is_spy, location: p.location, role: p.role })));
            
            if (criticalFieldsChanged) {
              console.warn('⚠️ Blocked critical game state change during active game');
              return prevRoom;
            }
          }
          
          // Update numberOfSpies if it changed in room (only in lobby)
          if (newRoom.game_status === 'lobby' && newRoom.number_of_spies !== undefined && 
              newRoom.number_of_spies !== null && newRoom.number_of_spies !== numberOfSpies) {
            setNumberOfSpies(newRoom.number_of_spies);
          }

          // Update game mode if it changed in room (only in lobby)
          if (newRoom.game_status === 'lobby' && newRoom.game_mode !== undefined && 
              newRoom.game_mode !== null && newRoom.game_mode !== gameMode) {
            setGameMode(newRoom.game_mode);
          }
          
          if (JSON.stringify(prevRoom) !== JSON.stringify(newRoom)) {
            return newRoom;
          }
          return prevRoom;
        });
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
      autoDeletionCleanupRef.current.cancelGameEnd = setupGameEndDeletion('SpyRoom', room.id, 5 * 60 * 1000);
      
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
      const cleanup = setupAllAutoDeletions('SpyRoom', room.id, {
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

  // Watch for all_votes_submitted and trigger endGame
  useEffect(() => {
    if (!room || room.game_status !== 'playing') return;
    if (room.all_votes_submitted !== true) return;
    
    console.log('🔵 All votes submitted, ending game...');
    endGame(room);
  }, [room?.all_votes_submitted, room?.game_status, room?.id]);

  const startGame = async () => {
    if (!room || !room.players || !Array.isArray(room.players) || room.players.length < 3) {
      Alert.alert('שגיאה', 'נדרשים לפחות 3 שחקנים!');
      return;
    }

    // Use realtime listener state (more efficient than re-reading)
    const currentRoom = room;

    if (currentRoom.game_status !== 'lobby') {
      console.warn('⚠️ Cannot start game - room is not in lobby state:', currentRoom.game_status);
      Alert.alert('שגיאה', 'החדר לא מוכן למשחק חדש. אנא לחץ על \'משחק חדש\' תחילה.');
      return;
    }

    const currentGameMode = currentRoom.game_mode || 'locations';
    const freshPlayers = currentRoom.players.map(p => ({ name: p.name }));
    const numSpies = currentRoom.number_of_spies || 1;
    
    // Validate number of spies
    const maxSpies = Math.max(1, Math.floor(freshPlayers.length / 2)); // At most half the players
    const actualNumSpies = Math.min(numSpies, maxSpies);

    // Select random spies
    const shuffledPlayers = [...freshPlayers].sort(() => Math.random() - 0.5);
    const spyIndices = new Set();
    const spyNames = [];
    
    for (let i = 0; i < actualNumSpies && i < shuffledPlayers.length; i++) {
      spyIndices.add(shuffledPlayers[i].name);
      spyNames.push(shuffledPlayers[i].name);
    }

    let updatedPlayers = [];
    let chosenLocation = '';
    let allLocationNames = [];
    let chosenWord = '';

    if (currentGameMode === 'locations') {
      // Locations mode - existing behavior
      let locations = [];
      try {
        const locationsSnapshot = await getDocs(collection(db, 'SpyLocation'));
        locationsSnapshot.forEach((doc) => {
          locations.push({ id: doc.id, ...doc.data() });
        });
      } catch (error) {
        console.error('❌ Error loading locations:', error);
        Alert.alert('שגיאה', 'שגיאה בטעינת מיקומים. נסה שוב.');
        return;
      }
      
      if (!locations || locations.length === 0) {
        Alert.alert('שגיאה', 'אין מיקומים במערכת!');
        return;
      }

      const randomLocation = locations[Math.floor(Math.random() * locations.length)];

      if (!randomLocation || !randomLocation.location || !randomLocation.roles || !Array.isArray(randomLocation.roles)) {
        console.error('❌ Invalid location structure:', randomLocation);
        Alert.alert('שגיאה', 'שגיאה: מיקום לא תקין. נסה שוב.');
        return;
      }

      updatedPlayers = freshPlayers.map((player) => {
        if (spyIndices.has(player.name)) {
          return {
            name: player.name,
            is_spy: true,
            location: '',
            role: '',
            votes: [] // Array for multiple votes
          };
        } else {
          const randomRole = randomLocation.roles[Math.floor(Math.random() * randomLocation.roles.length)];
          return {
            name: player.name,
            is_spy: false,
            location: randomLocation.location,
            role: randomRole,
            votes: [] // Array for multiple votes
          };
        }
      });

      chosenLocation = randomLocation.location || '';
      allLocationNames = locations.map(loc => loc.location).filter(loc => loc != null);
    } else {
      // Word mode - new behavior
      let words = [];
      try {
        const wordsSnapshot = await getDocs(collection(db, 'WordCard'));
        wordsSnapshot.forEach((doc) => {
          const wordData = doc.data();
          if (wordData.word && typeof wordData.word === 'string' && wordData.word.trim().length > 0) {
            words.push(wordData.word.trim());
          }
        });
      } catch (error) {
        console.error('❌ Error loading words:', error);
        Alert.alert('שגיאה', 'שגיאה בטעינת מילים. נסה שוב.');
        return;
      }
      
      if (!words || words.length === 0) {
        Alert.alert('שגיאה', 'אין מילים במערכת!');
        return;
      }

      const randomWord = words[Math.floor(Math.random() * words.length)];

      updatedPlayers = freshPlayers.map((player) => {
        if (spyIndices.has(player.name)) {
          return {
            name: player.name,
            is_spy: true,
            location: '',
            role: '',
            votes: [] // Array for multiple votes
          };
        } else {
          // All non-spies get the same word, no role
          return {
            name: player.name,
            is_spy: false,
            location: randomWord, // Reuse location field to store word
            role: '', // No role in word mode
            votes: [] // Array for multiple votes
          };
        }
      });

      chosenWord = randomWord;
      // In word mode, we don't need all_locations
      allLocationNames = [];
    }

    if (!currentRoom || !currentRoom.id) {
      console.error('❌ Cannot start game: room or room.id is missing');
      Alert.alert('שגיאה', 'חדר לא נטען כראוי. נסה לרענן את הדף.');
      return;
    }

    console.log('🔵 Starting Spy game, updating room:', currentRoom.id);
    try {
      const roomRef = doc(db, 'SpyRoom', currentRoom.id);
      const updates = {
        players: updatedPlayers,
        game_status: 'playing',
        game_start_time: Date.now(),
        spy_name: spyNames.length === 1 ? spyNames[0] : '', // For backward compatibility, use first spy if only one
        spy_names: spyNames, // Array of all spy names
        chosen_location: currentGameMode === 'locations' ? chosenLocation : chosenWord,
        all_locations: allLocationNames,
        eliminated_locations: [],
        all_votes_submitted: false
      };
      await updateDoc(roomRef, updates);
      console.log('✅ Game started successfully with fresh state');
      setRoom(prev => ({ ...prev, ...updates }));
    } catch (error) {
      console.error('❌ Error starting game:', error);
      Alert.alert('שגיאה', 'שגיאה בהתחלת המשחק. נסה שוב.');
      return;
    }
  };

  const toggleLocationEliminated = async (locationName) => {
    if (!room || room.game_status !== 'playing' || !isSpy) return;

    const eliminated = room.eliminated_locations || [];
    let updatedEliminated;

    if (eliminated.includes(locationName)) {
      updatedEliminated = eliminated.filter(loc => loc !== locationName);
    } else {
      updatedEliminated = [...eliminated, locationName];
    }

    try {
      const roomRef = doc(db, 'SpyRoom', room.id);
      await updateDoc(roomRef, {
        eliminated_locations: updatedEliminated
      });
    } catch (error) {
      console.error('❌ Error updating eliminated locations:', error);
    }
  };

  const voteForPlayer = async (votedPlayerName) => {
    if (!room || room.game_status !== 'playing' || !currentPlayerName) return;

    const numSpies = room.number_of_spies || 1;
    const currentPlayer = room.players.find(p => p && p.name === currentPlayerName);
    if (!currentPlayer) return;

    // Get current votes array or initialize as empty
    const currentVotes = currentPlayer.votes || [];
    
    // If already voted for this player, remove the vote (toggle)
    // Otherwise, add the vote (up to numSpies votes)
    let updatedVotes;
    if (currentVotes.includes(votedPlayerName)) {
      // Remove vote
      updatedVotes = currentVotes.filter(v => v !== votedPlayerName);
    } else {
      // Add vote if we haven't reached the limit
      if (currentVotes.length < numSpies) {
        updatedVotes = [...currentVotes, votedPlayerName];
      } else {
        // Already at limit, can't add more votes
        return;
      }
    }

    const updatedPlayers = room.players.map(p => {
      if (p.name === currentPlayerName) {
        return { ...p, votes: updatedVotes };
      }
      return p;
    });

    // Check if all players have submitted their votes (each player needs numSpies votes)
    const allVoted = updatedPlayers.every(p => {
      const playerVotes = p.votes || [];
      return playerVotes.length === numSpies;
    });
    
    try {
      const roomRef = doc(db, 'SpyRoom', room.id);
      await updateDoc(roomRef, {
        players: updatedPlayers,
        all_votes_submitted: allVoted && updatedPlayers.length > 0
      });
      console.log('✅ Vote submitted. Votes:', updatedVotes, 'All votes submitted:', allVoted);
    } catch (error) {
      console.error('❌ Error submitting vote:', error);
      return;
    }
  };

  const submitSpyGuess = async (guess) => {
    if (!room || room.game_status !== 'playing' || !currentPlayerName || !isSpy) return;
    if (!guess || !guess.trim()) {
      Alert.alert('שגיאה', 'אנא הכנס ניחוש');
      return;
    }

    if (room.spy_guess) {
      Alert.alert('שגיאה', 'כבר שלחת ניחוש');
      return;
    }

    const trimmedGuess = guess.trim();
    setSpyGuessSubmitted(true);

    try {
      const roomRef = doc(db, 'SpyRoom', room.id);
      const correctAnswer = room.chosen_location || '';
      const isCorrect = trimmedGuess.toLowerCase() === correctAnswer.toLowerCase();
      
      // Batch both updates into a single write
      await updateDoc(roomRef, {
        spy_guess: trimmedGuess,
        spy_guess_correct: isCorrect,
        spy_guess_player: currentPlayerName,
        game_status: 'finished'
      });

      const isWordMode = room.game_mode === 'word';
      if (isCorrect) {
        Alert.alert('🎉 ניצחון!', `צדקת! ${isWordMode ? 'המילה הייתה' : 'המיקום היה'}: ${correctAnswer}\nהמשחק הסתיים - המרגל ניצח!`);
      } else {
        Alert.alert('❌ טעות', `הניחוש שלך שגוי.\n${isWordMode ? 'המילה הייתה' : 'המיקום היה'}: ${correctAnswer}\nהמשחק הסתיים - המרגל הפסיד!`);
      }

      console.log('✅ Spy guess submitted:', trimmedGuess, 'Correct:', isCorrect);
    } catch (error) {
      console.error('❌ Error submitting spy guess:', error);
      setSpyGuessSubmitted(false);
      Alert.alert('שגיאה', 'שגיאה בשליחת הניחוש. נסה שוב.');
    }
  };

  const endGame = async (roomData = null) => {
    const roomToUse = roomData || room;
    if (!roomToUse || !roomToUse.id) return;

    if (!roomData) {
      if (roomToUse.host_name !== currentPlayerName) {
        console.log('❌ Only host can end the game manually');
        return;
      }
      console.log('🔵 Host manually ending game for room:', roomToUse.id);
    } else {
      console.log('🔵 Auto-ending game for room:', roomToUse.id);
    }

    try {
      const roomRef = doc(db, 'SpyRoom', roomToUse.id);
      await updateDoc(roomRef, {
        game_status: 'finished'
      });
      console.log('✅ Game ended successfully');
    } catch (error) {
      console.error('❌ Error ending game:', error);
      Alert.alert('שגיאה', 'שגיאה בסיום המשחק. נסה שוב.');
    }
  };

  const resetGame = async () => {
    if (!room || !room.id || !room.players || !Array.isArray(room.players) || !isHost) return;
    
    // Cancel game end auto-deletion since we're resetting
    if (autoDeletionCleanupRef.current.cancelGameEnd) {
      autoDeletionCleanupRef.current.cancelGameEnd();
      autoDeletionCleanupRef.current.cancelGameEnd = () => {};
    }
    
    // Cancel timer
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
      timerInterval.current = null;
    }
    
    const resetPlayers = room.players.map(p => ({ name: p.name }));
    
    try {
      const roomRef = doc(db, 'SpyRoom', room.id);
      await updateDoc(roomRef, {
        players: resetPlayers,
        game_status: 'lobby',
        game_start_time: null,
        spy_name: null,
        spy_names: null,
        chosen_location: null,
        all_locations: null,
        eliminated_locations: null,
        all_votes_submitted: false,
        spy_guess: null,
        spy_guess_correct: null,
        spy_guess_player: null
        // Note: game_mode is preserved when resetting
      });
      // Reset local state
      setSpyGuess('');
      setSpyGuessSubmitted(false);
      console.log('✅ Game reset successfully - all state cleared');
    } catch (error) {
      console.error('❌ Error resetting game:', error);
      Alert.alert('שגיאה', 'לא הצלחנו לאפס את המשחק. נסה שוב.');
    }
  };

  const handleRulesPress = () => {
    setShowRulesModal(true);
  };

  const goBack = async () => {
    // Cleanup all listeners and timers
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
      timerInterval.current = null;
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

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (error) {
    return (
      <GradientBackground variant="spy">
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
            variant="spy"
            style={styles.errorButton}
          />
        </View>
      </GradientBackground>
    );
  }

  if (isLoading || !room) {
    return (
      <GradientBackground variant="spy">
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.loadingText}>טוען משחק המרגל...</Text>
        </View>
      </GradientBackground>
    );
  }

  const isHost = room?.host_name === currentPlayerName;
  const players = room?.players && Array.isArray(room.players) ? room.players : [];
  const currentPlayer = players.find(p => p && p.name === currentPlayerName);
  const isSpy = currentPlayer?.is_spy || false;
  const myVotes = currentPlayer?.votes || []; // Array of votes
  const numSpies = room?.number_of_spies || 1;

  return (
    <GradientBackground variant="spy">
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Unified Top Bar */}
        <UnifiedTopBar
          roomCode={roomCode}
          variant="spy"
          onExit={goBack}
          onRulesPress={handleRulesPress}
          drinkingMode={drinkingMode}
        />

        {/* Rules Modal */}
        <RulesModal
          visible={showRulesModal}
          onClose={() => setShowRulesModal(false)}
          variant="spy"
          gameMode={room?.game_mode || 'locations'}
        />

        {/* Lobby State */}
        {room.game_status === 'lobby' && (
          <View style={styles.lobbyCard}>
            <View style={styles.lobbyHeader}>
              <Text style={styles.lobbyTitle}>👥 חדר המתנה</Text>
            </View>
            <View style={styles.lobbyContent}>
              {/* Show current game mode to all players in lobby */}
              {room?.game_mode && (
                <View style={styles.gameModeInfoBadge}>
                  <Text style={styles.gameModeInfoText}>
                    🎮 מצב משחק: {room.game_mode === 'word' ? 'מילה' : 'מיקומים'}
                  </Text>
                </View>
              )}
              
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
                            const roomRef = doc(db, 'SpyRoom', room.id);
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
                  
                  {/* Game Mode Selection */}
                  <View style={styles.gameModeSelectionContainer}>
                    <Text style={styles.gameModeSelectionLabel}>🎮 מצב משחק:</Text>
                    <View style={styles.gameModeButtonsRow}>
                      {[
                        { value: 'locations', label: 'מיקומים' },
                        { value: 'word', label: 'מילה' }
                      ].map((mode) => {
                        const isSelected = gameMode === mode.value;
                        return (
                          <Pressable
                            key={mode.value}
                            onPress={async () => {
                              if (room?.id) {
                                const newGameMode = mode.value;
                                setGameMode(newGameMode);
                                // Save to room
                                try {
                                  const roomRef = doc(db, 'SpyRoom', room.id);
                                  await updateDoc(roomRef, { game_mode: newGameMode });
                                  console.log('✅ Game mode updated to:', newGameMode);
                                } catch (err) {
                                  console.error('❌ Error updating game mode:', err);
                                  // Revert on error
                                  setGameMode(gameMode);
                                }
                              }
                            }}
                            style={[
                              styles.gameModeButton,
                              isSelected && styles.gameModeButtonSelected
                            ]}
                          >
                            <Text style={[
                              styles.gameModeButtonText,
                              isSelected && styles.gameModeButtonTextSelected
                            ]}>
                              {mode.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Text style={styles.gameModeSelectionHint}>
                      {gameMode === 'locations' 
                        ? 'כל שחקן מקבל מיקום ותפקיד' 
                        : 'כל השחקנים מקבלים אותה מילה'}
                    </Text>
                  </View>

                  {/* Number of Spies Selection */}
                  <View style={styles.spiesSelectionContainer}>
                    <Text style={styles.spiesSelectionLabel}>🕵️ מספר מרגלים:</Text>
                    <View style={styles.spiesButtonsRow}>
                      {[1, 2, 3, 4].map((num) => {
                        const maxSpies = Math.max(1, Math.floor(players.length / 2));
                        const isDisabled = num > maxSpies || num > players.length;
                        const isSelected = numberOfSpies === num;
                        return (
                          <Pressable
                            key={num}
                            onPress={async () => {
                              if (!isDisabled && room?.id) {
                                const newNumSpies = num;
                                setNumberOfSpies(newNumSpies);
                                // Save to room
                                try {
                                  const roomRef = doc(db, 'SpyRoom', room.id);
                                  await updateDoc(roomRef, { number_of_spies: newNumSpies });
                                  console.log('✅ Number of spies updated to:', newNumSpies);
                                } catch (err) {
                                  console.error('❌ Error updating number of spies:', err);
                                  // Revert on error
                                  setNumberOfSpies(numberOfSpies);
                                }
                              }
                            }}
                            disabled={isDisabled}
                            style={[
                              styles.spyCountButton,
                              isSelected && styles.spyCountButtonSelected,
                              isDisabled && styles.spyCountButtonDisabled
                            ]}
                          >
                            <Text style={[
                              styles.spyCountButtonText,
                              isSelected && styles.spyCountButtonTextSelected,
                              isDisabled && styles.spyCountButtonTextDisabled
                            ]}>
                              {num}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Text style={styles.spiesSelectionHint}>
                      {numberOfSpies === 1 
                        ? 'יהיה מרגל אחד במשחק' 
                        : `יהיו ${numberOfSpies} מרגלים במשחק`}
                    </Text>
                  </View>
                </View>
              )}

              {/* Show number of spies to non-host players (game mode already shown above) */}
              {!isHost && (
                <>
                  {room?.number_of_spies && (
                    <View style={styles.spiesInfoBadge}>
                      <Text style={styles.spiesInfoText}>
                        🕵️ במשחק זה {room.number_of_spies === 1 ? 'יהיה מרגל אחד' : `יהיו ${room.number_of_spies} מרגלים`}
                      </Text>
                    </View>
                  )}
                </>
              )}

              {!isHost && room?.drinking_mode === true && (
                <View style={styles.drinkingBadge}>
                  <Text style={styles.drinkingBadgeText}>🍺 מצב שתייה פעיל</Text>
                </View>
              )}

              <View style={styles.greetingCard}>
                <Text style={styles.greetingText}>שלום, {currentPlayerName}!</Text>
              </View>

              <View style={styles.playersSection}>
                <Text style={styles.playersTitle}>שחקנים בחדר ({players.length})</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.playersList}>
                  {players
                    .filter((player) => player != null && player.name != null)
                    .map((player, idx) => {
                      const playerName = typeof player.name === 'string' ? player.name : String(player.name || '');
                      return (
                        <View key={`player-${idx}`} style={styles.playerCard}>
                          <View style={styles.playerDot} />
                          <Text style={styles.playerCardName}>{playerName}</Text>
                          {playerName === room?.host_name && (
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
                  variant="spy"
                  style={styles.startButton}
                  disabled={players.length < 3}
                />
              )}

              {players.length < 3 && (
                <View style={styles.warningCard}>
                  <Text style={styles.warningText}>נדרשים לפחות 3 שחקנים להתחלת המשחק</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Playing State */}
        {room.game_status === 'playing' && (
          <View style={styles.gameContainer}>
            <View style={[styles.gameMain, isSpy && styles.gameMainSpy]}>
              {/* Timer */}
              <View style={[styles.timerCard, timeLeft <= 60 && styles.timerCardUrgent]}>
                <Text style={styles.timerIcon}>⏰</Text>
                <Text style={[styles.timerText, timeLeft <= 60 && styles.timerTextUrgent]}>
                  {formatTime(timeLeft)}
                </Text>
              </View>

              {/* Player Info */}
              <View style={styles.playerInfoCard}>
                <View style={[styles.playerInfoHeader, isSpy && styles.playerInfoHeaderSpy]}>
                  <Text style={styles.playerInfoTitle}>
                    {isSpy ? '👁️‍🗨️ אתה המרגל!' : (room.game_mode === 'word' ? '👁️ המילה' : '👁️ התפקיד שלך')}
                  </Text>
                </View>
                <View style={styles.playerInfoContent}>
                  {isSpy ? (
                    <View style={styles.spyInfo}>
                      <Text style={styles.spyEmoji}>🕵️</Text>
                      <Text style={styles.spyTitle}>אתה המרגל!</Text>
                      <Text style={styles.spyDescription}>
                        {room.game_mode === 'word' 
                          ? 'אתה לא יודע את המילה.\nנסה לגלות מהי המילה מבלי שיגלו שאתה המרגל!'
                          : 'אתה לא יודע את המקום.\nנסה לגלות מהו המיקום מבלי שיגלו שאתה המרגל!'}
                      </Text>
                      {room.game_mode !== 'word' && (
                        <View style={styles.spyTip}>
                          <Text style={styles.spyTipTitle}>💡 טיפ:</Text>
                          <Text style={styles.spyTipText}>השתמש ברשימת המקומות כדי לסמן מקומות שכבר שללת</Text>
                        </View>
                      )}
                    </View>
                  ) : (
                    <View style={styles.regularInfo}>
                      {room.game_mode === 'word' ? (
                        <View style={styles.locationCard}>
                          <Text style={styles.locationLabel}>המילה:</Text>
                          <Text style={styles.locationText}>{currentPlayer?.location}</Text>
                        </View>
                      ) : (
                        <>
                          <View style={styles.locationCard}>
                            <Text style={styles.locationLabel}>המיקום:</Text>
                            <Text style={styles.locationText}>{currentPlayer?.location}</Text>
                          </View>
                          <View style={styles.roleCard}>
                            <Text style={styles.roleLabel}>התפקיד שלך:</Text>
                            <Text style={styles.roleText}>{currentPlayer?.role}</Text>
                          </View>
                        </>
                      )}
                      <View style={styles.regularTip}>
                        <Text style={styles.regularTipTitle}>💡 טיפ:</Text>
                        <Text style={styles.regularTipText}>
                          {room.game_mode === 'word' 
                            ? 'אמור מילה הקשורה למילה הנתונה, אבל אל תחשוף אותה למרגל!'
                            : 'שאל שאלות כדי לגלות מי המרגל, אבל אל תחשוף יותר מדי!'}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              </View>

              {/* Voting Section */}
              <View style={styles.votingCard}>
                <View style={styles.votingHeader}>
                  <Text style={styles.votingTitle}>
                    הצבעה - מי המרגל{numSpies > 1 ? `ים? (${myVotes.length}/${numSpies} הצבעות)` : '?'}
                  </Text>
                  {numSpies > 1 && (
                    <Text style={styles.votingSubtitle}>
                      יש {numSpies} מרגלים - הצבע {numSpies} הצבעות
                    </Text>
                  )}
                </View>
                <View style={styles.votingContent}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.votingPlayersList}>
                    {players
                      .filter((player) => player != null && player.name != null)
                      .map((player, idx) => {
                      const playerName = typeof player.name === 'string' ? player.name : String(player.name || '');
                      // Count votes from all players for this player
                      const votesForPlayer = players.reduce((count, p) => {
                        const playerVotes = p.votes || [];
                        return count + playerVotes.filter(v => v === playerName).length;
                      }, 0);
                      const isMyVote = myVotes.includes(playerName);
                      const isMe = playerName === currentPlayerName;
                      const myVoteCount = myVotes.filter(v => v === playerName).length;

                      return (
                        <Pressable
                          key={`voting-player-${idx}`}
                          onPress={() => !isMe && voteForPlayer(playerName)}
                          disabled={isMe || (myVotes.length >= numSpies && !isMyVote)}
                          style={[
                            styles.votingPlayerCard,
                            isMyVote && styles.votingPlayerCardSelected,
                            isMe && styles.votingPlayerCardDisabled,
                            myVotes.length >= numSpies && !isMyVote && styles.votingPlayerCardDisabled
                          ]}
                        >
                          <Text style={styles.votingPlayerName}>{playerName}</Text>
                          {playerName === room.host_name && (
                            <Text style={styles.crownIconSmall}>👑</Text>
                          )}
                          {votesForPlayer > 0 && (
                            <View style={styles.voteCountBadge}>
                              <Text style={styles.voteCountText}>
                                {votesForPlayer} {votesForPlayer === 1 ? 'הצבעה' : 'הצבעות'}
                              </Text>
                            </View>
                          )}
                          {isMyVote && (
                            <View style={styles.myVoteBadge}>
                              <Text style={styles.myVoteText}>
                                {myVoteCount > 1 ? `${myVoteCount}x ` : ''}ההצבעה שלך ✓
                              </Text>
                            </View>
                          )}
                        </Pressable>
                      );
                    })}
                  </ScrollView>

                  <View style={styles.votingInfo}>
                    <Text style={styles.votingInfoText}>
                      💡 תוכל לשנות את הצבעתך בכל עת.
                    </Text>
                    <Text style={styles.votingInfoSubtext}>
                      המשחק יסתיים כשכולם יצביעו {numSpies > 1 ? `(${numSpies} הצבעות לכל שחקן)` : ''}, כשהמארח יסיים את המשחק, או כשהזמן יגמר.
                    </Text>
                    <View style={styles.votingProgress}>
                      <Text style={styles.votingProgressText}>
                        {players.filter(p => {
                          const playerVotes = p.votes || [];
                          return playerVotes.length === numSpies;
                        }).length} / {players.length}
                      </Text>
                      <Text style={styles.votingProgressLabel}>שחקנים סיימו להצביע</Text>
                    </View>
                  </View>
                </View>
              </View>

              {isHost && (
                <GradientButton
                  title="סיים משחק"
                  onPress={() => endGame()}
                  variant="spy"
                  style={styles.endButton}
                />
              )}

              {/* Spy Guess Input - Only for Spy */}
              {isSpy && !room.spy_guess && !spyGuessSubmitted && room.game_status === 'playing' && (
                <View style={styles.spyGuessCard}>
                  <View style={styles.spyGuessHeader}>
                    <Text style={styles.spyGuessTitle}>🎯 ניחוש המרגל</Text>
                  </View>
                  <View style={styles.spyGuessContent}>
                    <Text style={styles.spyGuessDescription}>
                      יש לך ניחוש אחד בלבד!{'\n'}
                      אם תצדק - תוכל לנצח את המשחק!
                    </Text>
                    <TextInput
                      style={styles.spyGuessInput}
                      placeholder="הכנס את הניחוש שלך..."
                      placeholderTextColor="#9CA3AF"
                      value={spyGuess}
                      onChangeText={setSpyGuess}
                      editable={!spyGuessSubmitted}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <GradientButton
                      title="שלח ניחוש"
                      onPress={() => submitSpyGuess(spyGuess)}
                      variant="spy"
                      style={styles.spyGuessButton}
                      disabled={!spyGuess.trim() || spyGuessSubmitted}
                    />
                  </View>
                </View>
              )}

              {/* Show submitted guess status */}
              {isSpy && (room.spy_guess || spyGuessSubmitted) && room.game_status === 'playing' && (
                <View style={styles.spyGuessSubmittedCard}>
                  <Text style={styles.spyGuessSubmittedText}>
                    ✓ ניחוש נשלח: {room.spy_guess || spyGuess}
                  </Text>
                </View>
              )}

              {/* Locations List - Only for Spy and only in Locations mode */}
              {isSpy && room.game_mode !== 'word' && (
                <View style={styles.locationsCard}>
                  <Pressable
                    style={styles.locationsHeader}
                    onPress={() => setShowLocations(!showLocations)}
                  >
                    <Text style={styles.locationsTitle}>רשימת מקומות</Text>
                    <Text style={styles.locationsToggleIcon}>{showLocations ? '▲' : '▼'}</Text>
                  </Pressable>
                  {showLocations && (
                    <ScrollView style={styles.locationsList} nestedScrollEnabled>
                      {room.all_locations && room.all_locations.map((location, idx) => {
                        const isEliminated = room.eliminated_locations?.includes(location);
                        
                        return (
                          <Pressable
                            key={idx}
                            onPress={() => toggleLocationEliminated(location)}
                            style={[
                              styles.locationItem,
                              isEliminated && styles.locationItemEliminated
                            ]}
                          >
                            <Text style={[
                              styles.locationItemText,
                              isEliminated && styles.locationItemTextEliminated
                            ]}>
                              {location}
                            </Text>
                            {isEliminated && (
                              <Text style={styles.eliminatedIcon}>✗</Text>
                            )}
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  )}
                </View>
              )}
            </View>
          </View>
        )}

        {/* Finished State */}
        {room.game_status === 'finished' && (
          <View style={styles.finishedCard}>
            <View style={styles.finishedHeader}>
              <Text style={styles.finishedTrophy}>🏆</Text>
              <Text style={styles.finishedTitle}>המשחק הסתיים!</Text>
            </View>

            <View style={styles.finishedContent}>
              <View style={styles.spyRevealCard}>
                <Text style={styles.spyRevealLabel}>
                  {(() => {
                    const spyNames = room?.spy_names || (room?.spy_name ? [room.spy_name] : []);
                    return spyNames.length === 1 ? 'המרגל היה:' : 'המרגלים היו:';
                  })()}
                </Text>
                <Text style={styles.spyRevealName}>
                  {(() => {
                    const spyNames = room?.spy_names || (room?.spy_name ? [room.spy_name] : []);
                    return spyNames.join(', ');
                  })()}
                </Text>
              </View>

              <View style={styles.locationRevealCard}>
                <Text style={styles.locationRevealLabel}>
                  {room.game_mode === 'word' ? 'המילה הייתה:' : 'המיקום היה:'}
                </Text>
                <Text style={styles.locationRevealName}>{room.chosen_location}</Text>
              </View>

              {/* Spy Guess Result - Show if spy guessed and was wrong */}
              {room.spy_guess && room.spy_guess_correct === false && (
                <View style={styles.spyGuessResultCard}>
                  <Text style={styles.spyGuessResultLabel}>ניחוש המרגל:</Text>
                  <Text style={styles.spyGuessResultText}>{room.spy_guess}</Text>
                  <Text style={styles.spyGuessResultStatus}>❌ ניחוש שגוי</Text>
                </View>
              )}

              {/* Spy Guess Result - Show if spy guessed and was correct */}
              {room.spy_guess && room.spy_guess_correct === true && (
                <View style={styles.spyGuessResultCardCorrect}>
                  <Text style={styles.spyGuessResultLabel}>ניחוש המרגל:</Text>
                  <Text style={styles.spyGuessResultText}>{room.spy_guess}</Text>
                  <Text style={styles.spyGuessResultStatusCorrect}>✅ ניחוש נכון - המרגל ניצח!</Text>
                </View>
              )}

              {/* Voting Results */}
              <View style={styles.votingResultsCard}>
                <Text style={styles.votingResultsTitle}>תוצאות ההצבעה:</Text>
                {(() => {
                  const spyNames = room?.spy_names || (room?.spy_name ? [room.spy_name] : []);
                  const voteCounts = players.map(player => {
                    // Count all votes for this player (including multiple votes from same player)
                    const votes = players.reduce((count, p) => {
                      const playerVotes = p.votes || [];
                      return count + playerVotes.filter(v => v === player.name).length;
                    }, 0);
                    const wasSpy = spyNames.includes(player.name);
                    return { player, votes, wasSpy };
                  });
                  
                  const maxVotes = Math.max(...voteCounts.map(v => v.votes));
                  const spyVotes = voteCounts.filter(v => v.wasSpy).map(v => v.votes);
                  const maxSpyVotes = spyVotes.length > 0 ? Math.max(...spyVotes) : 0;
                  
                  // Check if spy guessed
                  const spyGuessed = room.spy_guess && room.spy_guess.trim() !== '';
                  const spyGuessedCorrectly = room.spy_guess_correct === true;
                  const spyGuessedIncorrectly = room.spy_guess_correct === false;
                  
                  // Determine winner based on spy guess:
                  // 1. If spy guessed correctly → spy wins
                  // 2. If spy guessed incorrectly → spy loses (regardless of votes)
                  // 3. If spy didn't guess → use normal voting logic
                  let spyWon;
                  if (spyGuessed) {
                    spyWon = spyGuessedCorrectly;
                  } else {
                    // Normal voting logic: spies win if at least one spy has fewer votes than the max (not caught)
                    const allSpiesCaught = spyVotes.length > 0 && spyVotes.every(v => v === maxVotes && maxVotes > 0);
                    spyWon = !allSpiesCaught;
                  }
                  
                  return (
                    <>
                      <View style={[styles.resultCard, spyWon ? styles.resultCardSpyWon : styles.resultCardSpyCaught]}>
                        <Text style={styles.resultTitle}>
                          {spyWon 
                            ? (spyNames.length === 1 ? '🕵️ המרגל ניצח!' : '🕵️ המרגלים ניצחו!')
                            : (spyNames.length === 1 ? '✅ המרגל נתפס!' : '✅ כל המרגלים נתפסו!')}
                        </Text>
                        <Text style={styles.resultDescription}>
                          {spyWon 
                            ? (spyNames.length === 1 
                                ? 'המרגל הצליח להישאר בחשאי!' 
                                : 'לפחות אחד מהמרגלים הצליח להישאר בחשאי!')
                            : (spyNames.length === 1
                                ? 'השחקנים הצליחו לזהות את המרגל!'
                                : 'השחקנים הצליחו לזהות את כל המרגלים!')}
                        </Text>
                      </View>

                      {/* Drinking Section - Only show if drinking mode is enabled */}
                      {room.drinking_mode && (
                        <View style={styles.drinkingSection}>
                          <Text style={styles.drinkingSectionIcon}>🍺</Text>
                          <Text style={styles.drinkingSectionTitle}>זמן שתייה!</Text>
                          <Text style={styles.drinkingSectionMessage}>
                            {spyWon 
                              ? (spyNames.length === 1 
                                  ? 'המרגל ניצח – כל השחקנים האחרים חייבת לשתות 🍺'
                                  : 'המרגלים ניצחו – כל השחקנים האחרים חייבת לשתות 🍺')
                              : (spyNames.length === 1
                                  ? 'המרגל נתפס – המרגל חייבת לשתות 🍺'
                                  : 'כל המרגלים נתפסו – כל המרגלים חייבת לשתות 🍺')}
                          </Text>
                        </View>
                      )}
                      
                      {voteCounts
                        .sort((a, b) => b.votes - a.votes)
                        .map(({ player, votes, wasSpy }, idx) => (
                          <View
                            key={idx}
                            style={[styles.voteResultRow, wasSpy && styles.voteResultRowSpy]}
                          >
                            <View style={styles.voteResultLeft}>
                              <Text style={styles.voteResultName}>{player.name}</Text>
                              {wasSpy && (
                                <View style={styles.spyBadge}>
                                  <Text style={styles.spyBadgeText}>המרגל!</Text>
                                </View>
                              )}
                            </View>
                            <View style={styles.voteCountBadgeResult}>
                              <Text style={styles.voteCountTextResult}>
                                {votes} {votes === 1 ? 'הצבעה' : 'הצבעות'}
                              </Text>
                            </View>
                          </View>
                        ))}
                    </>
                  );
                })()}
          </View>
        </View>

            <View style={styles.finishedActions}>
              <GradientButton
                title="משחק חדש"
                onPress={resetGame}
                variant="spy"
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
                style={styles.exitButton}
              />
            </View>
          </View>
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
    color: '#7ED957', // Spy theme color
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
    backgroundColor: '#7ED957', // Spy theme color
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
    backgroundColor: '#D1FAE5',
    borderWidth: 1,
    borderColor: '#10B981',
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
  greetingCard: {
    backgroundColor: '#D1FAE5',
    borderWidth: 1,
    borderColor: '#10B981',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  greetingText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
  },
  playersSection: {
    gap: 12,
  },
  playersTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
  playersList: {
    gap: 12,
    paddingVertical: 4,
  },
  playerCard: {
    minWidth: 120,
    backgroundColor: '#F9FAFB',
    borderWidth: 2,
    borderColor: '#10B981',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  playerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#7ED957', // Spy theme color
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
  warningCard: {
    backgroundColor: 'rgba(126, 217, 87, 0.15)', // Spy theme color with transparency
    borderWidth: 1,
    borderColor: '#7ED957', // Spy theme color
    borderRadius: 12,
    padding: 12,
  },
  warningText: {
    fontSize: 14,
    color: '#7ED957', // Spy theme color
    textAlign: 'center',
  },
  gameContainer: {
    gap: 16,
  },
  gameMain: {
    gap: 16,
  },
  gameMainSpy: {
    // Additional styling for spy layout if needed
  },
  timerCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  timerCardUrgent: {
    backgroundColor: '#FEE2E2',
  },
  timerIcon: {
    fontSize: 32,
  },
  timerText: {
    fontSize: 48,
    fontWeight: '700',
    color: '#7ED957', // Spy theme color
  },
  timerTextUrgent: {
    color: '#DC2626',
  },
  playerInfoCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  playerInfoHeader: {
    backgroundColor: '#7ED957', // Spy theme color
    padding: 16,
    alignItems: 'center',
  },
  playerInfoHeaderSpy: {
    backgroundColor: '#DC2626',
  },
  playerInfoTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  playerInfoContent: {
    padding: 20,
  },
  spyInfo: {
    alignItems: 'center',
    gap: 12,
  },
  spyEmoji: {
    fontSize: 48,
  },
  spyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#DC2626',
  },
  spyDescription: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  spyTip: {
    backgroundColor: '#F3E8FF',
    borderWidth: 1,
    borderColor: '#A78BFA',
    borderRadius: 12,
    padding: 12,
    width: '100%',
  },
  spyTipTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B21A8',
    marginBottom: 4,
  },
  spyTipText: {
    fontSize: 12,
    color: '#374151',
  },
  regularInfo: {
    gap: 16,
  },
  locationCard: {
    backgroundColor: '#D1FAE5',
    borderWidth: 2,
    borderColor: '#10B981',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  locationLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 8,
  },
  locationText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#7ED957', // Spy theme color
  },
  roleCard: {
    backgroundColor: '#DBEAFE',
    borderWidth: 2,
    borderColor: '#3B82F6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  roleLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 8,
  },
  roleText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#3B82F6',
  },
  regularTip: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderRadius: 12,
    padding: 12,
  },
  regularTipTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 4,
  },
  regularTipText: {
    fontSize: 12,
    color: '#374151',
  },
  votingCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  votingHeader: {
    backgroundColor: '#F97316',
    padding: 16,
    alignItems: 'center',
  },
  votingTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  votingSubtitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 4,
    opacity: 0.9,
  },
  votingContent: {
    padding: 16,
    gap: 16,
  },
  votingPlayersList: {
    gap: 12,
    paddingVertical: 4,
  },
  votingPlayerCard: {
    minWidth: 100,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  votingPlayerCardSelected: {
    backgroundColor: '#FED7AA',
    borderColor: '#F97316',
    shadowColor: '#F97316',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  votingPlayerCardDisabled: {
    backgroundColor: '#F3F4F6',
    borderColor: '#9CA3AF',
    opacity: 0.6,
  },
  votingPlayerName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },
  voteCountBadge: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  voteCountText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  myVoteBadge: {
    backgroundColor: '#F97316',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  myVoteText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  votingInfo: {
    backgroundColor: '#DBEAFE',
    borderWidth: 1,
    borderColor: '#3B82F6',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  votingInfoText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E40AF',
  },
  votingInfoSubtext: {
    fontSize: 12,
    color: '#3B82F6',
  },
  votingProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  votingProgressText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E40AF',
  },
  votingProgressLabel: {
    fontSize: 12,
    color: '#3B82F6',
  },
  endButton: {
    marginTop: 8,
  },
  locationsCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  locationsHeader: {
    backgroundColor: '#7C3AED',
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  locationsTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  locationsToggleIcon: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  locationsList: {
    maxHeight: 300,
    padding: 12,
  },
  locationItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#C084FC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  locationItemEliminated: {
    backgroundColor: '#F3F4F6',
    borderColor: '#9CA3AF',
  },
  locationItemText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
  },
  locationItemTextEliminated: {
    color: '#9CA3AF',
    textDecorationLine: 'line-through',
  },
  eliminatedIcon: {
    color: '#EF4444',
    fontSize: 18,
  },
  finishedCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 24,
    padding: 24,
    gap: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
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
  finishedContent: {
    gap: 16,
  },
  spyRevealCard: {
    backgroundColor: '#FEE2E2',
    borderWidth: 2,
    borderColor: '#EF4444',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  spyRevealLabel: {
    fontSize: 18,
    color: '#374151',
    marginBottom: 8,
  },
  spyRevealName: {
    fontSize: 32,
    fontWeight: '700',
    color: '#DC2626',
  },
  locationRevealCard: {
    backgroundColor: '#D1FAE5',
    borderWidth: 2,
    borderColor: '#10B981',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  locationRevealLabel: {
    fontSize: 18,
    color: '#374151',
    marginBottom: 8,
  },
  locationRevealName: {
    fontSize: 32,
    fontWeight: '700',
    color: '#7ED957', // Spy theme color
  },
  votingResultsCard: {
    backgroundColor: '#DBEAFE',
    borderWidth: 2,
    borderColor: '#3B82F6',
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  votingResultsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
  },
  resultCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  resultCardSpyWon: {
    backgroundColor: '#FEE2E2',
    borderWidth: 2,
    borderColor: '#EF4444',
  },
  resultCardSpyCaught: {
    backgroundColor: 'rgba(126, 217, 87, 0.15)', // Spy theme color with transparency
    borderWidth: 2,
    borderColor: '#7ED957', // Spy theme color
  },
  resultTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  resultDescription: {
    fontSize: 16,
    color: '#374151',
    textAlign: 'center',
  },
  voteResultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  voteResultRowSpy: {
    backgroundColor: '#FEE2E2',
    borderWidth: 2,
    borderColor: '#EF4444',
  },
  voteResultLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  voteResultName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
  },
  spyBadge: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  spyBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  voteCountBadgeResult: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  voteCountTextResult: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
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
  spiesSelectionContainer: {
    marginTop: 12,
    gap: 8,
  },
  spiesSelectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  spiesButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  spyCountButton: {
    minWidth: 50,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  spyCountButtonSelected: {
    backgroundColor: '#7ED957', // Spy theme color
    borderColor: '#7ED957',
  },
  spyCountButtonDisabled: {
    opacity: 0.4,
    backgroundColor: '#F3F4F6',
  },
  spyCountButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  spyCountButtonTextSelected: {
    color: '#FFFFFF',
  },
  spyCountButtonTextDisabled: {
    color: '#9CA3AF',
  },
  spiesSelectionHint: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  spiesInfoBadge: {
    backgroundColor: 'rgba(126, 217, 87, 0.2)', // Spy theme color with transparency
    borderWidth: 2,
    borderColor: '#7ED957', // Spy theme color
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  spiesInfoText: {
    fontSize: 14,
    color: '#374151',
    textAlign: 'center',
    fontWeight: '600',
  },
  gameModeSelectionContainer: {
    marginTop: 12,
    gap: 8,
  },
  gameModeSelectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  gameModeButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  gameModeButton: {
    flex: 1,
    minWidth: 100,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gameModeButtonSelected: {
    backgroundColor: '#7ED957', // Spy theme color
    borderColor: '#7ED957',
  },
  gameModeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  gameModeButtonTextSelected: {
    color: '#FFFFFF',
  },
  gameModeSelectionHint: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  gameModeInfoBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)', // Blue with transparency
    borderWidth: 2,
    borderColor: '#3B82F6',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  gameModeInfoText: {
    fontSize: 14,
    color: '#374151',
    textAlign: 'center',
    fontWeight: '600',
  },
  spyGuessCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    marginBottom: 16,
  },
  spyGuessHeader: {
    backgroundColor: '#DC2626',
    padding: 16,
    alignItems: 'center',
  },
  spyGuessTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  spyGuessContent: {
    padding: 20,
    gap: 16,
  },
  spyGuessDescription: {
    fontSize: 14,
    color: '#374151',
    textAlign: 'center',
    lineHeight: 20,
  },
  spyGuessInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#DC2626',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#1F2937',
    textAlign: 'right',
  },
  spyGuessButton: {
    marginTop: 8,
  },
  spyGuessSubmittedCard: {
    backgroundColor: '#D1FAE5',
    borderWidth: 2,
    borderColor: '#10B981',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  spyGuessSubmittedText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  spyGuessResultCard: {
    backgroundColor: '#FEE2E2',
    borderWidth: 2,
    borderColor: '#EF4444',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  spyGuessResultCardCorrect: {
    backgroundColor: '#D1FAE5',
    borderWidth: 2,
    borderColor: '#10B981',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  spyGuessResultLabel: {
    fontSize: 16,
    color: '#374151',
    fontWeight: '600',
  },
  spyGuessResultText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
  },
  spyGuessResultStatus: {
    fontSize: 16,
    fontWeight: '600',
    color: '#DC2626',
    marginTop: 8,
  },
  spyGuessResultStatusCorrect: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10B981',
    marginTop: 8,
  },
  drinkingSection: {
    backgroundColor: '#FFF7ED',
    borderWidth: 2,
    borderColor: '#F97316',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginTop: 16,
    gap: 8,
  },
  drinkingSectionIcon: {
    fontSize: 48,
    marginBottom: 4,
  },
  drinkingSectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  drinkingSectionMessage: {
    fontSize: 18,
    color: '#374151',
    textAlign: 'center',
    lineHeight: 24,
  },
});
