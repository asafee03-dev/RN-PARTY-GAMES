import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator, Dimensions, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';
import AliasTimer from '../../components/alias/AliasTimer';
import GameBoard from '../../components/alias/GameBoard';
import TimeUpPopup from '../../components/alias/TimeUpPopup';
import GoldenWordPopup from '../../components/alias/GoldenWordPopup';
import GoldenRoundCard from '../../components/alias/GoldenRoundCard';
import RoundSummary from '../../components/alias/RoundSummary';
import DrinkingPopup from '../../components/alias/DrinkingPopup';
import UnifiedTopBar from '../../components/shared/UnifiedTopBar';
import RulesModal from '../../components/shared/RulesModal';
import { db } from '../../firebase';
import { doc, getDoc, updateDoc, onSnapshot, collection, getDocs } from 'firebase/firestore';
import { generateCards } from '../../logic/alias';
import storage from '../../utils/storage';
import { saveCurrentRoom, loadCurrentRoom, clearCurrentRoom } from '../../utils/navigationState';
import { setupGameEndDeletion, setupAllAutoDeletions } from '../../utils/roomManagement';
import { showInterstitialIfAvailable } from '../../utils/interstitialAd';

const TEAM_COLORS = ["#EF4444", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899"];

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
  const [drinkingMode, setDrinkingMode] = useState(false);
  const [showDrinkingPopup, setShowDrinkingPopup] = useState(false);
  const [drinkingTeamName, setDrinkingTeamName] = useState('');
  const previousTurnRef = useRef(null); // Track previous turn to detect full round completion
  const unsubscribeRef = useRef(null);
  const autoDeletionCleanupRef = useRef({ cancelGameEnd: () => {}, cancelEmptyRoom: () => {}, cancelAge: () => {} });
  const lastResetTriggerRef = useRef(null); // Track last reset trigger to show ad once per reset

  useEffect(() => {
    const loadPlayerName = async () => {
      try {
        const savedName = await storage.getItem('playerName');
        if (savedName) {
          setPlayerName(savedName);
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

  useEffect(() => {
    if (!roomCode) {
      Alert.alert('שגיאה', 'קוד חדר חסר');
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

  // Restore cards when round is active after refresh
  useEffect(() => {
    if (room?.round_active && cards.length === 0 && wordCardsDB.length >= 200) {
      console.log('🔵 [RESTORE] Round is active but cards are missing - regenerating');
      const shuffled = [...wordCardsDB].sort(() => Math.random() - 0.5);
      const selectedWords = shuffled.slice(0, 200);
      setCards(selectedWords);
      console.log('✅ [RESTORE] Cards restored for active round');
    }
  }, [room?.round_active, cards.length, wordCardsDB.length]);

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
      Alert.alert('שגיאה', 'לא הצלחנו לטעון את החדר');
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
        Alert.alert('שגיאה', 'החדר לא נמצא');
        navigation.goBack();
        return;
      }

      const roomData = { id: roomSnap.id, ...roomSnap.data() };
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
        
        // Sync drinking mode from room data
        if (roomData.drinking_mode !== undefined) {
          setDrinkingMode(roomData.drinking_mode);
          // Also sync to local storage
          storage.setItem('drinkingMode', roomData.drinking_mode.toString()).catch(() => {});
        }
        
        // Handle drinking popup from room data
        if (roomData.drinking_popup && roomData.drinking_popup.team_name) {
          setDrinkingTeamName(roomData.drinking_popup.team_name);
          setShowDrinkingPopup(true);
        } else if (roomData.drinking_popup === null && showDrinkingPopup) {
          // Popup was cleared
          setShowDrinkingPopup(false);
        }
        
        // Handle reset trigger for showing ad to all players (non-host)
        if (roomData.reset_triggered_at && 
            roomData.reset_triggered_at !== lastResetTriggerRef.current &&
            roomData.game_status === 'setup' &&
            roomData.host_name !== playerName) {
          lastResetTriggerRef.current = roomData.reset_triggered_at;
          // Show ad to non-host players when host resets
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
          
          // Prevent automatic turn changes during active round without summary
          // This ensures turns only change after the summary is properly shown
          if (prevRoom?.round_active && !prevRoom?.show_round_summary && prevRoom?.current_turn !== roomData?.current_turn) {
            console.warn('⚠️ Preventing automatic turn change during active round - must show summary first');
            return prevRoom;
          }
          
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
        Alert.alert('שגיאה', 'החדר נמחק');
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
      const cardsSnapshot = await getDocs(collection(db, 'WordCard'));
      const cards = [];
      cardsSnapshot.forEach((doc) => {
        cards.push({ id: doc.id, ...doc.data() });
      });
      
      if (cards && cards.length > 0) {
        const words = cards
          .filter(c => c.word && typeof c.word === 'string' && c.word.trim().length > 0)
          .map(c => c.word.trim());
        
        setWordCardsDB(words);
      }
    } catch (error) {
      console.error('Error loading word cards:', error);
    }
  };

  const startRound = async () => {
    if (!isMyTurn()) {
      Alert.alert('שגיאה', 'רק הקבוצה שתורה יכולה להתחיל סבב!');
      return;
    }

    if (!wordCardsDB || wordCardsDB.length < 200) {
      Alert.alert('שגיאה', '❌ אין מספיק מילים במאגר! נדרשות לפחות 200 מילים.');
      return;
    }

    const selectedWords = generateCards(wordCardsDB, 200, 1);
    setCards(selectedWords);
    
    if (!room || !room.id) {
      console.error('❌ Cannot start round: room or room.id is missing');
      return;
    }
    
    setTimerKey(prev => prev + 1);
    setTimeIsUp(false);
    
    const currentTeamPosition = room.teams[room.current_turn].position;
    
    try {
      const roomRef = doc(db, 'GameRoom', room.id);
      
      // Store round_start_position for the current team in the team object as well
      const updatedTeams = [...room.teams];
      if (updatedTeams[room.current_turn]) {
        updatedTeams[room.current_turn] = {
          ...updatedTeams[room.current_turn],
          round_start_position: currentTeamPosition
        };
      }
      
      const updates = {
        round_active: true,
        game_status: 'playing',
        current_round_score: 0,
        round_start_time: Date.now(),
        round_start_position: currentTeamPosition,
        teams: updatedTeams,
        used_cards: [],
        show_round_summary: false,
        last_word_on_time_up: null,
        current_word_is_golden: false
      };
      
      // Try update first - if room doesn't exist, updateDoc will throw
      try {
        await updateDoc(roomRef, updates);
        
        // Log analytics event (only once when game first starts)
        if (room.game_status !== 'playing') {
          const { logGameStart } = await import('../../utils/analytics');
          logGameStart('alias', room.id);
        }
      } catch (error) {
        if (error.code === 'not-found') {
          Alert.alert('שגיאה', 'החדר נמחק. אנא צא מהחדר וחזור.');
          navigation.navigate('AliasHome');
          return;
        }
        throw error; // Re-throw other errors
      }
      
      console.log('✅ Round started successfully');
    } catch (error) {
      console.error('❌ Error starting round:', error);
      if (error.code === 'not-found') {
        Alert.alert('שגיאה', 'החדר נמחק במהלך הפעולה. אנא צא מהחדר וחזור.');
        navigation.navigate('AliasHome');
        return;
      }
      Alert.alert('שגיאה', 'שגיאה בהתחלת הסבב. נסה שוב.');
    }
  };

  const handleTimeUpWrapper = async () => {
    // CRITICAL: Freeze the word IMMEDIATELY when timer hits zero
    // This must happen synchronously before any async operations or state updates
    // Match the old version's exact logic
    
    if (!room || !room.round_active) return;
    
    // Check if word is already frozen (prevents double-freezing)
    if (room.last_word_on_time_up) {
      console.log('🔵 [TIMER] Word already frozen, using existing:', room.last_word_on_time_up);
      setTimeIsUp(true);
      return;
    }
    
    // CRITICAL: Calculate word synchronously using captured state
    // This ensures we get the exact word that was on screen when timer expired
    const currentCardIndex = room.used_cards?.length || 0;
    let wordToFreeze = null;
    
    if (cards[currentCardIndex]) {
      // For single-word cards, just use the word directly
      wordToFreeze = typeof cards[currentCardIndex] === 'string' 
        ? cards[currentCardIndex] 
        : (Array.isArray(cards[currentCardIndex]) ? cards[currentCardIndex][0] : String(cards[currentCardIndex]));
      console.log('🔵 [TIMER] Freezing word at index', currentCardIndex, 'word:', wordToFreeze);
    }
    
    // Immediately update the database with the frozen word BEFORE setting timeIsUp
    // This ensures the word is locked in Firestore before any other state changes
    if (wordToFreeze && room.id) {
      try {
        // Use direct Firestore update for maximum speed and reliability
        const roomRef = doc(db, 'GameRoom', room.id);
        await updateDoc(roomRef, { last_word_on_time_up: wordToFreeze });
        console.log('✅ [TIMER] Word frozen in Firestore as string:', wordToFreeze);
      } catch (error) {
        console.error('❌ Error freezing last word:', error);
        // If update fails, still set local state so UI works
      }
    }
    
    // Now set timeIsUp state
    setTimeIsUp(true);
  };

  const handleCorrect = async (teamIndex = null) => {
    if (!room || !room.round_active || !cards.length) return;

    const currentCardIndex = room.used_cards?.length || 0;
    const currentTeamIndex = teamIndex !== null ? teamIndex : room.current_turn;
    const currentTeam = room.teams[currentTeamIndex];
    
    if (!currentTeam) {
      console.error('❌ handleCorrect: Invalid teamIndex');
      return;
    }

    // Golden word - any team can guess
    if (room.current_word_is_golden && !timeIsUp) {
      const wordToUse = cards[currentCardIndex];
      // For single-word cards, store as string in words field (matching old version structure)
      const currentCard = {
        words: typeof wordToUse === 'string' ? wordToUse : (Array.isArray(wordToUse) ? wordToUse[0] : String(wordToUse)),
        status: 'correct',
        cardNumber: currentCardIndex + 1,
        isLastWord: false,
        isGoldenWord: true,
        teamThatGuessed: currentTeamIndex
      };

      const updatedUsedCards = [...(room.used_cards || []), currentCard];
      const updatedTeams = [...room.teams];
      updatedTeams[currentTeamIndex].position = Math.min(59, updatedTeams[currentTeamIndex].position + 1);

      let gameStatus = room.game_status;
      let winnerTeam = room.winner_team || null;

      if (updatedTeams[currentTeamIndex].position >= 59) {
        gameStatus = 'finished';
        winnerTeam = updatedTeams[currentTeamIndex].name;
      }

      const isNextSquareGolden = room.golden_rounds_enabled && room.golden_squares?.includes(updatedTeams[currentTeamIndex].position);

      try {
        const roomRef = doc(db, 'GameRoom', room.id);
        
        // Try update first - if room doesn't exist, updateDoc will throw
        try {
          await updateDoc(roomRef, {
            teams: updatedTeams,
            used_cards: updatedUsedCards,
            current_round_score: updatedUsedCards.filter(c => c.status === 'correct').length,
            game_status: gameStatus,
            winner_team: winnerTeam,
            current_word_is_golden: isNextSquareGolden
          });
        } catch (error) {
          if (error.code === 'not-found') {
            Alert.alert('שגיאה', 'החדר נמחק. אנא צא מהחדר וחזור.');
            navigation.navigate('AliasHome');
            return;
          }
          throw error; // Re-throw other errors
        }
      } catch (error) {
        console.error('❌ Error updating room:', error);
      }
      return;
    }

    // Time up case
    if (timeIsUp) {
      // CRITICAL: Always use the frozen word from Firestore - never recalculate
      // The word was frozen at the exact moment the timer expired
      let wordToUse = room.last_word_on_time_up;
      if (!wordToUse) {
        // If word is not frozen, this is an error state - log and use fallback
        console.error('⚠️ [TIMER] last_word_on_time_up is missing but timeIsUp is true - using fallback');
        wordToUse = cards[currentCardIndex];
      }
      // Ensure words is always a string for single-word cards
      const wordsString = typeof wordToUse === 'string' ? wordToUse : (Array.isArray(wordToUse) ? wordToUse[0] : String(wordToUse));
      
      const currentCard = {
        words: wordsString,
        status: 'correct',
        cardNumber: currentCardIndex + 1,
        isLastWord: true,
        teamThatGuessed: currentTeamIndex
      };

      const updatedUsedCards = [...(room.used_cards || []), currentCard];
      const updatedTeams = [...room.teams];
      updatedTeams[currentTeamIndex].position = Math.min(59, updatedTeams[currentTeamIndex].position + 1);

      let gameStatus = room.game_status;
      let winnerTeam = room.winner_team || null;

      if (updatedTeams[currentTeamIndex].position >= 59) {
        gameStatus = 'finished';
        winnerTeam = updatedTeams[currentTeamIndex].name;
      }

      setTimeIsUp(false);

      try {
        const roomRef = doc(db, 'GameRoom', room.id);
        
        // Try update first - if room doesn't exist, updateDoc will throw
        try {
          await updateDoc(roomRef, {
            teams: updatedTeams,
            used_cards: updatedUsedCards,
            current_round_score: updatedUsedCards.filter(c => c.status === 'correct').length,
            game_status: gameStatus,
            winner_team: winnerTeam,
            show_round_summary: true,
            round_active: false
          });
        } catch (error) {
          if (error.code === 'not-found') {
            Alert.alert('שגיאה', 'החדר נמחק. אנא צא מהחדר וחזור.');
            navigation.navigate('AliasHome');
            return;
          }
          throw error; // Re-throw other errors
        }
      } catch (error) {
        console.error('❌ Error updating room:', error);
      }
      return;
    }

    // Normal case - only if it's my turn
    if (!isMyTurn()) {
      return;
    }

    const wordToUse = cards[currentCardIndex];
    // For single-word cards, store as string in words field
    const currentCard = {
      words: typeof wordToUse === 'string' ? wordToUse : (Array.isArray(wordToUse) ? wordToUse[0] : String(wordToUse)),
      status: 'correct',
      cardNumber: currentCardIndex + 1,
      isLastWord: false,
      isGoldenWord: false
    };

    const updatedUsedCards = [...(room.used_cards || []), currentCard];
    const updatedTeams = [...room.teams];
    const updatedCurrentTeam = updatedTeams[room.current_turn];
    updatedCurrentTeam.position = Math.min(59, updatedCurrentTeam.position + 1);

    let gameStatus = room.game_status;
    let winnerTeam = room.winner_team || null;

    if (updatedCurrentTeam.position >= 59) {
      gameStatus = 'finished';
      winnerTeam = updatedCurrentTeam.name;
    }

    const isNextSquareGolden = room.golden_rounds_enabled && room.golden_squares?.includes(updatedCurrentTeam.position);

    try {
      const roomRef = doc(db, 'GameRoom', room.id);
      
      // Try update first - if room doesn't exist, updateDoc will throw
      try {
        await updateDoc(roomRef, {
          current_round_score: updatedUsedCards.filter(c => c.status === 'correct').length,
          teams: updatedTeams,
          game_status: gameStatus,
          winner_team: winnerTeam,
          used_cards: updatedUsedCards,
          current_word_is_golden: isNextSquareGolden
        });
      } catch (error) {
        if (error.code === 'not-found') {
          Alert.alert('שגיאה', 'החדר נמחק. אנא צא מהחדר וחזור.');
          navigation.navigate('AliasHome');
          return;
        }
        throw error; // Re-throw other errors
      }
    } catch (error) {
      console.error('❌ Error updating room:', error);
    }
  };

  const handleSkip = async () => {
    if (!isMyTurn() || !room || !room.round_active || !cards.length) return;

    // Don't allow skipping golden words
    if (room.current_word_is_golden) {
      return;
    }

    const currentCardIndex = room.used_cards?.length || 0;

    // Time up case
    if (timeIsUp) {
      // CRITICAL: Always use the frozen word from Firestore - never recalculate
      let wordToUse = room.last_word_on_time_up;
      if (!wordToUse) {
        console.error('⚠️ [TIMER] last_word_on_time_up is missing but timeIsUp is true - using fallback');
        wordToUse = cards[currentCardIndex];
      }
      const wordsString = typeof wordToUse === 'string' ? wordToUse : (Array.isArray(wordToUse) ? wordToUse[0] : String(wordToUse));
      
      const currentCard = {
        words: wordsString,
        status: 'skipped',
        cardNumber: currentCardIndex + 1,
        isLastWord: true,
        teamThatGuessed: null
      };

      const updatedUsedCards = [...(room.used_cards || []), currentCard];
      const updatedTeams = [...room.teams];
      const currentTeam = updatedTeams[room.current_turn];
      currentTeam.position = Math.max(0, currentTeam.position - 1);

      try {
        const roomRef = doc(db, 'GameRoom', room.id);
        const roomSnapshot = await getDoc(roomRef);
        if (!roomSnapshot.exists()) {
          Alert.alert('שגיאה', 'החדר נמחק. אנא צא מהחדר וחזור.');
          navigation.navigate('AliasHome');
          return;
        }

        await updateDoc(roomRef, {
          teams: updatedTeams,
          used_cards: updatedUsedCards,
          show_round_summary: true,
          round_active: false
        });
        setTimeIsUp(false);
      } catch (error) {
        console.error('❌ Error updating room:', error);
      }
      return;
    }

    // Normal case
    const wordToUse = cards[currentCardIndex];
    const currentCard = {
      words: typeof wordToUse === 'string' ? wordToUse : (Array.isArray(wordToUse) ? wordToUse[0] : String(wordToUse)),
      status: 'skipped',
      cardNumber: currentCardIndex + 1,
      isLastWord: false
    };

    const updatedUsedCards = [...(room.used_cards || []), currentCard];
    const updatedTeams = [...room.teams];
    const currentTeam = updatedTeams[room.current_turn];
    currentTeam.position = Math.max(0, currentTeam.position - 1);

    try {
      const roomRef = doc(db, 'GameRoom', room.id);
      const roomSnapshot = await getDoc(roomRef);
      if (!roomSnapshot.exists()) {
        Alert.alert('שגיאה', 'החדר נמחק. אנא צא מהחדר וחזור.');
        navigation.navigate('AliasHome');
        return;
      }

      await updateDoc(roomRef, {
        current_round_score: updatedUsedCards.filter(c => c.status === 'correct').length,
        teams: updatedTeams,
        used_cards: updatedUsedCards
      });
    } catch (error) {
      console.error('❌ Error updating room:', error);
    }
  };

  const finishRound = async () => {
    if (!room || !room.show_round_summary) return;

    const nextTurn = (room.current_turn + 1) % room.teams.length;
    const numTeams = room.teams.length;
    const isFullRoundComplete = nextTurn === 0; // Full round completed when cycling back to team 0

    try {
      const roomRef = doc(db, 'GameRoom', room.id);
      const roomSnapshot = await getDoc(roomRef);
      if (!roomSnapshot.exists()) {
        Alert.alert('שגיאה', 'החדר נמחק. אנא צא מהחדר וחזור.');
        navigation.navigate('AliasHome');
        return;
      }

      // Clear round_start_position for the team that just finished their round
      const updatedTeams = [...room.teams];
      if (updatedTeams[room.current_turn]) {
        updatedTeams[room.current_turn] = {
          ...updatedTeams[room.current_turn],
          round_start_position: null // Clear after round ends
        };
      }
      
      await updateDoc(roomRef, {
        current_turn: nextTurn,
        round_active: false,
        show_round_summary: false,
        current_round_score: 0,
        teams: updatedTeams,
        used_cards: [],
        last_word_on_time_up: null,
        current_word_is_golden: false,
        round_start_position: null // Clear room-level round_start_position
      });
      
      // Check for drinking popup if full round completed and drinking mode is on
      if (isFullRoundComplete && room.drinking_mode) {
        // Get fresh room data after update
        const updatedRoomSnap = await getDoc(roomRef);
        if (updatedRoomSnap.exists()) {
          const updatedRoomData = { id: updatedRoomSnap.id, ...updatedRoomSnap.data() };
          handleFullRoundCompletion(updatedRoomData);
        }
      }
      
      setTimerKey(prev => prev + 1);
      setTimeIsUp(false);
    } catch (error) {
      console.error('❌ Error finishing round:', error);
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

    // Show interstitial ad first, then reset game
    showInterstitialIfAvailable(async () => {
      try {
        const roomRef = doc(db, 'GameRoom', room.id);
        const resetTeams = room.teams.map(team => ({
          ...team,
          position: 0
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
          show_round_summary: false,
          last_word_on_time_up: null,
          current_word_is_golden: false,
          winner_team: null,
          drinking_popup: null,
          reset_triggered_at: Date.now() // Signal to other players to show ad
        });
        
        setTimerKey(prev => prev + 1);
        setTimeIsUp(false);
        console.log('✅ Game reset successfully - returning to setup screen');
        
        // Navigate to setup screen after reset
        navigation.replace('AliasSetup', { roomCode });
      } catch (error) {
        console.error('❌ Error resetting game:', error);
        Alert.alert('שגיאה', 'לא הצלחנו לאפס את המשחק. נסה שוב.');
      }
    });
  };

  const toggleCardStatus = async (cardIndex) => {
    if (!room || !room.used_cards) return;
    
    const updatedUsedCards = [...room.used_cards];
    const card = updatedUsedCards[cardIndex];
    
    // אם זה מילה אחרונה או מילה זהב - לא לאפשר toggle פשוט
    if (card.isLastWord || card.isGoldenWord) return;
    
    const newStatus = card.status === 'correct' ? 'skipped' : 'correct';
    updatedUsedCards[cardIndex].status = newStatus;
    
    const updatedTeams = [...room.teams];
    const teamIndexForThisRound = room.current_turn; 
    const currentTeamForThisRound = updatedTeams[teamIndexForThisRound];

    // Restore position based on original status and then apply new status
    if (card.status === 'correct') {
      currentTeamForThisRound.position = Math.max(0, currentTeamForThisRound.position - 1);
    } else {
      currentTeamForThisRound.position = Math.min(59, currentTeamForThisRound.position + 1);
    }

    const correctCount = updatedUsedCards.filter(c => c.status === 'correct' && (!c.isLastWord || c.teamThatGuessed === teamIndexForThisRound)).length;
    
    try {
      const roomRef = doc(db, 'GameRoom', room.id);
      await updateDoc(roomRef, {
        used_cards: updatedUsedCards,
        teams: updatedTeams,
        current_round_score: correctCount
      });
    } catch (error) {
      console.error('❌ Error updating room:', error);
    }
  };

  const handleChangeLastWordTeam = async (cardIndex, newTeamIndex) => {
    if (!room || !room.used_cards) return;
    
    const updatedUsedCards = [...room.used_cards];
    const card = updatedUsedCards[cardIndex];
    
    const updatedTeams = [...room.teams];
    
    // החזר נקודה מהקבוצה הקודמת (אם יש)
    if (card.teamThatGuessed !== null && card.teamThatGuessed !== undefined) {
      updatedTeams[card.teamThatGuessed].position = Math.max(0, updatedTeams[card.teamThatGuessed].position - 1);
    }
    
    // תן נקודה לקבוצה החדשה
    if (newTeamIndex !== null) {
      updatedTeams[newTeamIndex].position = Math.min(59, updatedTeams[newTeamIndex].position + 1);
    }
    
    // עדכן את הקלף
    updatedUsedCards[cardIndex] = {
      ...card,
      status: newTeamIndex !== null ? 'correct' : 'skipped',
      teamThatGuessed: newTeamIndex
    };
    
    const correctCount = updatedUsedCards.filter(c => c.status === 'correct').length;
    
    try {
      const roomRef = doc(db, 'GameRoom', room.id);
      await updateDoc(roomRef, {
        used_cards: updatedUsedCards,
        teams: updatedTeams,
        current_round_score: correctCount
      });
    } catch (error) {
      console.error('❌ Error updating room:', error);
    }
  };

  const handleChangeGoldenRoundTeam = async (cardIndex, newTeamIndex) => {
    if (!room || !room.used_cards) return;
    
    const updatedUsedCards = [...room.used_cards];
    const card = updatedUsedCards[cardIndex];
    
    const updatedTeams = [...room.teams];
    
    // החזר נקודה מהקבוצה הקודמת (אם יש)
    if (card.teamThatGuessed !== null && card.teamThatGuessed !== undefined) {
      updatedTeams[card.teamThatGuessed].position = Math.max(0, updatedTeams[card.teamThatGuessed].position - 1);
    }
    
    // תן נקודה לקבוצה החדשה (או null אם לא ניחשו)
    if (newTeamIndex !== null) {
      updatedTeams[newTeamIndex].position = Math.min(59, updatedTeams[newTeamIndex].position + 1);
    }
    
    // עדכן את הקלף
    updatedUsedCards[cardIndex] = {
      ...card,
      status: newTeamIndex !== null ? 'correct' : 'skipped',
      teamThatGuessed: newTeamIndex
    };
    
    const correctCount = updatedUsedCards.filter(c => c.status === 'correct').length;
    
    try {
      const roomRef = doc(db, 'GameRoom', room.id);
      await updateDoc(roomRef, {
        used_cards: updatedUsedCards,
        teams: updatedTeams,
        current_round_score: correctCount
      });
    } catch (error) {
      console.error('❌ Error updating room:', error);
    }
  };

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

  const handleFullRoundCompletion = (roomData) => {
    // Only show drinking popup if drinking mode is enabled
    if (!roomData.drinking_mode) {
      return;
    }

    // Calculate round progress for all teams
    const teamProgress = roomData.teams.map((team, index) => {
      const currentPos = team.position !== undefined ? team.position : 0;
      const startPos = team.round_start_position !== undefined && team.round_start_position !== null
        ? team.round_start_position
        : currentPos; // If no start position, assume no movement
      const moved = currentPos - startPos;
      return {
        teamIndex: index,
        teamName: team.name || `קבוצה ${index + 1}`,
        moved: moved
      };
    });

    // Find team(s) with fewest tiles advanced
    const minMoved = Math.min(...teamProgress.map(t => t.moved));
    const losingTeams = teamProgress.filter(t => t.moved === minMoved);

    // If tied, choose first team deterministically (by index)
    const losingTeam = losingTeams[0];

    // Show popup for all players if there's a losing team
    if (losingTeam) {
      setDrinkingTeamName(losingTeam.teamName);
      setShowDrinkingPopup(true);
      
      // Store in room data so all players see it
      const roomRef = doc(db, 'GameRoom', roomData.id);
      updateDoc(roomRef, {
        drinking_popup: {
          team_name: losingTeam.teamName,
          team_index: losingTeam.teamIndex,
          timestamp: Date.now()
        }
      }).catch(err => console.error('Error updating drinking popup:', err));
    }
  };

  if (isLoading || !room) {
    return (
      <GradientBackground variant="brightBlue">
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.loadingText}>טוען משחק...</Text>
        </View>
      </GradientBackground>
    );
  }

  // Winner screen
  if (room.game_status === 'finished') {
    const isHost = room.host_name === playerName;
    return (
      <GradientBackground variant="brightBlue">
        <ScrollView contentContainerStyle={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}>
          <View style={styles.winnerContainer}>
            <Text style={styles.winnerEmoji}>🎉</Text>
            <Text style={styles.winnerTitle}>{room.winner_team} ניצחה!</Text>
            <Text style={styles.winnerSubtitle}>מזל טוב!</Text>
            
            <View style={styles.winnerActions}>
              <GradientButton
                title="משחק חדש"
                onPress={resetGame}
                variant="primary"
                style={styles.winnerButton}
                disabled={!isHost}
              />
              {!isHost && (
                <Text style={styles.hostOnlyText}>רק המארח יכול להתחיל משחק חדש</Text>
              )}
              <GradientButton
                title="חזרה לתפריט הראשי"
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
                variant="outline"
                style={styles.winnerButton}
              />
            </View>
          </View>
        </ScrollView>
      </GradientBackground>
    );
  }

  // Round summary
  if (room.show_round_summary) {
    const currentTeam = getCurrentTeam();
    
    return (
      <GradientBackground variant="brightBlue">
        <ScrollView contentContainerStyle={styles.container}>
          <RoundSummary
            room={room}
            currentTeam={currentTeam}
            isMyTurn={isMyTurn()}
            onToggleCardStatus={toggleCardStatus}
            onChangeLastWordTeam={handleChangeLastWordTeam}
            onChangeGoldenRoundTeam={handleChangeGoldenRoundTeam}
            onFinishRound={finishRound}
          />
        </ScrollView>
      </GradientBackground>
    );
  }

  const currentTeam = getCurrentTeam();
  const progress = calculateProgress();
  const currentCardIndex = room.used_cards?.length || 0;
  // Get current word - handle both string and array formats
  let currentWord = '';
  if (timeIsUp && room.last_word_on_time_up) {
    currentWord = room.last_word_on_time_up;
  } else if (cards[currentCardIndex]) {
    currentWord = typeof cards[currentCardIndex] === 'string' 
      ? cards[currentCardIndex] 
      : (Array.isArray(cards[currentCardIndex]) ? cards[currentCardIndex][0] : String(cards[currentCardIndex]));
  }

  return (
    <GradientBackground variant="brightBlue">
      <ScrollView 
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Unified Top Bar */}
        <UnifiedTopBar
          roomCode={roomCode}
          variant="alias"
          drinkingMode={drinkingMode}
          onExit={async () => {
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
          }}
          onRulesPress={() => setShowRulesModal(true)}
        />

        {/* Score Display */}
        <View style={styles.scoreDisplay}>
          <Text style={styles.scoreText}>ניקוד: {room.current_round_score}</Text>
        </View>

        {/* Rules Modal */}
        <RulesModal
          visible={showRulesModal}
          onClose={() => setShowRulesModal(false)}
          variant="alias"
        />

        {/* Drinking Popup */}
        <DrinkingPopup
          visible={showDrinkingPopup}
          onClose={() => {
            setShowDrinkingPopup(false);
            // Clear drinking popup from room data
            if (room && room.id) {
              const roomRef = doc(db, 'GameRoom', room.id);
              updateDoc(roomRef, { drinking_popup: null }).catch(err => 
                console.error('Error clearing drinking popup:', err)
              );
            }
          }}
          teamName={drinkingTeamName}
        />

        {/* Team Info */}
        <View style={styles.teamInfo}>
          <Text style={styles.teamName}>
            {isMyTurn() ? 'התור שלך!' : `התור של ${currentTeam?.name}`}
          </Text>
        </View>

        {/* Game Board */}
        <GameBoard teams={room.teams} goldenSquares={room.golden_squares || []} />

        {/* Game Content */}
        {room.round_active ? (
          <View style={styles.gameContent}>
            {/* Timer - only for playing team */}
            {isMyTurn() && !room.current_word_is_golden && (
              <View style={styles.timerContainer}>
                <AliasTimer
                  key={timerKey}
                  duration={60}
                  startTime={room.round_start_time}
                  onTimeUp={handleTimeUpWrapper}
                  compact={false}
                />
              </View>
            )}

            {/* Progress Info for Playing Team */}
            {isMyTurn() && (
              <View style={styles.playingTeamInfo}>
                <View style={styles.scoreBox}>
                  <Text style={styles.scoreBoxText}>
                    תשובות נכונות: {room.current_round_score}
                  </Text>
                </View>
                <View style={styles.progressBox}>
                  <Text style={styles.progressBoxText}>
                    התקדמות: {progress.moved >= 0 ? '+' : ''}{progress.moved}
                  </Text>
                  <Text style={styles.progressBoxSubtext}>
                    {progress.currentPos + 1}/60
                  </Text>
                </View>
              </View>
            )}

            {/* Time Up Popup - only for playing team */}
            {timeIsUp && isMyTurn() && (
              <TimeUpPopup
                isMyTurn={isMyTurn()}
                room={room}
                onCorrect={handleCorrect}
                onSkip={handleSkip}
              />
            )}

            {/* Golden Word - Show GoldenRoundCard for current player */}
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

            {/* Golden Word Popup for non-playing players - show automatically */}
            {room.current_word_is_golden && !isMyTurn() && !timeIsUp && (
              <GoldenWordPopup 
                visible={true} 
                onClose={() => setShowGoldenPopup(false)} 
              />
            )}

            {/* Regular Word Card - only if not golden word and it's my turn */}
            {!room.current_word_is_golden && !timeIsUp && isMyTurn() && (
              <View style={styles.wordCard}>
                <Text style={styles.wordText}>{currentWord}</Text>
                <Text style={styles.cardNumber}>מילה {currentCardIndex + 1}</Text>
              </View>
            )}

            {/* Frozen Word (Time Up) - removed for non-playing teams */}

            {/* Action Buttons - only for regular words (not golden) */}
            {isMyTurn() && !timeIsUp && !room.current_word_is_golden && (
              <View style={styles.actionsContainer}>
                <Pressable
                  style={[styles.actionButton, styles.correctButton]}
                  onPress={() => handleCorrect()}
                >
                  <Text style={styles.actionButtonText}>נכון ✓</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionButton, styles.skipButton]}
                  onPress={handleSkip}
                >
                  <Text style={styles.actionButtonText}>דלג</Text>
                </Pressable>
              </View>
            )}

            {/* Waiting Message - only show timer if not golden word */}
            {!isMyTurn() && !room.current_word_is_golden && !timeIsUp && (
              <View style={styles.waitingContainer}>
                <AliasTimer
                  duration={60}
                  startTime={room.round_start_time}
                  onTimeUp={() => {}}
                  compact={false}
                />
                <Text style={styles.waitingText}>
                  {currentTeam?.name} משחקת כעת
                </Text>
                <Text style={styles.waitingSubtext}>
                  ממתינים עד שהתור שלהם יסתיים...
                </Text>
                
                {/* ריבוע תשובות נכונות */}
                <View style={styles.scoreBox}>
                  <Text style={styles.scoreBoxText}>
                    תשובות נכונות: {room.current_round_score}
                  </Text>
                </View>

                {/* ריבוע התקדמות */}
                <View style={styles.progressBox}>
                  <Text style={styles.progressBoxText}>
                    התקדמות: {progress.moved >= 0 ? '+' : ''}{progress.moved}
                  </Text>
                  <Text style={styles.progressBoxSubtext}>
                    {progress.currentPos + 1}/60
                  </Text>
                </View>
              </View>
            )}
            
            {/* Waiting Message for Golden Word - show info but no timer (popup handles it) */}
            {!isMyTurn() && room.current_word_is_golden && !timeIsUp && (
              <View style={styles.waitingContainer}>
                <Text style={styles.waitingText}>
                  {currentTeam?.name} משחקת כעת
                </Text>
                <Text style={styles.waitingSubtext}>
                  מילת זהב! גם אתם יכולים לנחש
                </Text>
                
                {/* ריבוע תשובות נכונות */}
                <View style={styles.scoreBox}>
                  <Text style={styles.scoreBoxText}>
                    תשובות נכונות: {room.current_round_score}
                  </Text>
                </View>

                {/* ריבוע התקדמות */}
                <View style={styles.progressBox}>
                  <Text style={styles.progressBoxText}>
                    התקדמות: {progress.moved >= 0 ? '+' : ''}{progress.moved}
                  </Text>
                  <Text style={styles.progressBoxSubtext}>
                    {progress.currentPos + 1}/60
                  </Text>
                </View>
              </View>
            )}
          </View>
        ) : (
          /* Waiting for Round Start */
          <View style={styles.waitingRoundContainer}>
            <Text style={styles.waitingRoundTitle}>
              {isMyTurn() ? 'התור שלך!' : `התור של ${currentTeam?.name}`}
            </Text>
            {isMyTurn() ? (
              <>
                <Text style={styles.waitingRoundText}>
                  לחץ על הכפתור להתחיל את הסבב שלך!
                </Text>
                <GradientButton
                  title="צא לדרך!"
                  onPress={startRound}
                  variant="alias"
                  style={styles.startRoundButton}
                />
              </>
            ) : (
              <Text style={styles.waitingRoundText}>
                ממתינים ש-{currentTeam?.name} תלחץ להתחיל...
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 50,
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  backButton: {
    alignSelf: 'flex-start',
  },
  headerInfo: {
    alignItems: 'flex-end',
  },
  scoreDisplay: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  roomCodeText: {
    color: '#4FA8FF', // Alias theme color - כחול בהיר
    fontSize: 14,
    fontWeight: '600',
  },
  scoreText: {
    color: '#4FA8FF', // Alias theme color - כחול בהיר
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 4,
  },
  teamInfo: {
    backgroundColor: 'rgba(79, 168, 255, 0.15)', // Alias theme color with transparency - כחול בהיר
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#4FA8FF',
  },
  teamName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4FA8FF', // Alias theme color - כחול בהיר
    marginBottom: 12,
    textAlign: 'center',
  },
  progressBar: {
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4FA8FF', // Alias theme color
    borderRadius: 10,
  },
  progressText: {
    fontSize: 14,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  gameContent: {
    gap: 20,
  },
  timerContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  timeUpContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
  },
  timeUpTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#4FA8FF', // Alias theme color
    textAlign: 'center',
    marginBottom: 12,
  },
  timeUpText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  teamButtonsContainer: {
    gap: 12,
  },
  teamButton: {
    width: '100%',
  },
  goldenPopup: {
    backgroundColor: '#FFD700',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    alignItems: 'center',
  },
  goldenText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  goldenSubtext: {
    fontSize: 16,
    color: '#FFFFFF',
    marginTop: 8,
  },
  wordCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    width: Math.min(Dimensions.get('window').width - 80, 400),
    height: Math.min(Dimensions.get('window').width - 80, 400),
    marginVertical: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    position: 'relative',
    alignSelf: 'center',
  },
  wordText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#2C3E50',
    textAlign: 'center',
  },
  wordTextGolden: {
    color: '#FFFFFF',
  },
  cardNumber: {
    position: 'absolute',
    bottom: 16,
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  frozenText: {
    fontSize: 14,
    color: '#4FA8FF', // Alias theme color
    fontWeight: '600',
    marginTop: 8,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 20,
  },
  actionButton: {
    flex: 1,
    minWidth: 120,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  correctButton: {
    backgroundColor: '#10B981', // Green
  },
  skipButton: {
    backgroundColor: '#EF4444', // Red
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  playingTeamInfo: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    marginBottom: 8,
  },
  waitingContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    padding: 20,
    marginTop: 20,
    alignItems: 'center',
  },
  waitingText: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '600',
    marginBottom: 8,
  },
  waitingSubtext: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.8,
  },
  waitingRoundContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    marginTop: 40,
  },
  waitingRoundTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#4FA8FF', // Alias theme color
    marginBottom: 16,
    textAlign: 'center',
  },
  waitingRoundText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  startRoundButton: {
    width: '100%',
  },
  summaryContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  summaryTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 32,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    marginBottom: 32,
    minWidth: 300,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  summaryTeamName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 16,
  },
  summaryScore: {
    fontSize: 24,
    color: '#4FA8FF', // Alias theme color
    fontWeight: '700',
    marginBottom: 12,
  },
  summaryPosition: {
    fontSize: 18,
    color: '#666',
    marginBottom: 8,
  },
  summaryProgress: {
    fontSize: 18,
    color: '#4FA8FF', // Alias theme color
    fontWeight: '600',
  },
  nextButton: {
    width: '100%',
    minWidth: 200,
  },
  waitingSummaryText: {
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 16,
  },
  winnerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  winnerEmoji: {
    fontSize: 80,
    marginBottom: 24,
  },
  winnerTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  winnerSubtitle: {
    fontSize: 20,
    color: '#FFFFFF',
    opacity: 0.9,
    marginBottom: 32,
  },
  winnerActions: {
    width: '100%',
    maxWidth: 300,
    gap: 12,
  },
  winnerButton: {
    width: '100%',
  },
  hostOnlyText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
  },
  goldenPopupTrigger: {
    backgroundColor: 'rgba(79, 168, 255, 0.15)', // Alias theme color with transparency
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#4FA8FF', // Alias theme color
  },
  goldenPopupTriggerText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4FA8FF', // Alias theme color
  },
  scoreBox: {
    backgroundColor: 'rgba(79, 168, 255, 0.15)', // Alias theme color with transparency
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    borderWidth: 2,
    borderColor: '#4FA8FF', // Alias theme color
    flex: 1,
  },
  scoreBoxText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4FA8FF', // Alias theme color
    textAlign: 'center',
  },
  progressBox: {
    backgroundColor: 'rgba(79, 168, 255, 0.15)', // Alias theme color with transparency
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    borderWidth: 2,
    borderColor: '#4FA8FF', // Alias theme color
    flex: 1,
  },
  progressBoxText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4FA8FF', // Alias theme color
    textAlign: 'center',
  },
  progressBoxSubtext: {
    fontSize: 14,
    color: '#4FA8FF', // Alias theme color
    textAlign: 'center',
    marginTop: 4,
  },
});
