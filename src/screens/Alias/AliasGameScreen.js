import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator } from 'react-native';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';
import Timer from '../../components/shared/Timer';
import { db } from '../../firebase';
import { doc, getDoc, updateDoc, onSnapshot, collection, getDocs } from 'firebase/firestore';
import { generateCards, freezeWordOnTimeUp } from '../../logic/alias';

// Storage helper
const storage = {
  async getItem(key) {
    return null;
  }
};

const TEAM_COLORS = ["#EF4444", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899"];

export default function AliasGameScreen({ navigation, route }) {
  const roomCode = route?.params?.roomCode || '';
  const [room, setRoom] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [wordCardsDB, setWordCardsDB] = useState([]);
  const [cards, setCards] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeIsUp, setTimeIsUp] = useState(false);
  const [timerKey, setTimerKey] = useState(0);
  const unsubscribeRef = useRef(null);

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
      Alert.alert('שגיאה', 'קוד חדר חסר');
      navigation.goBack();
      return;
    }

    initializeRoom();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [roomCode]);

  // Redirect to setup if game is still in setup phase
  useEffect(() => {
    if (room && room.game_status === 'setup') {
      navigation.replace('AliasSetup', { roomCode });
      return;
    }
  }, [room?.game_status, roomCode, navigation]);

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
        Alert.alert('שגיאה', 'החדר לא נמצא');
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
    const roomRef = doc(db, 'GameRoom', roomCode);
    
    unsubscribeRef.current = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const roomData = { id: snapshot.id, ...snapshot.data() };
        
        // Handle state updates
        setRoom(prevRoom => {
          // Restore timeIsUp if last_word_on_time_up exists
          if (!prevRoom && roomData.round_active && roomData.last_word_on_time_up) {
            setTimeIsUp(true);
          }
          
          // Reset timer when new round starts
          if (!prevRoom?.round_active && roomData.round_active) {
            setTimerKey(prev => prev + 1);
            setTimeIsUp(false);
          }
          
          // Restore timeIsUp if last_word_on_time_up is set during active round
          if (roomData.round_active && roomData.last_word_on_time_up && !timeIsUp) {
            setTimeIsUp(true);
          }
          
          // Reset timeIsUp when round ends
          if (prevRoom?.round_active && !roomData.round_active) {
            setTimeIsUp(false);
          }
          
          return roomData;
        });
      } else {
        Alert.alert('שגיאה', 'החדר נמחק');
        navigation.goBack();
      }
    }, (error) => {
      console.error('Error in realtime listener:', error);
    });
  };

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
      
      const roomSnapshot = await getDoc(roomRef);
      if (!roomSnapshot.exists()) {
        Alert.alert('שגיאה', 'החדר נמחק. אנא צא מהחדר וחזור.');
        navigation.navigate('AliasHome');
        return;
      }
      
      const updates = {
        round_active: true,
        game_status: 'playing',
        current_round_score: 0,
        round_start_time: Date.now(),
        round_start_position: currentTeamPosition,
        used_cards: [],
        show_round_summary: false,
        last_word_on_time_up: null,
        current_word_is_golden: false
      };
      await updateDoc(roomRef, updates);
      
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

  const handleTimeUp = async () => {
    if (!room || !room.round_active) return;

    // Freeze the current word
    const currentCardIndex = room.used_cards?.length || 0;
    let wordToFreeze = null;
    
    if (cards[currentCardIndex]) {
      wordToFreeze = cards[currentCardIndex];
    } else if (room.last_word_on_time_up) {
      wordToFreeze = room.last_word_on_time_up;
    }

    if (wordToFreeze && room.id) {
      try {
        const roomRef = doc(db, 'GameRoom', room.id);
        await updateDoc(roomRef, { 
          last_word_on_time_up: wordToFreeze 
        });
        console.log('✅ [TIMER] Word frozen in Firestore:', wordToFreeze);
        setTimeIsUp(true);
      } catch (error) {
        console.error('❌ Error freezing last word:', error);
        setTimeIsUp(true);
      }
    } else {
      setTimeIsUp(true);
    }
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
      const currentCard = {
        word: wordToUse,
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
        const roomSnapshot = await getDoc(roomRef);
        if (!roomSnapshot.exists()) {
          Alert.alert('שגיאה', 'החדר נמחק. אנא צא מהחדר וחזור.');
          navigation.navigate('AliasHome');
          return;
        }

        await updateDoc(roomRef, {
          teams: updatedTeams,
          used_cards: updatedUsedCards,
          current_round_score: updatedUsedCards.filter(c => c.status === 'correct').length,
          game_status: gameStatus,
          winner_team: winnerTeam,
          current_word_is_golden: isNextSquareGolden
        });
      } catch (error) {
        console.error('❌ Error updating room:', error);
      }
      return;
    }

    // Time up case
    if (timeIsUp) {
      const wordToUse = room.last_word_on_time_up || cards[currentCardIndex];
      const currentCard = {
        word: wordToUse,
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
        const roomSnapshot = await getDoc(roomRef);
        if (!roomSnapshot.exists()) {
          Alert.alert('שגיאה', 'החדר נמחק. אנא צא מהחדר וחזור.');
          navigation.navigate('AliasHome');
          return;
        }

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
        console.error('❌ Error updating room:', error);
      }
      return;
    }

    // Normal case - only if it's my turn
    if (!isMyTurn()) {
      return;
    }

    const wordToUse = cards[currentCardIndex];
    const currentCard = {
      word: wordToUse,
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
      const roomSnapshot = await getDoc(roomRef);
      if (!roomSnapshot.exists()) {
        Alert.alert('שגיאה', 'החדר נמחק. אנא צא מהחדר וחזור.');
        navigation.navigate('AliasHome');
        return;
      }

      await updateDoc(roomRef, {
        current_round_score: updatedUsedCards.filter(c => c.status === 'correct').length,
        teams: updatedTeams,
        game_status: gameStatus,
        winner_team: winnerTeam,
        used_cards: updatedUsedCards,
        current_word_is_golden: isNextSquareGolden
      });
    } catch (error) {
      console.error('❌ Error updating room:', error);
    }
  };

  const handleSkip = async () => {
    if (!isMyTurn() || !room || !room.round_active || !cards.length) return;

    const currentCardIndex = room.used_cards?.length || 0;

    // Time up case
    if (timeIsUp) {
      const wordToUse = room.last_word_on_time_up || cards[currentCardIndex];
      const currentCard = {
        word: wordToUse,
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
      word: wordToUse,
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

    try {
      const roomRef = doc(db, 'GameRoom', room.id);
      const roomSnapshot = await getDoc(roomRef);
      if (!roomSnapshot.exists()) {
        Alert.alert('שגיאה', 'החדר נמחק. אנא צא מהחדר וחזור.');
        navigation.navigate('AliasHome');
        return;
      }

      await updateDoc(roomRef, {
        current_turn: nextTurn,
        round_active: false,
        show_round_summary: false,
        current_round_score: 0,
        used_cards: [],
        last_word_on_time_up: null,
        current_word_is_golden: false
      });
      
      setTimerKey(prev => prev + 1);
      setTimeIsUp(false);
    } catch (error) {
      console.error('❌ Error finishing round:', error);
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

  const calculateProgress = () => {
    const currentTeam = getCurrentTeam();
    if (!currentTeam) return { startPos: 0, currentPos: 0, moved: 0 };
    
    const startPos = room.round_start_position || currentTeam.position;
    const currentPos = currentTeam.position;
    const moved = currentPos - startPos;
    
    return { startPos, currentPos, moved };
  };

  if (isLoading || !room) {
    return (
      <GradientBackground variant="purple">
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.loadingText}>טוען משחק...</Text>
        </View>
      </GradientBackground>
    );
  }

  // Winner screen
  if (room.game_status === 'finished') {
    return (
      <GradientBackground variant="purple">
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.winnerContainer}>
            <Text style={styles.winnerEmoji}>🎉</Text>
            <Text style={styles.winnerTitle}>{room.winner_team} ניצחה!</Text>
            <Text style={styles.winnerSubtitle}>מזל טוב!</Text>
            
            <GradientButton
              title="חזור ללובי"
              onPress={() => navigation.navigate('AliasHome')}
              variant="primary"
              style={styles.winnerButton}
            />
          </View>
        </ScrollView>
      </GradientBackground>
    );
  }

  // Round summary
  if (room.show_round_summary) {
    const currentTeam = getCurrentTeam();
    const progress = calculateProgress();
    
    return (
      <GradientBackground variant="purple">
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.summaryContainer}>
            <Text style={styles.summaryTitle}>סיכום סיבוב</Text>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTeamName}>{currentTeam?.name}</Text>
              <Text style={styles.summaryScore}>
                {room.current_round_score} מילים נמצאו
              </Text>
              <Text style={styles.summaryPosition}>
                מיקום: {currentTeam?.position}/59
              </Text>
              <Text style={styles.summaryProgress}>
                התקדמות: {progress.moved >= 0 ? '+' : ''}{progress.moved}
              </Text>
            </View>
            
            {isMyTurn() && (
            <GradientButton
              title="הבא →"
                onPress={finishRound}
              variant="green"
              style={styles.nextButton}
            />
            )}
            
            {!isMyTurn() && (
              <Text style={styles.waitingSummaryText}>
                ממתינים ל{currentTeam?.name} לסיים...
              </Text>
            )}
          </View>
        </ScrollView>
      </GradientBackground>
    );
  }

  const currentTeam = getCurrentTeam();
  const progress = calculateProgress();
  const currentCardIndex = room.used_cards?.length || 0;
  const currentWord = cards[currentCardIndex] || room.last_word_on_time_up || '';

  return (
    <GradientBackground variant="purple">
      <ScrollView 
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <GradientButton
            title="← יציאה"
            onPress={() => navigation.navigate('AliasHome')}
            variant="ghost"
            style={styles.backButton}
          />
          <View style={styles.headerInfo}>
            <Text style={styles.roomCodeText}>קוד: {roomCode}</Text>
            <Text style={styles.scoreText}>ניקוד: {room.current_round_score}</Text>
          </View>
        </View>

        {/* Team Info */}
        <View style={styles.teamInfo}>
          <Text style={styles.teamName}>{currentTeam?.name}</Text>
          <View style={styles.progressBar}>
            <View 
              style={[
                styles.progressFill, 
                { width: `${(currentTeam?.position / 59) * 100}%` }
              ]} 
            />
          </View>
          <Text style={styles.progressText}>
            {currentTeam?.position} / 59
          </Text>
        </View>

        {/* Game Content */}
        {room.round_active ? (
          <View style={styles.gameContent}>
            {/* Timer */}
            <View style={styles.timerContainer}>
              <Timer
                key={timerKey}
                initialTime={60}
                onFinish={handleTimeUp}
                paused={!room.round_active}
              />
            </View>

            {/* Time Up Popup */}
            {timeIsUp && isMyTurn() && (
              <View style={styles.timeUpContainer}>
                <Text style={styles.timeUpTitle}>הזמן נגמר!</Text>
                <Text style={styles.timeUpText}>בחר מי ניחש את המילה האחרונה:</Text>
                <View style={styles.teamButtonsContainer}>
                  {room.teams.map((team, index) => (
                    <GradientButton
                      key={index}
                      title={team.name}
                      onPress={() => handleCorrect(index)}
                      variant={index === room.current_turn ? 'primary' : 'blue'}
                      style={styles.teamButton}
                    />
                  ))}
                  <GradientButton
                    title="דלג"
                    onPress={handleSkip}
                    variant="red"
                    style={styles.teamButton}
                  />
                </View>
              </View>
            )}

            {/* Golden Word Popup */}
            {room.current_word_is_golden && !isMyTurn() && !timeIsUp && (
              <View style={styles.goldenPopup}>
                <Text style={styles.goldenText}>✨ מילה זהב! ✨</Text>
                <Text style={styles.goldenSubtext}>כל הקבוצות יכולות לנחש!</Text>
              </View>
            )}

        {/* Word Card */}
            {!timeIsUp && (
        <View style={[
          styles.wordCard,
                room.current_word_is_golden && styles.wordCardGolden
        ]}>
                {room.current_word_is_golden && (
            <View style={styles.goldenBadge}>
                    <Text style={styles.goldenBadgeText}>✨ זהב ✨</Text>
            </View>
          )}
          <Text style={[
            styles.wordText,
                  room.current_word_is_golden && styles.wordTextGolden
          ]}>
                  {currentWord}
          </Text>
          <Text style={styles.cardNumber}>
                  מילה {currentCardIndex + 1}
          </Text>
        </View>
            )}

            {/* Frozen Word (Time Up) */}
            {timeIsUp && !isMyTurn() && (
              <View style={styles.wordCard}>
                <Text style={styles.wordText}>{room.last_word_on_time_up || currentWord}</Text>
                <Text style={styles.frozenText}>מילה קפואה</Text>
              </View>
            )}

        {/* Action Buttons */}
            {isMyTurn() && !timeIsUp && (
          <View style={styles.actionsContainer}>
            <GradientButton
              title="נכון ✓"
                  onPress={() => handleCorrect()}
              variant="green"
              style={styles.actionButton}
            />
            <GradientButton
              title="דלג"
              onPress={handleSkip}
              variant="red"
              style={styles.actionButton}
            />
          </View>
        )}

            {/* Golden Word - All Teams Can Guess */}
            {room.current_word_is_golden && !isMyTurn() && !timeIsUp && (
              <View style={styles.goldenActionsContainer}>
                <Text style={styles.goldenActionTitle}>בחר מי ניחש:</Text>
                {room.teams.map((team, index) => (
                  <GradientButton
                    key={index}
                    title={team.name}
                    onPress={() => handleCorrect(index)}
                    variant="primary"
                    style={styles.goldenTeamButton}
                  />
                ))}
              </View>
            )}

            {/* Waiting Message */}
            {!isMyTurn() && !room.current_word_is_golden && !timeIsUp && (
          <View style={styles.waitingContainer}>
            <Text style={styles.waitingText}>
                  {currentTeam?.name} משחקת כעת
                </Text>
                <Text style={styles.waitingSubtext}>
                  ממתינים עד שהתור שלהם יסתיים...
                </Text>
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
                  variant="primary"
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
    marginBottom: 20,
  },
  backButton: {
    alignSelf: 'flex-start',
  },
  headerInfo: {
    alignItems: 'flex-end',
  },
  roomCodeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  scoreText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 4,
  },
  teamInfo: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  teamName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
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
    backgroundColor: '#4CAF50',
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
    color: '#F44336',
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
    borderRadius: 24,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 300,
    marginVertical: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    position: 'relative',
  },
  wordCardGolden: {
    backgroundColor: '#FFD700',
  },
  goldenBadge: {
    position: 'absolute',
    top: 16,
    backgroundColor: '#FFA000',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  goldenBadgeText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
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
    color: '#F44336',
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
  },
  goldenActionsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginTop: 20,
  },
  goldenActionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 16,
    textAlign: 'center',
  },
  goldenTeamButton: {
    width: '100%',
    marginBottom: 12,
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
    color: '#9C27B0',
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
    color: '#4CAF50',
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
    color: '#9C27B0',
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
  winnerButton: {
    width: '100%',
    maxWidth: 300,
  },
});
