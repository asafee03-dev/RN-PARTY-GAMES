import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator, Modal, Switch, TouchableOpacity } from 'react-native';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';
import { db, waitForFirestoreReady } from '../../firebase';
import { doc, getDoc, updateDoc, onSnapshot, query, collection, where, getDocs } from 'firebase/firestore';
import storage from '../../utils/storage';
import { copyRoomCode, copyRoomLink } from '../../utils/clipboard';
import { saveCurrentRoom, loadCurrentRoom, clearCurrentRoom } from '../../utils/navigationState';

export default function SpyRoomScreen({ navigation, route }) {
  const roomCode = route?.params?.roomCode || '';
  const [room, setRoom] = useState(null);
  const [currentPlayerName, setCurrentPlayerName] = useState('');
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState(360); // 6 minutes
  const [drinkingMode, setDrinkingMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showLocations, setShowLocations] = useState(false);

  const timerInterval = useRef(null);
  const unsubscribeRef = useRef(null);

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

      // Get player name from storage
      const playerName = currentPlayerName || (await storage.getItem('playerName')) || '';
      if (playerName) {
        setCurrentPlayerName(playerName);
      }

      // Add player if not already in room
      const playerExists = roomData.players && Array.isArray(roomData.players) && roomData.players.some(p => p && p.name === playerName);
      if (!playerExists && roomData.game_status === 'lobby' && playerName) {
        const updatedPlayers = [...(roomData.players || []), { name: playerName }];
        console.log('🔵 Adding player to Spy room:', playerName);
        try {
          await updateDoc(roomRef, { players: updatedPlayers });
          const updatedSnapshot = await getDoc(roomRef);
          if (updatedSnapshot.exists()) {
            const updatedRoom = { id: updatedSnapshot.id, ...updatedSnapshot.data() };
            setRoom(updatedRoom);
            return;
          }
        } catch (updateError) {
          console.error('❌ Error adding player:', updateError);
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
        setRoom(prevRoom => {
          if (!prevRoom) {
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
          
          if (JSON.stringify(prevRoom) !== JSON.stringify(newRoom)) {
            return newRoom;
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

    let currentRoom = room;
    try {
      const roomRef = doc(db, 'SpyRoom', room.id);
      const snapshot = await getDoc(roomRef);
      if (snapshot.exists()) {
        currentRoom = { id: snapshot.id, ...snapshot.data() };
      }
    } catch (error) {
      console.error('❌ Error fetching fresh room state:', error);
    }

    if (currentRoom.game_status !== 'lobby') {
      console.warn('⚠️ Cannot start game - room is not in lobby state:', currentRoom.game_status);
      Alert.alert('שגיאה', 'החדר לא מוכן למשחק חדש. אנא לחץ על \'משחק חדש\' תחילה.');
      return;
    }

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

    const freshPlayers = currentRoom.players.map(p => ({ name: p.name }));

    const randomSpyIndex = Math.floor(Math.random() * freshPlayers.length);
    const spyName = freshPlayers[randomSpyIndex].name;

    const updatedPlayers = freshPlayers.map((player, index) => {
      if (index === randomSpyIndex) {
        return {
          name: player.name,
          is_spy: true,
          location: '',
          role: '',
          vote: null
        };
      } else {
        const randomRole = randomLocation.roles[Math.floor(Math.random() * randomLocation.roles.length)];
        return {
          name: player.name,
          is_spy: false,
          location: randomLocation.location,
          role: randomRole,
          vote: null
        };
      }
    });

    const allLocationNames = locations.map(loc => loc.location).filter(loc => loc != null);

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
        spy_name: spyName || '',
        chosen_location: randomLocation.location || '',
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

    const updatedPlayers = room.players.map(p => {
      if (p.name === currentPlayerName) {
        return { ...p, vote: votedPlayerName };
      }
      return p;
    });

    const allVoted = updatedPlayers.every(p => p.vote !== null && p.vote !== undefined);
    
    try {
      const roomRef = doc(db, 'SpyRoom', room.id);
      await updateDoc(roomRef, {
        players: updatedPlayers,
        all_votes_submitted: allVoted && updatedPlayers.length > 0
      });
      console.log('✅ Vote submitted. All votes submitted:', allVoted);
    } catch (error) {
      console.error('❌ Error submitting vote:', error);
      return;
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
    if (!room || !room.id || !room.players || !Array.isArray(room.players)) return;
    
    const resetPlayers = room.players.map(p => ({ name: p.name }));
    
    try {
      const roomRef = doc(db, 'SpyRoom', room.id);
      await updateDoc(roomRef, {
        players: resetPlayers,
        game_status: 'lobby',
        game_start_time: null,
        spy_name: null,
        chosen_location: null,
        all_locations: null,
        eliminated_locations: null,
        all_votes_submitted: false
      });
      console.log('✅ Game reset successfully - all state cleared');
    } catch (error) {
      console.error('❌ Error resetting game:', error);
    }
  };

  const handleCopyRoomCode = async () => {
    await copyRoomCode(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyRoomLink = async () => {
    await copyRoomLink(roomCode, 'spy');
  };

  const goBack = async () => {
    await clearCurrentRoom();
    navigation.navigate('SpyHome');
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (error) {
    return (
      <GradientBackground variant="green">
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>שגיאה בטעינת החדר</Text>
          <Text style={styles.errorMessage}>לא הצלחנו לטעון את חדר המשחק</Text>
          <GradientButton
            title="חזרה"
            onPress={() => {
              setError(null);
              setIsLoading(true);
              navigation.navigate('SpyHome');
            }}
            variant="green"
            style={styles.errorButton}
          />
        </View>
      </GradientBackground>
    );
  }

  if (isLoading || !room) {
    return (
      <GradientBackground variant="green">
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
  const myVote = currentPlayer?.vote;

  return (
    <GradientBackground variant="green">
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
              <Text style={styles.roomCodeLabel}>קוד חדר:</Text>
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
              <Text style={styles.lobbyTitle}>👥 חדר המתנה</Text>
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
                  variant="green"
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
                    {isSpy ? '👁️‍🗨️ אתה המרגל!' : '👁️ התפקיד שלך'}
                  </Text>
                </View>
                <View style={styles.playerInfoContent}>
                  {isSpy ? (
                    <View style={styles.spyInfo}>
                      <Text style={styles.spyEmoji}>🕵️</Text>
                      <Text style={styles.spyTitle}>אתה המרגל!</Text>
                      <Text style={styles.spyDescription}>
                        אתה לא יודע את המקום.{'\n'}
                        נסה לגלות מהו המיקום מבלי שיגלו שאתה המרגל!
                      </Text>
                      <View style={styles.spyTip}>
                        <Text style={styles.spyTipTitle}>💡 טיפ:</Text>
                        <Text style={styles.spyTipText}>השתמש ברשימת המקומות כדי לסמן מקומות שכבר שללת</Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.regularInfo}>
                      <View style={styles.locationCard}>
                        <Text style={styles.locationLabel}>המיקום:</Text>
                        <Text style={styles.locationText}>{currentPlayer?.location}</Text>
                      </View>
                      <View style={styles.roleCard}>
                        <Text style={styles.roleLabel}>התפקיד שלך:</Text>
                        <Text style={styles.roleText}>{currentPlayer?.role}</Text>
                      </View>
                      <View style={styles.regularTip}>
                        <Text style={styles.regularTipTitle}>💡 טיפ:</Text>
                        <Text style={styles.regularTipText}>שאל שאלות כדי לגלות מי המרגל, אבל אל תחשוף יותר מדי!</Text>
                      </View>
                    </View>
                  )}
                </View>
              </View>

              {/* Voting Section */}
              <View style={styles.votingCard}>
                <View style={styles.votingHeader}>
                  <Text style={styles.votingTitle}>הצבעה - מי המרגל?</Text>
                </View>
                <View style={styles.votingContent}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.votingPlayersList}>
                    {players
                      .filter((player) => player != null && player.name != null)
                      .map((player, idx) => {
                      const playerName = typeof player.name === 'string' ? player.name : String(player.name || '');
                      const votesForPlayer = players.filter(p => p && p.name && (typeof p.name === 'string' ? p.name : String(p.name || '')) === playerName).length;
                      const isMyVote = myVote === playerName;
                      const isMe = playerName === currentPlayerName;

                      return (
                        <Pressable
                          key={`voting-player-${idx}`}
                          onPress={() => !isMe && voteForPlayer(playerName)}
                          disabled={isMe}
                          style={[
                            styles.votingPlayerCard,
                            isMyVote && styles.votingPlayerCardSelected,
                            isMe && styles.votingPlayerCardDisabled
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
                              <Text style={styles.myVoteText}>ההצבעה שלך ✓</Text>
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
                      המשחק יסתיים כשכולם יצביעו, כשהמארח יסיים את המשחק, או כשהזמן יגמר.
                    </Text>
                    <View style={styles.votingProgress}>
                      <Text style={styles.votingProgressText}>
                        {players.filter(p => p && p.vote !== null && p.vote !== undefined).length} / {players.length}
                      </Text>
                      <Text style={styles.votingProgressLabel}>שחקנים הצביעו</Text>
                    </View>
                  </View>
                </View>
              </View>

              {isHost && (
                <GradientButton
                  title="סיים משחק"
                  onPress={() => endGame()}
                  variant="orange"
                  style={styles.endButton}
                />
              )}

              {/* Locations List - Only for Spy */}
              {isSpy && (
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
                <Text style={styles.spyRevealLabel}>המרגל היה:</Text>
                <Text style={styles.spyRevealName}>{room.spy_name}</Text>
              </View>

              <View style={styles.locationRevealCard}>
                <Text style={styles.locationRevealLabel}>המיקום היה:</Text>
                <Text style={styles.locationRevealName}>{room.chosen_location}</Text>
              </View>

              {/* Voting Results */}
              <View style={styles.votingResultsCard}>
                <Text style={styles.votingResultsTitle}>תוצאות ההצבעה:</Text>
                {(() => {
                  const voteCounts = players.map(player => {
                    const votes = players.filter(p => p && p.vote === player.name).length;
                    const wasSpy = player.name === room?.spy_name;
                    return { player, votes, wasSpy };
                  });
                  
                  const maxVotes = Math.max(...voteCounts.map(v => v.votes));
                  const spyVotes = voteCounts.find(v => v.wasSpy)?.votes || 0;
                  const spyCaught = spyVotes === maxVotes && spyVotes > 0;
                  const spyWon = !spyCaught;
                  
                  return (
                    <>
                      <View style={[styles.resultCard, spyWon ? styles.resultCardSpyWon : styles.resultCardSpyCaught]}>
                        <Text style={styles.resultTitle}>
                          {spyWon ? '🕵️ המרגל ניצח!' : '✅ המרגל נתפס!'}
                        </Text>
                        <Text style={styles.resultDescription}>
                          {spyWon 
                            ? 'המרגל הצליח להישאר בחשאי!' 
                            : 'השחקנים הצליחו לזהות את המרגל!'}
                        </Text>
                      </View>
                      
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
        {isHost && (
                <GradientButton
                  title="משחק חדש"
                  onPress={resetGame}
                  variant="green"
                  style={styles.resetButton}
                />
              )}
            <GradientButton
                title="יציאה"
                onPress={goBack}
                variant="outline"
                style={styles.exitButton}
              />
            </View>
          </View>
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
    color: '#10B981',
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
    backgroundColor: '#10B981',
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
    backgroundColor: '#10B981',
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
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: 12,
    padding: 12,
  },
  warningText: {
    fontSize: 14,
    color: '#92400E',
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
    color: '#10B981',
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
    backgroundColor: '#10B981',
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
    color: '#10B981',
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
    color: '#10B981',
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
    backgroundColor: '#D1FAE5',
    borderWidth: 2,
    borderColor: '#10B981',
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
  },
  resetButton: {
    marginBottom: 8,
  },
  exitButton: {
    marginTop: 8,
  },
});
