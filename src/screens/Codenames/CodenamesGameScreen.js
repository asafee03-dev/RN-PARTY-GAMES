import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Modal, Clipboard } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { db, waitForFirestoreReady } from '../../firebase';
import { doc, getDoc, updateDoc, onSnapshot, query, collection, where, getDocs } from 'firebase/firestore';
import CodenamesBoard from '../../components/codenames/CodenamesBoard';
import ClueInput from '../../components/codenames/ClueInput';
import TeamInfo from '../../components/codenames/TeamInfo';
import RivalsTimer from '../../components/codenames/RivalsTimer';
import TeamWordsPanel from '../../components/codenames/TeamWordsPanel';
import storage from '../../utils/storage';
import { saveCurrentRoom, loadCurrentRoom, clearCurrentRoom } from '../../utils/navigationState';

export default function CodenamesGameScreen({ navigation, route }) {
  const roomCode = route?.params?.roomCode || '';
  const [room, setRoom] = useState(null);
  const [currentPlayerName, setCurrentPlayerName] = useState('');
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showTeamWords, setShowTeamWords] = useState(false);
  const unsubscribeRef = useRef(null);

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
        
        // If game returned to setup, navigate back to setup
        if (updatedRoom.game_status === 'setup') {
          navigation.navigate('CodenamesSetup', { 
            roomCode, 
            gameMode: updatedRoom.game_mode || 'friends' 
          });
          return;
        }
        
        setRoom(prevRoom => {
          if (!prevRoom) {
            return updatedRoom;
          }
          
          // Prevent state updates that could change board/key_map during active game
          if (prevRoom.game_status === 'playing' && updatedRoom.game_status === 'playing') {
            const criticalFieldsChanged = 
              JSON.stringify(prevRoom.board_words) !== JSON.stringify(updatedRoom.board_words) ||
              JSON.stringify(prevRoom.key_map) !== JSON.stringify(updatedRoom.key_map) ||
              prevRoom.starting_team !== updatedRoom.starting_team;
            
            if (criticalFieldsChanged) {
              console.warn('⚠️ Blocked critical game state change during active game');
              return prevRoom;
            }
          }
          
          if (JSON.stringify(prevRoom) !== JSON.stringify(updatedRoom)) {
            return updatedRoom;
          }
          return prevRoom;
        });
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

    const updates = {
      current_clue: { number },
      guesses_remaining: number + 1,
      turn_start_time: Date.now()
    };

    if (room.game_mode === 'rivals') {
      updates.turn_phase = 'guess';
    }

    try {
      const roomRef = doc(db, 'CodenamesRoom', room.id);
      await updateDoc(roomRef, updates);
      console.log('✅ Clue submitted successfully');
      setRoom(prev => ({ ...prev, ...updates }));
    } catch (error) {
      console.error('❌ Error submitting clue:', error);
      return;
    }
  };

  const handleWordClick = async (index) => {
    if (!room) return;
    
    const playerRole = getPlayerRole();
    if (!playerRole || playerRole.role === 'spymaster') return;
    if (!isMyTurn()) return;
    
    console.log('🎯 Word clicked:', index);

    const currentTeam = room.current_turn;
    const wordColor = room.key_map[index];
    
    // Don't add word if already revealed
    const alreadyRevealed = [...room.red_team.revealed_words, ...room.blue_team.revealed_words].includes(index);
    if (alreadyRevealed) {
      console.log('⚠️ Word already revealed, skipping');
      return;
    }
    
    const updatedRedRevealed = [...room.red_team.revealed_words];
    const updatedBlueRevealed = [...room.blue_team.revealed_words];

    // Add word to revealed list based on its actual color
    if (wordColor === 'red') {
      updatedRedRevealed.push(index);
    } else if (wordColor === 'blue') {
      updatedBlueRevealed.push(index);
    } else if (wordColor === 'neutral') {
      // Neutral word - add to both teams so everyone sees it
      updatedRedRevealed.push(index);
      updatedBlueRevealed.push(index);
    } else if (wordColor === 'black') {
      // Black word - add to both teams so everyone sees it
      updatedRedRevealed.push(index);
      updatedBlueRevealed.push(index);
    }

    let gameStatus = room.game_status;
    let winnerTeam = room.winner_team;
    let switchTurn = false;
    let newGuessesRemaining = room.guesses_remaining - 1;

    if (wordColor === 'black') {
      gameStatus = 'finished';
      winnerTeam = currentTeam === 'red' ? 'blue' : 'red';
      console.log('💀 Black word clicked! Winner:', winnerTeam);
    } else if (wordColor === currentTeam) {
      // Check if team has finished all their words
      const currentTeamRevealed = currentTeam === 'red' ? updatedRedRevealed : updatedBlueRevealed;
      
      // Count total team words in key map
      let totalTeamWords = 0;
      room.key_map.forEach((color) => {
        if (color === currentTeam) totalTeamWords++;
      });
      
      // Count revealed team words
      let revealedTeamWords = 0;
      currentTeamRevealed.forEach((revealedIndex) => {
        if (room.key_map[revealedIndex] === currentTeam) {
          revealedTeamWords++;
        }
      });
      
      // Team wins if they revealed all their words
      if (revealedTeamWords >= totalTeamWords) {
        gameStatus = 'finished';
        winnerTeam = currentTeam;
        console.log('🏆 Team won! Winner:', winnerTeam, 'Revealed team words:', revealedTeamWords, 'Total team words:', totalTeamWords);
      }
    } else if (wordColor !== currentTeam) {
      switchTurn = true;
      console.log('❌ Wrong color, switching turn');
    }

    if (newGuessesRemaining <= 0 || switchTurn) {
      switchTurn = true;
    }

    // Check win condition after update
    const allRevealedAfterUpdate = [...updatedRedRevealed, ...updatedBlueRevealed];
    
    // Count words left for each team after update
    let redWordsLeft = 0;
    let blueWordsLeft = 0;
    
    room.key_map.forEach((color, idx) => {
      if (color === 'red' && !allRevealedAfterUpdate.includes(idx)) {
        redWordsLeft++;
      }
      if (color === 'blue' && !allRevealedAfterUpdate.includes(idx)) {
        blueWordsLeft++;
      }
    });
    
    // If a team reached 0 words, game ends
    if (redWordsLeft === 0 && gameStatus !== 'finished') {
      gameStatus = 'finished';
      winnerTeam = 'red';
      console.log('🏆 Red team won! All words revealed (0 words left)');
    } else if (blueWordsLeft === 0 && gameStatus !== 'finished') {
      gameStatus = 'finished';
      winnerTeam = 'blue';
      console.log('🏆 Blue team won! All words revealed (0 words left)');
    }

    const updates = {
      red_team: { ...room.red_team, revealed_words: updatedRedRevealed },
      blue_team: { ...room.blue_team, revealed_words: updatedBlueRevealed },
      game_status: gameStatus,
      guesses_remaining: switchTurn || gameStatus === 'finished' ? 0 : newGuessesRemaining
    };

    if (winnerTeam) {
      updates.winner_team = winnerTeam;
    }

    if (switchTurn && gameStatus !== 'finished') {
      updates.current_turn = currentTeam === 'red' ? 'blue' : 'red';
      updates.current_clue = null;
      updates.guesses_remaining = 0;
      
      if (room.game_mode === 'rivals') {
        updates.turn_phase = 'clue';
        updates.turn_start_time = Date.now();
      }
    }

    if (!room || !room.id) {
      console.error('❌ Cannot process word click: room or room.id is missing');
      return;
    }
    
    console.log('🔵 Processing word click, updating room:', room.id);
    try {
      const roomRef = doc(db, 'CodenamesRoom', room.id);
      await updateDoc(roomRef, updates);
      console.log('✅ Word click processed successfully');
      setRoom(prev => ({ ...prev, ...updates }));
    } catch (error) {
      console.error('❌ Error processing word click:', error);
      return;
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

    // Reload room to ensure we have the latest state
    try {
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
        console.error('❌ Error fetching current room state');
        return;
      }
      
      const currentRoom = { id: snapshot.id, ...snapshot.data() };

      // Double-check it's still our turn
      if (currentRoom.current_turn !== playerRole.team) {
        console.log('⚠️ Turn changed before end turn could be processed');
        setRoom(currentRoom);
        return;
      }

      const currentTeam = currentRoom.current_turn;
      if (currentTeam !== 'red' && currentTeam !== 'blue') {
        console.error('❌ Invalid current team:', currentTeam);
        return;
      }
      
      const nextTeam = currentTeam === 'red' ? 'blue' : 'red';

      const updates = {
        current_turn: nextTeam,
        current_clue: null,
        guesses_remaining: 0
      };

      if (currentRoom.game_mode === 'rivals') {
        updates.turn_phase = 'clue';
        updates.turn_start_time = Date.now();
      }

      // Save old baseline for drinking mode
      const drinkingMode = await storage.getItem('drinkingMode') === 'true';
      const oldBaseline = drinkingMode && currentRoom.round_baseline_reveals 
        ? { ...currentRoom.round_baseline_reveals } 
        : null;

      console.log('🔵 Ending turn, switching from', currentTeam, 'to', nextTeam, 'room:', currentRoom.id);
      
      try {
        const roomRef = doc(db, 'CodenamesRoom', currentRoom.id);
        const currentSnapshot = await getDoc(roomRef);
        if (currentSnapshot.exists()) {
          const currentData = currentSnapshot.data();
          if (currentData.current_turn !== currentTeam) {
            console.log('⚠️ Turn changed before update could be processed');
            setRoom({ id: currentSnapshot.id, ...currentData });
            return;
          }
        }
        
        await updateDoc(roomRef, updates);
        const updatedSnapshot = await getDoc(roomRef);
        if (updatedSnapshot.exists()) {
          const updatedRoom = { id: updatedSnapshot.id, ...updatedSnapshot.data() };
          
          if (updatedRoom.current_turn !== nextTeam) {
            console.error('❌ Turn did not switch correctly. Expected:', nextTeam, 'Got:', updatedRoom.current_turn);
            await updateDoc(roomRef, { current_turn: nextTeam, current_clue: null, guesses_remaining: 0 });
            const finalSnapshot = await getDoc(roomRef);
            if (finalSnapshot.exists()) {
              setRoom({ id: finalSnapshot.id, ...finalSnapshot.data() });
            }
            return;
          }
          
          console.log('✅ Turn ended successfully, switched to', updatedRoom.current_turn);
          setRoom(updatedRoom);
        }
      } catch (error) {
        console.error('❌ Error ending turn:', error);
        try {
          const roomRef = doc(db, 'CodenamesRoom', roomCode);
          const snapshot = await getDoc(roomRef);
          if (snapshot.exists()) {
            setRoom({ id: snapshot.id, ...snapshot.data() });
          }
        } catch (reloadError) {
          console.error('❌ Error reloading room:', reloadError);
        }
        return;
      }

      // Check drinking mode - if both teams finished turn (back to starting team)
      if (drinkingMode && nextTeam === currentRoom.starting_team && oldBaseline) {
        setTimeout(async () => {
          try {
            const roomRef = doc(db, 'CodenamesRoom', roomCode);
            const snapshot = await getDoc(roomRef);
            
            if (snapshot.exists()) {
              const roomForPopup = { id: snapshot.id, ...snapshot.data() };
              const currentRed = roomForPopup.red_team.revealed_words.length;
              const currentBlue = roomForPopup.blue_team.revealed_words.length;
          
              const redRevealedInRound = currentRed - oldBaseline.red;
              const blueRevealedInRound = currentBlue - oldBaseline.blue;
              
              let drinkingTeam = null;
              if (redRevealedInRound < blueRevealedInRound) {
                drinkingTeam = 'red';
              } else if (blueRevealedInRound < redRevealedInRound) {
                drinkingTeam = 'blue';
              }
              
              if (drinkingTeam) {
                try {
                  const roomRef = doc(db, 'CodenamesRoom', roomForPopup.id);
                  await updateDoc(roomRef, {
                    drinking_popup: { team: drinkingTeam }
                  });
                } catch (error) {
                  console.error('❌ Error updating drinking popup:', error);
                }
              }
              
              // Save new baseline for next round
              try {
                const roomRef = doc(db, 'CodenamesRoom', roomForPopup.id);
                await updateDoc(roomRef, {
                  round_baseline_reveals: {
                    red: currentRed,
                    blue: currentBlue
                  }
                });
              } catch (error) {
                console.error('❌ Error updating baseline:', error);
              }
            }
          } catch (error) {
            console.error('❌ Error in drinking popup check:', error);
          }
        }, 500);
      } else if (drinkingMode && nextTeam === currentRoom.starting_team && !oldBaseline) {
        // If no baseline (start of game) - save baseline now
        setTimeout(async () => {
          try {
            const roomRef = doc(db, 'CodenamesRoom', roomCode);
            const snapshot = await getDoc(roomRef);
            
            if (snapshot.exists()) {
              const roomForBaseline = { id: snapshot.id, ...snapshot.data() };
              await updateDoc(roomRef, {
                round_baseline_reveals: {
                  red: roomForBaseline.red_team.revealed_words.length,
                  blue: roomForBaseline.blue_team.revealed_words.length
                }
              });
            }
          } catch (error) {
            console.error('❌ Error updating baseline:', error);
          }
        }, 500);
      }
    } catch (error) {
      console.error('❌ Error fetching current room state:', error);
      return;
    }
  };

  const copyRoomCode = () => {
    Clipboard.setString(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const goBack = async () => {
    navigation.navigate('CodenamesHome');
  };

  const resetGame = async () => {
    if (!room || !room.id) return;
    
    const resetRedTeam = {
      ...room.red_team,
      revealed_words: []
    };
    const resetBlueTeam = {
      ...room.blue_team,
      revealed_words: []
    };
    
    try {
      const roomRef = doc(db, 'CodenamesRoom', room.id);
      await updateDoc(roomRef, {
        red_team: resetRedTeam,
        blue_team: resetBlueTeam,
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
        round_baseline_reveals: null
      });
      console.log('✅ Game reset successfully - all state cleared');
      
      navigation.navigate('CodenamesSetup', { 
        roomCode, 
        gameMode: room.game_mode || 'friends' 
      });
    } catch (error) {
      console.error('❌ Error resetting game:', error);
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
      <LinearGradient colors={['#3B82F6', '#06B6D4', '#14B8A6']} style={styles.errorContainer}>
        <Text style={styles.errorTitle}>שגיאה בטעינת המשחק</Text>
        <Text style={styles.errorMessage}>לא הצלחנו לטעון את משחק שם טוב</Text>
        <TouchableOpacity style={styles.errorButton} onPress={() => navigation.navigate('CodenamesHome')}>
          <Text style={styles.errorButtonText}>חזרה למסך הבית</Text>
        </TouchableOpacity>
      </LinearGradient>
    );
  }

  if (isLoading || !room) {
    return (
      <LinearGradient colors={['#3B82F6', '#06B6D4', '#14B8A6']} style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFFFFF" />
        <Text style={styles.loadingText}>טוען משחק שם טוב...</Text>
      </LinearGradient>
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

  return (
    <LinearGradient colors={['#3B82F6', '#06B6D4', '#14B8A6']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>← יציאה</Text>
          </TouchableOpacity>

          <View style={styles.headerRight}>
            {room.drinking_popup !== null && (
              <View style={styles.drinkingBadge}>
                <Text style={styles.drinkingBadgeText}>🍺 מצב שתייה</Text>
              </View>
            )}
            
            <View style={styles.roomCodeContainer}>
              <Text style={styles.roomCodeLabel}>קוד:</Text>
              <View style={styles.roomCodeBadge}>
                <Text style={styles.roomCodeText}>{roomCode}</Text>
              </View>
              <TouchableOpacity onPress={copyRoomCode} style={styles.copyButton}>
                <Text style={styles.copyButtonText}>{copied ? '✓' : '📋'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Drinking Mode Popup */}
        {room.drinking_popup && (
          <Modal
            visible={true}
            transparent={true}
            animationType="fade"
            onRequestClose={clearDrinkingPopup}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.modalIcon}>🍺</Text>
                <Text style={styles.modalTitle}>זמן שתייה!</Text>
                <Text style={styles.modalMessage}>
                  הקבוצה ה{room.drinking_popup.team === 'red' ? 'אדומה' : 'כחולה'} - חשפתם פחות מילים בסבב
                </Text>
                <Text style={styles.modalEmoji}>🍻</Text>
                <Text style={styles.modalSubtitle}>קחו שוט! 🥃</Text>
                <TouchableOpacity
                  style={styles.modalButton}
                  onPress={clearDrinkingPopup}
                >
                  <Text style={styles.modalButtonText}>המשך</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}

        {/* Winner Modal */}
        {room.game_status === 'finished' && (
          <Modal
            visible={true}
            transparent={true}
            animationType="fade"
            onRequestClose={() => {}}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.winnerIcon}>🏆</Text>
                <Text style={styles.winnerTitle}>
                  {room.winner_team === 'red' ? '🔴 הקבוצה האדומה' : '🔵 הקבוצה הכחולה'}
                </Text>
                <Text style={styles.winnerSubtitle}>ניצחה! 🎉</Text>
                <View style={styles.winnerButtons}>
                  <TouchableOpacity
                    style={styles.winnerButton}
                    onPress={resetGame}
                  >
                    <Text style={styles.winnerButtonText}>משחק חדש</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.winnerButton, styles.winnerButtonOutline]}
                    onPress={goBack}
                  >
                    <Text style={[styles.winnerButtonText, styles.winnerButtonTextOutline]}>יציאה</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}

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
          <View style={styles.teamWordsSection}>
            <TouchableOpacity
              style={styles.toggleButton}
              onPress={() => setShowTeamWords(!showTeamWords)}
            >
              <Text style={styles.toggleButtonText}>
                {showTeamWords ? '▲ סגור רשימת מילות הקבוצה' : '▼ הצג רשימת מילות הקבוצה'}
              </Text>
            </TouchableOpacity>

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
        <View style={styles.statusCard}>
          {isMyTurn() ? (
            <View style={styles.statusContent}>
              <View style={styles.myTurnBadge}>
                <Text style={styles.myTurnText}>🎮 התור שלך!</Text>
              </View>
              <Text style={styles.statusText}>
                {isSpymaster ? 'תן רמז לקבוצה' : room.current_clue?.number ? 'נחש מילים' : 'ממתין לרמז'}
              </Text>
            </View>
          ) : (
            <View style={styles.statusContent}>
              <View style={[styles.turnDot, { backgroundColor: room.current_turn === 'red' ? '#EF4444' : '#3B82F6' }]} />
              <Text style={styles.statusText}>
                התור של הקבוצה ה{room.current_turn === 'red' ? 'אדומה' : 'כחולה'}
              </Text>
            </View>
          )}
        </View>

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
          <View style={styles.guessCard}>
            <Text style={styles.guessText}>
              👆 לחץ על מילה כדי לגלות את הצבע האמיתי שלה
            </Text>
            <Text style={styles.guessSubtext}>
              נשארו {room.guesses_remaining} ניחושים | ⚠️ ניחוש שגוי = מעבר תור
            </Text>
            <TouchableOpacity
              style={styles.endTurnButton}
              onPress={handleEndTurn}
            >
              <Text style={styles.endTurnButtonText}>סיימתי את התור</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Board */}
        <View style={styles.boardContainer}>
          <CodenamesBoard
            words={room.board_words}
            keyMap={room.key_map}
            revealedIndices={getRevealedIndices()}
            isSpymaster={isSpymaster}
            onWordClick={handleWordClick}
            canGuess={canGuess}
            currentTeam={room.current_turn}
          />
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 20,
    marginTop: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  errorMessage: {
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 24,
  },
  errorButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  errorButtonText: {
    color: '#3B82F6',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  drinkingBadge: {
    backgroundColor: '#F97316',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
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
    borderRadius: 12,
    padding: 8,
    gap: 6,
  },
  roomCodeLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  roomCodeBadge: {
    backgroundColor: '#2563EB',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  roomCodeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  copyButton: {
    padding: 4,
  },
  copyButtonText: {
    fontSize: 14,
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
    padding: 32,
    width: '100%',
    maxWidth: 500,
    alignItems: 'center',
    gap: 16,
  },
  modalIcon: {
    fontSize: 64,
  },
  modalTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#F97316',
  },
  modalMessage: {
    fontSize: 20,
    color: '#374151',
    textAlign: 'center',
  },
  modalEmoji: {
    fontSize: 48,
  },
  modalSubtitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F97316',
  },
  modalButton: {
    backgroundColor: '#F97316',
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 16,
    width: '100%',
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  winnerIcon: {
    fontSize: 96,
  },
  winnerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 8,
  },
  winnerSubtitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 24,
  },
  winnerButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  winnerButton: {
    flex: 1,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    padding: 16,
  },
  winnerButtonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#2563EB',
  },
  winnerButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  winnerButtonTextOutline: {
    color: '#2563EB',
  },
  teamWordsSection: {
    marginBottom: 12,
    gap: 8,
  },
  toggleButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#A78BFA',
    borderRadius: 12,
    padding: 12,
  },
  toggleButtonText: {
    fontSize: 14,
    color: '#6B21A8',
    textAlign: 'center',
  },
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  statusContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  myTurnBadge: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  myTurnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  turnDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  guessCard: {
    backgroundColor: '#DBEAFE',
    borderWidth: 2,
    borderColor: '#3B82F6',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    gap: 8,
  },
  guessText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E40AF',
  },
  guessSubtext: {
    fontSize: 12,
    color: '#2563EB',
  },
  endTurnButton: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
  },
  endTurnButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  boardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 8,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
});
