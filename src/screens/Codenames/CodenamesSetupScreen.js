import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Switch, Clipboard, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GradientButton from '../../components/codenames/GradientButton';
import { db, waitForFirestoreReady } from '../../firebase';
import { doc, getDoc, updateDoc, onSnapshot, query, collection, where, getDocs } from 'firebase/firestore';
import storage from '../../utils/storage';
import { saveCurrentRoom, loadCurrentRoom, clearCurrentRoom } from '../../utils/navigationState';
import { copyRoomLink } from '../../utils/clipboard';

export default function CodenamesSetupScreen({ navigation, route }) {
  const roomCode = route?.params?.roomCode || '';
  const gameMode = route?.params?.gameMode || 'friends';
  const insets = useSafeAreaInsets();
  const [room, setRoom] = useState(null);
  const [currentPlayerName, setCurrentPlayerName] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [copied, setCopied] = useState(false);
  const [drinkingMode, setDrinkingMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const unsubscribeRef = useRef(null);

  // Save room state for reconnection on refresh
  useEffect(() => {
    if (roomCode) {
      saveCurrentRoom('codenames', roomCode, { gameMode });
    }
  }, [roomCode, gameMode]);

  useEffect(() => {
    if (!roomCode) {
      // Try to restore from saved state on refresh
      const restoreRoom = async () => {
        try {
          const savedRoom = await loadCurrentRoom();
          if (savedRoom && savedRoom.gameType === 'codenames' && savedRoom.roomCode) {
            navigation.replace('CodenamesSetup', { 
              roomCode: savedRoom.roomCode,
              gameMode: savedRoom.params?.gameMode || 'friends'
            });
            return;
          } else {
            await clearCurrentRoom();
            navigation.navigate('CodenamesHome');
            return;
          }
        } catch (error) {
          console.warn('⚠️ Error restoring room:', error);
          await clearCurrentRoom();
          navigation.navigate('CodenamesHome');
          return;
        }
      };
      restoreRoom();
      return;
    }

    const initializeRoom = async () => {
      try {
        setIsLoading(true);

        const playerName = await storage.getItem('playerName');
        if (!playerName) {
          navigation.navigate('CodenamesHome');
          return;
        }

        setCurrentPlayerName(playerName);

        const savedMode = await storage.getItem('drinkingMode');
        if (savedMode) {
          setDrinkingMode(savedMode === 'true');
        }

        await loadRoom(playerName);
        setIsLoading(false);
      } catch (err) {
        console.error('Error initializing room:', err);
        setIsLoading(false);
      }
    };

    initializeRoom();
  }, [roomCode, navigation]);

  const loadRoom = async (playerName) => {
    console.log('🔵 Loading Codenames room with code:', roomCode);
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
        console.warn('❌ Room not found with code:', roomCode, '- redirecting to home');
        await clearCurrentRoom();
        navigation.navigate('CodenamesHome');
        return;
      }
      
      const existingRoom = { id: snapshot.id, ...snapshot.data() };
      console.log('✅ Room loaded successfully:', existingRoom.id, 'with code:', existingRoom.room_code);

      // Check if player is already in the room
      const playerInRoom = existingRoom.red_team.spymaster === playerName ||
                           existingRoom.blue_team.spymaster === playerName ||
                           existingRoom.red_team.guessers.includes(playerName) ||
                           existingRoom.blue_team.guessers.includes(playerName) ||
                           existingRoom.host_name === playerName;

      // If game is playing or finished, only allow players already in room to rejoin
      if (existingRoom.game_status === 'playing' || existingRoom.game_status === 'finished') {
        if (playerInRoom) {
          setRoom(existingRoom);
          setIsHost(existingRoom.host_name === playerName);
          if (existingRoom.game_status === 'playing') {
            navigation.navigate('CodenamesGame', { roomCode });
          }
          return;
        } else {
          // Player not in room and game is active - show error
          console.warn('⚠️ Player tried to join game that is already in progress');
          Alert.alert('שגיאה', 'המשחק כבר התחיל. לא ניתן להצטרף כעת.');
          navigation.navigate('CodenamesHome');
          return;
        }
      }

      // Room is in setup phase - allow player to join
      setRoom(existingRoom);
      setIsHost(existingRoom.host_name === playerName);
    } catch (error) {
      console.error('❌ Error loading room:', error);
      navigation.navigate('CodenamesHome');
      return;
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
    unsubscribeRef.current = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const updatedRoom = { id: snapshot.id, ...snapshot.data() };
        setRoom(updatedRoom);
        setIsHost(updatedRoom.host_name === currentPlayerName);
        
        if (updatedRoom.game_status === 'playing') {
          navigation.navigate('CodenamesGame', { roomCode });
        }
      }
    });

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [roomCode, navigation, currentPlayerName]);

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

  const joinTeam = async (team, role) => {
    if (!currentPlayerName || !room) return;

    const updatedRoom = { ...room };

    if (updatedRoom.red_team.spymaster === currentPlayerName) {
      updatedRoom.red_team.spymaster = '';
    }
    if (updatedRoom.blue_team.spymaster === currentPlayerName) {
      updatedRoom.blue_team.spymaster = '';
    }
    updatedRoom.red_team.guessers = updatedRoom.red_team.guessers.filter(p => p !== currentPlayerName);
    updatedRoom.blue_team.guessers = updatedRoom.blue_team.guessers.filter(p => p !== currentPlayerName);

    if (role === 'spymaster') {
      updatedRoom[`${team}_team`].spymaster = currentPlayerName;
    } else {
      if (!updatedRoom[`${team}_team`].guessers.includes(currentPlayerName)) {
        updatedRoom[`${team}_team`].guessers.push(currentPlayerName);
      }
    }

    if (!room || !room.id) {
      console.error('❌ Cannot update room: room or room.id is missing');
      return;
    }
    
    try {
      const roomRef = doc(db, 'CodenamesRoom', room.id);
      await updateDoc(roomRef, updatedRoom);
      setRoom(prev => ({ ...prev, ...updatedRoom }));
    } catch (error) {
      console.error('❌ Error updating room:', error);
      return;
    }
  };

  const getPlayerRole = () => {
    if (!room || !currentPlayerName) return null;

    if (room.red_team.spymaster === currentPlayerName) return { team: 'red', role: 'spymaster' };
    if (room.blue_team.spymaster === currentPlayerName) return { team: 'blue', role: 'spymaster' };
    if (room.red_team.guessers.includes(currentPlayerName)) return { team: 'red', role: 'guesser' };
    if (room.blue_team.guessers.includes(currentPlayerName)) return { team: 'blue', role: 'guesser' };

    return null;
  };

  const canStartGame = () => {
    if (!room) return false;

    const redHasSpymaster = room.red_team.spymaster !== '';
    const blueHasSpymaster = room.blue_team.spymaster !== '';
    const redHasGuessers = room.red_team.guessers.length >= 1;
    const blueHasGuessers = room.blue_team.guessers.length >= 1;

    return redHasSpymaster && blueHasSpymaster && redHasGuessers && blueHasGuessers;
  };

  const getMissingRequirements = () => {
    if (!room) return [];
    const missing = [];
    
    if (!room.red_team.spymaster) missing.push('מרגל לקבוצה אדומה');
    if (!room.blue_team.spymaster) missing.push('מרגל לקבוצה כחולה');
    if (room.red_team.guessers.length < 1) missing.push('לפחות מנחש אחד לקבוצה אדומה');
    if (room.blue_team.guessers.length < 1) missing.push('לפחות מנחש אחד לקבוצה כחולה');
    
    return missing;
  };

  const startGame = async () => {
    if (!isHost) {
      Alert.alert('שגיאה', 'רק המארח יכול להתחיל את המשחק!');
      return;
    }

    if (!canStartGame() && gameMode === 'friends') {
      const missing = getMissingRequirements();
      Alert.alert('לא ניתן להתחיל את המשחק', `חסר:\n${missing.map(m => `• ${m}`).join('\n')}`);
      return;
    }

    try {
      const wordsSnapshot = await getDocs(collection(db, 'WordCard'));
      const allWords = [];
      wordsSnapshot.forEach((doc) => {
        allWords.push({ id: doc.id, ...doc.data() });
      });
      
      if (!allWords || allWords.length < 25) {
        Alert.alert('שגיאה', '❌ אין מספיק מילים במאגר!\n\nנדרשות לפחות 25 מילים.\nאנא פנה למנהל המערכת.');
        return;
      }

      const validWords = allWords
        .filter(card => card.word && typeof card.word === 'string' && card.word.trim().length > 0)
        .map(card => card.word.trim());

      if (validWords.length < 25) {
        Alert.alert('שגיאה', `❌ נמצאו רק ${validWords.length} מילים תקינות במאגר!\n\nנדרשות לפחות 25 מילים.\nאנא פנה למנהל המערכת.`);
        return;
      }

      const shuffled = [...validWords].sort(() => Math.random() - 0.5);
      const selectedWords = shuffled.slice(0, 25);

      // Get fresh room state
      let currentRoom = room;
      try {
        const roomRef = doc(db, 'CodenamesRoom', room.id);
        const snapshot = await getDoc(roomRef);
        if (snapshot.exists()) {
          currentRoom = { id: snapshot.id, ...snapshot.data() };
        }
      } catch (error) {
        console.error('❌ Error fetching fresh room state:', error);
      }

      if (currentRoom.game_status !== 'setup') {
        console.warn('⚠️ Cannot start game - room is not in setup state:', currentRoom.game_status);
        Alert.alert('שגיאה', 'החדר לא מוכן למשחק חדש. אנא לחץ על \'משחק חדש\' תחילה.');
        return;
      }

      const startingTeam = Math.random() > 0.5 ? 'red' : 'blue';
      const keyMap = [];

      for (let i = 0; i < 9; i++) keyMap.push(startingTeam);
      for (let i = 0; i < 8; i++) keyMap.push(startingTeam === 'red' ? 'blue' : 'red');
      for (let i = 0; i < 7; i++) keyMap.push('neutral');
      keyMap.push('black');

      keyMap.sort(() => Math.random() - 0.5);

      if (!currentRoom || !currentRoom.id) {
        console.error('❌ Cannot start game: room or room.id is missing');
        Alert.alert('שגיאה', 'שגיאה: חדר לא נטען כראוי. נסה לרענן את הדף.');
        return;
      }

      console.log('🔵 Starting Codenames game, updating room:', currentRoom.id);
      
      const drinkingModeEnabled = await storage.getItem('drinkingMode') === 'true';
      
      const resetRedTeam = {
        ...currentRoom.red_team,
        revealed_words: []
      };
      const resetBlueTeam = {
        ...currentRoom.blue_team,
        revealed_words: []
      };
      
      const updates = {
        red_team: resetRedTeam,
        blue_team: resetBlueTeam,
        board_words: selectedWords,
        key_map: keyMap,
        starting_team: startingTeam,
        current_turn: startingTeam,
        game_status: 'playing',
        turn_start_time: Date.now(),
        turn_phase: 'clue',
        current_clue: null,
        guesses_remaining: 0,
        winner_team: null,
        drinking_popup: null
      };
      
      if (drinkingModeEnabled) {
        updates.round_baseline_reveals = {
          red: 0,
          blue: 0
        };
      }
      
      try {
        const roomRef = doc(db, 'CodenamesRoom', currentRoom.id);
        await updateDoc(roomRef, updates);
        console.log('✅ Game started successfully with fresh state');
        setRoom(prev => ({ ...prev, ...updates }));
        navigation.navigate('CodenamesGame', { roomCode });
      } catch (error) {
        console.error('❌ Error starting game:', error);
        Alert.alert('שגיאה', 'שגיאה בהתחלת המשחק. נסה שוב.');
        return;
      }
    } catch (error) {
      console.error('❌ Error loading words:', error);
      Alert.alert('שגיאה', '❌ שגיאה בטעינת המילים. נסה שוב.');
      return;
    }
  };

  const copyRoomCode = () => {
    Clipboard.setString(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyRoomLink = async () => {
    await copyRoomLink(roomCode, 'codenames');
  };

  const goBack = () => {
    const parent = navigation.getParent();
    if (parent) {
      parent.reset({
        index: 0,
        routes: [{ name: 'Home' }]
      });
    } else {
      navigation.navigate('Home');
    }
  };

  if (isLoading || !room) {
    return (
      <LinearGradient colors={['#3B82F6', '#06B6D4', '#14B8A6']} style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFFFFF" />
        <Text style={styles.loadingText}>טוען...</Text>
      </LinearGradient>
    );
  }

  const playerRole = getPlayerRole();
  const isRivalsMode = room.game_mode === 'rivals';
  const missingRequirements = getMissingRequirements();
  const canStart = canStartGame();

  return (
    <LinearGradient colors={['#3B82F6', '#06B6D4', '#14B8A6']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top || 0, 8) }]}>
          {/* Centered Room Code */}
          <View style={styles.headerCenter}>
            {isRivalsMode && (
              <View style={styles.rivalsBadge}>
                <Text style={styles.rivalsBadgeText}>⚔️ יריבים</Text>
              </View>
            )}
            <Pressable onPress={copyRoomCode} style={styles.roomCodeContainer}>
              <Text style={styles.roomCodeLabel}>קוד:</Text>
              <Text style={styles.roomCodeText}>{roomCode}</Text>
              <Text style={styles.copyIcon}>{copied ? '✓' : '📋'}</Text>
            </Pressable>
          </View>

          {/* Right side: Copy Link + Exit */}
          <View style={styles.headerRight}>
            <Pressable onPress={handleCopyRoomLink} style={styles.copyLinkButtonCompact}>
              <Text style={styles.copyLinkIcon}>📋</Text>
            </Pressable>
            <GradientButton
              title="יציאה"
              onPress={goBack}
              variant="codenames"
              style={styles.exitButtonHeader}
            />
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>👥 הגדרת קבוצות</Text>
          </View>

          <View style={styles.cardContent}>
            {isHost && (
              <View style={styles.hostInfo}>
                <Text style={styles.hostText}>👑 שלום, {currentPlayerName}! (מארח)</Text>
                <Text style={styles.hostSubtext}>
                  {isRivalsMode
                    ? 'במצב יריבים, השיבוץ יהיה אוטומטי בתחילת המשחק'
                    : 'כל קבוצה צריכה מרגל אחד ולפחות מנחש אחד'}
                </Text>
                <View style={styles.drinkingModeContainer}>
                  <Text style={styles.drinkingModeLabel}>🔞 מצב משחקי שתייה</Text>
                  <Switch 
                    value={drinkingMode} 
                    onValueChange={(checked) => {
                      setDrinkingMode(checked);
                      storage.setItem('drinkingMode', checked.toString());
                    }} 
                  />
                  <Text style={styles.drinkingModeLabel}>🍺</Text>
                </View>
              </View>
            )}

            {!isHost && drinkingMode && (
              <View style={styles.drinkingModeBadge}>
                <Text style={styles.drinkingModeBadgeText}>🍺 מצב שתייה פעיל</Text>
              </View>
            )}

            {!isHost && !drinkingMode && (
              <View style={styles.guestInfo}>
                <Text style={styles.guestText}>שלום, {currentPlayerName}!</Text>
                <Text style={styles.guestSubtext}>
                  {isRivalsMode ? 'ממתין לשיבוץ אוטומטי...' : 'בחר קבוצה ותפקיד'}
                </Text>
              </View>
            )}

            {!isRivalsMode && (
              <View style={styles.teamsContainerSideBySide}>
                {/* Red Team */}
                <View style={styles.teamCardShrunk}>
                  <View style={[styles.teamHeader, styles.redTeamHeader]}>
                    <Text style={styles.teamTitle}>קבוצה אדומה 🔴</Text>
                  </View>
                  <View style={styles.teamContent}>
                    <View style={styles.roleSection}>
                      <Text style={styles.roleLabel}>👁️ מרגל (נותן רמזים)</Text>
                      <View style={styles.roleDisplay}>
                        {room.red_team.spymaster ? (
                          <View style={styles.playerRow}>
                            <Text style={styles.playerName}>{typeof room.red_team.spymaster === 'string' ? room.red_team.spymaster : String(room.red_team.spymaster || '')}</Text>
                            {playerRole?.team === 'red' && playerRole?.role === 'spymaster' && (
                              <View style={styles.youBadge}>
                                <Text style={styles.youBadgeText}>אתה כאן</Text>
                              </View>
                            )}
                          </View>
                        ) : (
                          <Text style={styles.waitingText}>ממתין למרגל...</Text>
                        )}
                      </View>
                      {(!playerRole || playerRole.team !== 'red' || playerRole.role !== 'spymaster') && (
                        <TouchableOpacity
                          style={[styles.joinButton, styles.joinButtonOutline]}
                          onPress={() => joinTeam('red', 'spymaster')}
                          disabled={room.red_team.spymaster !== '' && room.red_team.spymaster !== currentPlayerName}
                        >
                          <Text style={styles.joinButtonText}>הצטרף כמרגל</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    <View style={styles.roleSection}>
                      <Text style={styles.roleLabel}>👥 מנחשים ({room.red_team.guessers.length})</Text>
                      <View style={styles.roleDisplay}>
                        {room.red_team.guessers.length > 0 ? (
                          room.red_team.guessers
                            .filter((player) => player != null)
                            .map((player, idx) => {
                              const playerName = typeof player === 'string' ? player : String(player || '');
                              return (
                                <View key={`red-guesser-${idx}`} style={styles.playerRow}>
                                  <Text style={styles.playerName}>{playerName}</Text>
                                  {playerName === currentPlayerName && (
                                    <View style={styles.youBadge}>
                                      <Text style={styles.youBadgeText}>אתה כאן</Text>
                                    </View>
                                  )}
                                </View>
                              );
                            })
                        ) : (
                          <Text style={styles.waitingText}>ממתין למנחשים...</Text>
                        )}
                      </View>
                      {(!playerRole || playerRole.team !== 'red' || playerRole.role !== 'guesser') && (
                        <TouchableOpacity
                          style={[styles.joinButton, styles.joinButtonOutline]}
                          onPress={() => joinTeam('red', 'guesser')}
                        >
                          <Text style={styles.joinButtonText}>הצטרף כמנחש</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>

                {/* Blue Team */}
                <View style={styles.teamCardShrunk}>
                  <View style={[styles.teamHeader, styles.blueTeamHeader]}>
                    <Text style={styles.teamTitle}>קבוצה כחולה 🔵</Text>
                  </View>
                  <View style={styles.teamContent}>
                    <View style={styles.roleSection}>
                      <Text style={styles.roleLabel}>👁️ מרגל (נותן רמזים)</Text>
                      <View style={styles.roleDisplay}>
                        {room.blue_team.spymaster ? (
                          <View style={styles.playerRow}>
                            <Text style={styles.playerName}>{typeof room.blue_team.spymaster === 'string' ? room.blue_team.spymaster : String(room.blue_team.spymaster || '')}</Text>
                            {playerRole?.team === 'blue' && playerRole?.role === 'spymaster' && (
                              <View style={styles.youBadge}>
                                <Text style={styles.youBadgeText}>אתה כאן</Text>
                              </View>
                            )}
                          </View>
                        ) : (
                          <Text style={styles.waitingText}>ממתין למרגל...</Text>
                        )}
                      </View>
                      {(!playerRole || playerRole.team !== 'blue' || playerRole.role !== 'spymaster') && (
                        <TouchableOpacity
                          style={[styles.joinButton, styles.joinButtonOutline]}
                          onPress={() => joinTeam('blue', 'spymaster')}
                          disabled={room.blue_team.spymaster !== '' && room.blue_team.spymaster !== currentPlayerName}
                        >
                          <Text style={styles.joinButtonText}>הצטרף כמרגל</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    <View style={styles.roleSection}>
                      <Text style={styles.roleLabel}>👥 מנחשים ({room.blue_team.guessers.length})</Text>
                      <View style={styles.roleDisplay}>
                        {room.blue_team.guessers.length > 0 ? (
                          room.blue_team.guessers
                            .filter((player) => player != null)
                            .map((player, idx) => {
                              const playerName = typeof player === 'string' ? player : String(player || '');
                              return (
                                <View key={`blue-guesser-${idx}`} style={styles.playerRow}>
                                  <Text style={styles.playerName}>{playerName}</Text>
                                  {playerName === currentPlayerName && (
                                    <View style={styles.youBadge}>
                                      <Text style={styles.youBadgeText}>אתה כאן</Text>
                                    </View>
                                  )}
                                </View>
                              );
                            })
                        ) : (
                          <Text style={styles.waitingText}>ממתין למנחשים...</Text>
                        )}
                      </View>
                      {(!playerRole || playerRole.team !== 'blue' || playerRole.role !== 'guesser') && (
                        <TouchableOpacity
                          style={[styles.joinButton, styles.joinButtonOutline]}
                          onPress={() => joinTeam('blue', 'guesser')}
                        >
                          <Text style={styles.joinButtonText}>הצטרף כמנחש</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              </View>
            )}

            {isRivalsMode && (
              <View style={styles.rivalsWaiting}>
                <Text style={styles.rivalsIcon}>⚔️</Text>
                <Text style={styles.rivalsTitle}>ממתין לשחקנים...</Text>
                <Text style={styles.rivalsSubtext}>
                  השיבוץ לקבוצות יקרה אוטומטית ברגע שיהיו מספיק שחקנים
                </Text>
              </View>
            )}

            {isHost && (
              <View style={styles.startSection}>
                <TouchableOpacity
                  style={[styles.startButton, !canStart && !isRivalsMode && styles.startButtonDisabled]}
                  onPress={startGame}
                  disabled={!canStart && !isRivalsMode}
                >
                  <Text style={styles.startButtonIcon}>▶️</Text>
                  <Text style={styles.startButtonText}>התחל משחק!</Text>
                </TouchableOpacity>

                {canStart && !isRivalsMode && (
                  <View style={styles.readyBadge}>
                    <View style={styles.readyDot} />
                    <Text style={styles.readyText}>✅ כל התנאים מתקיימים - מוכן להתחלה!</Text>
                  </View>
                )}

                {!canStart && !isRivalsMode && missingRequirements.length > 0 && (
                  <View style={styles.warningBadge}>
                    <Text style={styles.warningIcon}>⚠️</Text>
                    <View style={styles.warningContent}>
                      <Text style={styles.warningTitle}>לא ניתן להתחיל עדיין</Text>
                      <Text style={styles.warningSubtext}>חסר:</Text>
                      {missingRequirements.map((req, idx) => (
                        <Text key={idx} style={styles.warningItem}>• {req}</Text>
                      ))}
                    </View>
                  </View>
                )}

                {isRivalsMode && (
                  <View style={styles.rivalsInfoBadge}>
                    <Text style={styles.rivalsInfoText}>🎮 במצב יריבים - השיבוץ יקרה אוטומטית</Text>
                  </View>
                )}
              </View>
            )}
          </View>
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
  scrollContent: {
    flexGrow: 1,
    padding: 16,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 16,
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
    fontSize: 14,
    color: '#6B7280',
  },
  roomCodeBadge: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  roomCodeText: {
    color: '#2563EB',
    fontSize: 18,
    fontWeight: 'bold',
  },
  copyIcon: {
    fontSize: 16,
    color: '#6B7280',
  },
  copyButton: {
    padding: 4,
  },
  copyButtonText: {
    fontSize: 18,
  },
  rivalsBadge: {
    backgroundColor: '#F97316',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  rivalsBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  cardHeader: {
    backgroundColor: '#3B82F6',
    padding: 16,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  cardContent: {
    padding: 16,
    gap: 16,
  },
  hostInfo: {
    backgroundColor: '#DBEAFE',
    borderWidth: 1,
    borderColor: '#93C5FD',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  hostText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E40AF',
  },
  hostSubtext: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
  },
  drinkingModeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  drinkingModeLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#374151',
  },
  drinkingModeBadge: {
    backgroundColor: '#F97316',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignSelf: 'center',
  },
  drinkingModeBadgeText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  guestInfo: {
    backgroundColor: '#DBEAFE',
    borderWidth: 1,
    borderColor: '#93C5FD',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  guestText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E40AF',
  },
  guestSubtext: {
    fontSize: 14,
    color: '#475569',
    marginTop: 4,
    textAlign: 'center',
  },
  teamsContainer: {
    gap: 16,
  },
  teamsContainerSideBySide: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  teamCardShrunk: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 20,
    overflow: 'hidden',
    maxWidth: '48%',
  },
  teamCard: {
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 20,
    overflow: 'hidden',
  },
  teamHeader: {
    padding: 12,
  },
  redTeamHeader: {
    backgroundColor: '#EF4444',
  },
  blueTeamHeader: {
    backgroundColor: '#3B82F6',
  },
  teamTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  teamContent: {
    backgroundColor: '#F9FAFB',
    padding: 16,
    gap: 16,
  },
  roleSection: {
    gap: 8,
  },
  roleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  roleDisplay: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    minHeight: 60,
    gap: 8,
  },
  playerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  playerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  youBadge: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  youBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  waitingText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  joinButton: {
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  joinButtonOutline: {
    borderWidth: 2,
    borderColor: '#D1D5DB',
    backgroundColor: 'transparent',
  },
  joinButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  rivalsWaiting: {
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  rivalsIcon: {
    fontSize: 64,
  },
  rivalsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#374151',
  },
  rivalsSubtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  startSection: {
    gap: 12,
  },
  startButton: {
    backgroundColor: '#10B981',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  startButtonDisabled: {
    opacity: 0.5,
  },
  startButtonIcon: {
    fontSize: 24,
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  readyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    borderWidth: 2,
    borderColor: '#10B981',
    borderRadius: 16,
    padding: 12,
    gap: 8,
  },
  readyDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10B981',
  },
  readyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#065F46',
  },
  warningBadge: {
    flexDirection: 'row',
    backgroundColor: '#FEF3C7',
    borderWidth: 2,
    borderColor: '#F59E0B',
    borderRadius: 16,
    padding: 12,
    gap: 12,
  },
  warningIcon: {
    fontSize: 24,
  },
  warningContent: {
    flex: 1,
    gap: 4,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 4,
  },
  warningSubtext: {
    fontSize: 12,
    color: '#92400E',
  },
  warningItem: {
    fontSize: 14,
    color: '#92400E',
  },
  rivalsInfoBadge: {
    backgroundColor: '#EDE9FE',
    borderWidth: 2,
    borderColor: '#A78BFA',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
  },
  rivalsInfoText: {
    fontSize: 14,
    color: '#6D28D9',
  },
});
