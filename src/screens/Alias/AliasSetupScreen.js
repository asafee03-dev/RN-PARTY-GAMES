import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator, TextInput } from 'react-native';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';
import PlayerCard from '../../components/shared/PlayerCard';
import HostStatusCard from '../../components/shared/HostStatusCard';
import { db } from '../../firebase';
import { doc, getDoc, updateDoc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';

const TEAM_COLORS = ["#EF4444", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316"];

// Storage helper
const storage = {
  async getItem(key) {
    return null;
  },
  async setItem(key, value) {
    // In a real app, use AsyncStorage
  }
};

export default function AliasSetupScreen({ navigation, route }) {
  const roomCode = route?.params?.roomCode || '';
  const [room, setRoom] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isHost, setIsHost] = useState(false);
  const [isJoiningTeam, setIsJoiningTeam] = useState(false);
  const [isStartingGame, setIsStartingGame] = useState(false);
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

    loadRoom();
    setupRealtimeListener();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [roomCode]);

  // Auto-navigate when game starts
  useEffect(() => {
    if (room && room.game_status !== 'setup') {
      // Game has started, navigate to game screen
      navigation.replace('AliasGame', { roomCode });
    }
  }, [room?.game_status, roomCode, navigation]);

  const loadRoom = async () => {
    try {
      setIsLoading(true);
      const roomRef = doc(db, 'GameRoom', roomCode);
      const roomSnap = await getDoc(roomRef);

      if (!roomSnap.exists()) {
        Alert.alert('שגיאה', 'החדר לא נמצא');
        navigation.goBack();
        return;
      }

      const roomData = { id: roomSnap.id, ...roomSnap.data() };
      setRoom(roomData);

      // Check if current player is host
      const currentPlayerName = playerName || (await storage.getItem('playerName')) || '';
      setIsHost(roomData.host_name === currentPlayerName);
    } catch (error) {
      console.error('Error loading room:', error);
      Alert.alert('שגיאה', 'לא הצלחנו לטעון את החדר');
      navigation.goBack();
    } finally {
      setIsLoading(false);
    }
  };

  const setupRealtimeListener = () => {
    const roomRef = doc(db, 'GameRoom', roomCode);
    
    unsubscribeRef.current = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const roomData = { id: snapshot.id, ...snapshot.data() };
        setRoom(roomData);

        // Check if current player is host
        storage.getItem('playerName').then(savedName => {
          const currentPlayerName = playerName || savedName || '';
          setIsHost(roomData.host_name === currentPlayerName);
        });
      } else {
        Alert.alert('שגיאה', 'החדר נמחק');
        navigation.goBack();
      }
    }, (error) => {
      console.error('Error in realtime listener:', error);
    });
  };

  const handleJoinTeam = async (teamIndex) => {
    if (!room || !playerName.trim()) {
      Alert.alert('שגיאה', 'אנא הכנס שם שחקן');
      return;
    }

    if (isJoiningTeam) return;
    setIsJoiningTeam(true);

    try {
      const updatedTeams = [...room.teams];
      const team = updatedTeams[teamIndex];

      if (!team) {
        Alert.alert('שגיאה', 'קבוצה לא תקינה');
        setIsJoiningTeam(false);
        return;
      }

      // Remove player from all teams first
      updatedTeams.forEach(t => {
        if (t.players && Array.isArray(t.players)) {
          t.players = t.players.filter(p => p !== playerName);
        } else {
          t.players = [];
        }
      });

      // Add player to selected team
      if (!team.players) {
        team.players = [];
      }
      if (!team.players.includes(playerName)) {
        team.players.push(playerName);
      }

      const roomRef = doc(db, 'GameRoom', roomCode);
      await updateDoc(roomRef, {
        teams: updatedTeams
      });

      console.log('✅ Player joined team:', teamIndex);
    } catch (error) {
      console.error('Error joining team:', error);
      Alert.alert('שגיאה', 'לא הצלחנו להצטרף לקבוצה');
    } finally {
      setIsJoiningTeam(false);
    }
  };

  const handleLeaveTeam = async () => {
    if (!room || !playerName.trim()) {
      return;
    }

    if (isJoiningTeam) return;
    setIsJoiningTeam(true);

    try {
      const updatedTeams = [...room.teams];
      
      // Remove player from all teams
      updatedTeams.forEach(t => {
        if (t.players && Array.isArray(t.players)) {
          t.players = t.players.filter(p => p !== playerName);
        } else {
          t.players = [];
        }
      });

      const roomRef = doc(db, 'GameRoom', roomCode);
      await updateDoc(roomRef, {
        teams: updatedTeams
      });

      console.log('✅ Player left team');
    } catch (error) {
      console.error('Error leaving team:', error);
      Alert.alert('שגיאה', 'לא הצלחנו לעזוב את הקבוצה');
    } finally {
      setIsJoiningTeam(false);
    }
  };

  const handleToggleGoldenRounds = async () => {
    if (!isHost || !room) return;

    try {
      const roomRef = doc(db, 'GameRoom', roomCode);
      await updateDoc(roomRef, {
        golden_rounds_enabled: !room.golden_rounds_enabled
      });
    } catch (error) {
      console.error('Error toggling golden rounds:', error);
      Alert.alert('שגיאה', 'לא הצלחנו לעדכן את ההגדרות');
    }
  };

  const handleStartGame = async () => {
    if (!isHost || !room) return;

    // Validate that all teams have at least one player
    const teamsWithPlayers = room.teams.filter(t => t.players && t.players.length > 0);
    if (teamsWithPlayers.length < 2) {
      Alert.alert('שגיאה', 'נדרשות לפחות 2 קבוצות עם שחקנים');
      return;
    }

    // Validate that each team has at least one player
    for (let i = 0; i < room.teams.length; i++) {
      const team = room.teams[i];
      if (!team.players || team.players.length === 0) {
        Alert.alert('שגיאה', `קבוצה ${i + 1} צריכה לפחות שחקן אחד`);
        return;
      }
    }

    if (isStartingGame) return;
    setIsStartingGame(true);

    try {
      // Generate golden squares if golden rounds are enabled
      let goldenSquares = [];
      if (room.golden_rounds_enabled) {
        // Generate 10 random golden squares (positions 1-58, avoiding start and end)
        const squares = [];
        for (let i = 1; i < 59; i++) {
          squares.push(i);
        }
        const shuffled = squares.sort(() => Math.random() - 0.5);
        goldenSquares = shuffled.slice(0, 10);
      }

      const roomRef = doc(db, 'GameRoom', roomCode);
      await updateDoc(roomRef, {
        game_status: 'waiting',
        golden_squares: goldenSquares,
        current_turn: 0,
        round_active: false
      });

      // Navigation will happen automatically via useEffect when game_status changes
      console.log('✅ Game started');
    } catch (error) {
      console.error('Error starting game:', error);
      Alert.alert('שגיאה', 'לא הצלחנו להתחיל את המשחק');
      setIsStartingGame(false);
    }
  };

  const handleCopyRoomCode = () => {
    // In React Native, we'd use Clipboard API
    Alert.alert('קוד חדר', roomCode, [{ text: 'אישור' }]);
  };

  const getPlayerTeam = () => {
    if (!room || !playerName) return null;
    for (let i = 0; i < room.teams.length; i++) {
      if (room.teams[i].players && room.teams[i].players.includes(playerName)) {
        return i;
      }
    }
    return null;
  };

  const playerTeamIndex = getPlayerTeam();

  if (isLoading || !room) {
    return (
      <GradientBackground variant="purple">
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.loadingText}>טוען חדר...</Text>
        </View>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground variant="purple">
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <GradientButton
            title="← חזרה"
            onPress={() => navigation.goBack()}
            variant="ghost"
            style={styles.backButton}
          />
          <Pressable onPress={handleCopyRoomCode} style={styles.roomCodeContainer}>
            <Text style={styles.roomCodeLabel}>קוד חדר:</Text>
            <Text style={styles.roomCode}>{roomCode}</Text>
          </Pressable>
        </View>

        {/* Player Name Input (if not set) */}
        {!playerName && (
          <View style={styles.playerNameContainer}>
            <Text style={styles.label}>השם שלך</Text>
            <TextInput
              value={playerName}
              onChangeText={setPlayerName}
              placeholder="הכנס שם..."
              placeholderTextColor="#999"
              style={styles.input}
              autoCapitalize="none"
            />
            <GradientButton
              title="שמור שם"
              onPress={async () => {
                await storage.setItem('playerName', playerName);
              }}
              variant="primary"
              style={styles.saveNameButton}
            />
          </View>
        )}

        {/* Host Status Card */}
        <HostStatusCard hostName={room.host_name} gameMode="normal" />

        {/* Teams Section */}
        <View style={styles.teamsSection}>
          <Text style={styles.sectionTitle}>קבוצות</Text>
          {room.teams.map((team, index) => {
            const isPlayerInTeam = team.players && team.players.includes(playerName);
            const teamColor = team.color || TEAM_COLORS[index % TEAM_COLORS.length];

            return (
              <View key={index} style={[styles.teamCard, { borderColor: teamColor }]}>
                <View style={[styles.teamHeader, { backgroundColor: teamColor }]}>
                  <Text style={styles.teamName}>{team.name}</Text>
                  <Text style={styles.teamPlayerCount}>
                    {team.players ? team.players.length : 0} שחקנים
                  </Text>
                </View>

                <View style={styles.playersContainer}>
                  {team.players && team.players.length > 0 ? (
                    team.players.map((player, playerIndex) => (
                      <PlayerCard
                        key={playerIndex}
                        playerName={player}
                        isHost={player === room.host_name}
                      />
                    ))
                  ) : (
                    <Text style={styles.emptyTeamText}>אין שחקנים בקבוצה</Text>
                  )}
                </View>

                {playerName && (
                  <View style={styles.teamActions}>
                    {isPlayerInTeam ? (
                      <GradientButton
                        title="עזוב קבוצה"
                        onPress={handleLeaveTeam}
                        variant="red"
                        style={styles.teamButton}
                        disabled={isJoiningTeam}
                      />
                    ) : (
                      <GradientButton
                        title="הצטרף לקבוצה"
                        onPress={() => handleJoinTeam(index)}
                        variant="primary"
                        style={styles.teamButton}
                        disabled={isJoiningTeam}
                      />
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Golden Rounds Toggle (Host Only) */}
        {isHost && (
          <View style={styles.optionsSection}>
            <Pressable
              style={[
                styles.goldenToggle,
                room.golden_rounds_enabled && styles.goldenToggleActive
              ]}
              onPress={handleToggleGoldenRounds}
            >
              <Text style={[
                styles.goldenToggleText,
                room.golden_rounds_enabled && styles.goldenToggleTextActive
              ]}>
                {room.golden_rounds_enabled ? '✓' : ''} סבבי זהב
              </Text>
            </Pressable>
          </View>
        )}

        {/* Start Game Button (Host Only) */}
        {isHost && (
          <View style={styles.startGameContainer}>
            <GradientButton
              title={isStartingGame ? 'מתחיל משחק...' : 'התחל משחק'}
              onPress={handleStartGame}
              variant="green"
              style={styles.startButton}
              disabled={isStartingGame || room.game_status !== 'setup'}
            >
              {isStartingGame && <ActivityIndicator color="#FFFFFF" style={{ marginLeft: 8 }} />}
            </GradientButton>
          </View>
        )}

        {/* Waiting for Host Message */}
        {!isHost && room.game_status === 'setup' && (
          <View style={styles.waitingContainer}>
            <Text style={styles.waitingText}>
              ממתינים למארח להתחיל את המשחק...
            </Text>
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
  roomCodeContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roomCodeLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  roomCode: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  playerNameContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2C3E50',
    marginBottom: 8,
    textAlign: 'right',
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    textAlign: 'right',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  saveNameButton: {
    width: '100%',
  },
  teamsSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
    textAlign: 'right',
  },
  teamCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  teamHeader: {
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  teamName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  teamPlayerCount: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  playersContainer: {
    padding: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  emptyTeamText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    width: '100%',
    padding: 16,
  },
  teamActions: {
    padding: 16,
    paddingTop: 0,
  },
  teamButton: {
    width: '100%',
  },
  optionsSection: {
    marginBottom: 24,
  },
  goldenToggle: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  goldenToggleActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFD700',
  },
  goldenToggleText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'right',
  },
  goldenToggleTextActive: {
    color: '#2C3E50',
  },
  startGameContainer: {
    marginBottom: 24,
  },
  startButton: {
    width: '100%',
  },
  waitingContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  waitingText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
