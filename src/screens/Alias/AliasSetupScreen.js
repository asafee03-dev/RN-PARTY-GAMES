import { doc, getDoc, onSnapshot, runTransaction, updateDoc } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';
import BannerAd from '../../components/shared/BannerAd';
import PlayerCard from '../../components/shared/PlayerCard';
import RulesModal from '../../components/shared/RulesModal';
import UnifiedTopBar from '../../components/shared/UnifiedTopBar';
import { db } from '../../firebase';
import { clearCurrentRoom, loadCurrentRoom, saveCurrentRoom } from '../../utils/navigationState';
import storage from '../../utils/storage';

const TEAM_COLORS = ["#EF4444", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316"];

export default function AliasSetupScreen({ navigation, route }) {
  const roomCode = route?.params?.roomCode || '';
  const [room, setRoom] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isHost, setIsHost] = useState(false);
  const [isJoiningTeam, setIsJoiningTeam] = useState(false);
  const [isStartingGame, setIsStartingGame] = useState(false);
  const [drinkingMode, setDrinkingMode] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const unsubscribeRef = useRef(null);

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

  // Save room state for reconnection on refresh
  useEffect(() => {
    if (roomCode) {
      saveCurrentRoom('alias', roomCode, {});
    }
  }, [roomCode]);

  useEffect(() => {
    if (!roomCode) {
      // Try to restore from saved state on refresh
      const restoreRoom = async () => {
        try {
          const savedRoom = await loadCurrentRoom();
          if (savedRoom && savedRoom.gameType === 'alias' && savedRoom.roomCode) {
            navigation.replace('AliasSetup', { roomCode: savedRoom.roomCode });
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

    loadRoom();
    setupRealtimeListener();

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

  // Auto-navigate when game starts
  const hasNavigatedToGame = useRef(false);
  
  useEffect(() => {
    if (room && (room.game_status === 'waiting' || room.game_status === 'playing') && !hasNavigatedToGame.current) {
      // Game has started, navigate to game screen
      hasNavigatedToGame.current = true;
      navigation.replace('AliasGame', { roomCode });
    }
    
    // Reset flag if game goes back to setup
    if (room && room.game_status === 'setup') {
      hasNavigatedToGame.current = false;
    }
  }, [room?.game_status, roomCode, navigation]);

  const loadRoom = async () => {
    try {
      setIsLoading(true);
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

      // Check if current player is host
      const currentPlayerName = playerName || (await storage.getItem('playerName')) || '';
      setIsHost(roomData.host_name === currentPlayerName);
      
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

    const roomRef = doc(db, 'GameRoom', roomCode);
    
    unsubscribeRef.current = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const roomData = { id: snapshot.id, ...snapshot.data() };
        setRoom(roomData);

        // Sync drinking mode from room data
        if (roomData.drinking_mode !== undefined) {
          setDrinkingMode(roomData.drinking_mode);
          // Also sync to local storage
          storage.setItem('drinkingMode', roomData.drinking_mode.toString()).catch(() => {});
        }

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

  /**
   * Apply a change to the teams array inside a transaction, on top of the
   * server's latest teams. Previously each action wrote back a stale local
   * copy (or mutated on-screen state), so two players joining teams at the
   * same moment - or the host adding a team while someone joined - erased
   * each other's changes. `mutate(teams, fresh)` returns { teams } or { error }.
   */
  const updateTeamsTx = async (mutate) => {
    const roomRef = doc(db, 'GameRoom', roomCode);
    return runTransaction(db, async (transaction) => {
      const snap = await transaction.get(roomRef);
      if (!snap.exists()) return { error: 'missing' };
      const fresh = snap.data();
      // Work on copies - never mutate data read from Firestore or React state
      const teams = (fresh.teams || []).map(t => ({
        ...t,
        players: Array.isArray(t.players) ? [...t.players] : []
      }));
      const result = mutate(teams, fresh);
      if (result.error) return result;
      transaction.update(roomRef, { teams: result.teams, ...(result.extra || {}) });
      return { ok: true };
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
      const result = await updateTeamsTx((teams) => {
        const team = teams[teamIndex];
        if (!team) return { error: 'invalid' };

        // Only one player allowed per team
        const currentPlayers = team.players.filter(p => p && p.trim().length > 0);
        if (currentPlayers.length > 0 && !currentPlayers.includes(playerName)) {
          return { error: 'full' };
        }

        // Remove player from all teams, then add to the selected one
        teams.forEach(t => {
          t.players = t.players.filter(p => p !== playerName);
        });
        team.players.push(playerName);
        if (team.players.length === 1) {
          team.name = `הקבוצה של ${playerName}`;
        }
        return { teams };
      });

      if (result.error === 'missing') {
        Alert.alert('שגיאה', 'החדר נמחק');
        navigation.goBack();
      } else if (result.error === 'invalid') {
        Alert.alert('שגיאה', 'קבוצה לא תקינה');
      } else if (result.error === 'full') {
        Alert.alert('שגיאה', 'הקבוצה כבר מלאה. כל קבוצה יכולה להכיל שחקן אחד בלבד.');
      } else {
        console.log('✅ Player joined team:', teamIndex);
      }
    } catch (error) {
      console.error('❌ Error joining team:', error);
      Alert.alert('שגיאה', 'לא הצלחנו להצטרף לקבוצה. נסה שוב.');
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
      await updateTeamsTx((teams) => {
        teams.forEach((t, index) => {
          const beforeCount = t.players.length;
          t.players = t.players.filter(p => p !== playerName);
          // If team becomes empty and name was personalized, reset to default
          if (t.players.length === 0 && beforeCount > 0 && t.name && t.name.startsWith('הקבוצה של ')) {
            t.name = `קבוצה ${index + 1}`;
          }
        });
        return { teams };
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

  const handleToggleDrinkingMode = async () => {
    if (!isHost || !room) return;

    const newValue = !drinkingMode;
    setDrinkingMode(newValue);

    try {
      // Save to local storage
      await storage.setItem('drinkingMode', newValue.toString());

      // Save to Firestore room data so all players see it
      const roomRef = doc(db, 'GameRoom', roomCode);
      await updateDoc(roomRef, {
        drinking_mode: newValue
      });

      console.log('✅ Drinking mode updated:', newValue);
    } catch (error) {
      console.error('Error saving drinking mode:', error);
      setDrinkingMode(!newValue); // Revert on error
      Alert.alert('שגיאה', 'לא הצלחנו לעדכן את מצב השתייה');
    }
  };

  const handleAddTeam = async () => {
    if (!isHost || !room) return;

    try {
      await updateTeamsTx((teams) => {
        const newTeamIndex = teams.length;
        // First color not used by an existing team (fallback by index)
        const usedColors = teams.map(team => team.color).filter(Boolean);
        const selectedColor = TEAM_COLORS.find(color => !usedColors.includes(color)) ||
          TEAM_COLORS[newTeamIndex % TEAM_COLORS.length];

        teams.push({
          name: `קבוצה ${newTeamIndex + 1}`,
          color: selectedColor,
          players: [],
          position: 0,
          round_start_position: null
        });
        return { teams };
      });
    } catch (error) {
      console.error('Error adding team:', error);
      Alert.alert('שגיאה', 'לא הצלחנו להוסיף קבוצה');
    }
  };

  const handleRemoveTeam = async (teamIndex) => {
    if (!isHost || !room) return;

    try {
      const result = await updateTeamsTx((teams) => {
        const team = teams[teamIndex];
        // Re-checked on the server copy: someone may have just joined this team
        if (team && team.players.length > 0) return { error: 'has_players' };
        if (teams.length <= 2) return { error: 'min_teams' };
        return { teams: teams.filter((_, index) => index !== teamIndex) };
      });
      if (result.error === 'has_players') {
        Alert.alert('שגיאה', 'לא ניתן למחוק קבוצה עם שחקנים');
      } else if (result.error === 'min_teams') {
        Alert.alert('שגיאה', 'חייבות להיות לפחות 2 קבוצות');
      }
    } catch (error) {
      console.error('Error removing team:', error);
      Alert.alert('שגיאה', 'לא הצלחנו למחוק קבוצה');
    }
  };

  const handleStartGame = async () => {
    if (!isHost || !room) return;
    if (isStartingGame) return;
    setIsStartingGame(true);

    // Golden squares: 10 random positions 1-58 (avoiding start and end)
    const squares = [];
    for (let i = 1; i < 59; i++) squares.push(i);
    const randomGoldenSquares = squares.sort(() => Math.random() - 0.5).slice(0, 10);

    try {
      const result = await updateTeamsTx((teams, fresh) => {
        // Refuse a second start (double tap)
        if (fresh.game_status && fresh.game_status !== 'setup') return { error: 'started' };

        // Validate on the server copy, so a player who just left is accounted for
        if (teams.filter(t => t.players.length > 0).length < 2) return { error: 'min_teams' };
        const emptyIndex = teams.findIndex(t => t.players.length === 0);
        if (emptyIndex !== -1) return { error: 'empty_team', index: emptyIndex };

        return {
          teams: teams.map(team => ({
            ...team,
            position: team.position !== undefined ? team.position : 0,
            round_start_position: null
          })),
          extra: {
            game_status: 'waiting',
            golden_squares: fresh.golden_rounds_enabled ? randomGoldenSquares : [],
            current_turn: 0,
            round_active: false
          }
        };
      });

      if (result.error === 'min_teams') {
        Alert.alert('שגיאה', 'נדרשות לפחות 2 קבוצות עם שחקנים');
      } else if (result.error === 'empty_team') {
        Alert.alert('שגיאה', `קבוצה ${result.index + 1} צריכה לפחות שחקן אחד`);
      }
      if (result.error && result.error !== 'started') {
        setIsStartingGame(false);
        return;
      }
      // Navigation will happen automatically via useEffect when game_status changes
      console.log('✅ Game started');
    } catch (error) {
      console.error('Error starting game:', error);
      Alert.alert('שגיאה', 'לא הצלחנו להתחיל את המשחק');
      setIsStartingGame(false);
    }
  };

  const handleCopyRoomCode = async () => {
    await copyRoomCode(roomCode);
  };

  const handleCopyRoomLink = async () => {
    await copyRoomLink(roomCode, 'alias');
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
      <GradientBackground variant="brightBlue">
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.loadingText}>טוען חדר...</Text>
        </View>
      </GradientBackground>
    );
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
          onExit={() => {
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
          onRulesPress={() => setShowRulesModal(true)}
          drinkingMode={drinkingMode}
        />

        {/* Rules Modal */}
        <RulesModal
          visible={showRulesModal}
          onClose={() => setShowRulesModal(false)}
          variant="alias"
        />

        {/* Compact Toggles Row */}
        <View style={styles.togglesRow}>
          {/* Drinking Mode Toggle */}
          <View style={styles.toggleItem}>
            <Text style={styles.toggleLabel}>🔞 שתייה</Text>
            <Switch
              value={drinkingMode}
              onValueChange={handleToggleDrinkingMode}
              trackColor={{ false: '#D1D5DB', true: '#F97316' }}
              thumbColor={drinkingMode ? '#FFFFFF' : '#9CA3AF'}
              style={styles.compactSwitch}
            />
          </View>

          {/* Golden Rounds Toggle (Host Only) */}
          {isHost && (
            <View style={styles.toggleItem}>
              <Text style={styles.toggleLabel}>⭐ סבבי זהב</Text>
              <Switch
                value={room.golden_rounds_enabled || false}
                onValueChange={handleToggleGoldenRounds}
                trackColor={{ false: '#D1D5DB', true: '#FFD700' }}
                thumbColor={room.golden_rounds_enabled ? '#FFFFFF' : '#9CA3AF'}
                style={styles.compactSwitch}
              />
            </View>
          )}
        </View>

        {/* Teams Section */}
        <View style={styles.teamsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>קבוצות</Text>
            {isHost && (
              <Pressable
                onPress={handleAddTeam}
                style={styles.whiteAddTeamButton}
              >
                <Text style={styles.whiteAddTeamButtonText}>+ הוסף קבוצה</Text>
              </Pressable>
            )}
          </View>
          {room.teams && Array.isArray(room.teams) && room.teams
            .filter((team) => team != null && typeof team === 'object')
            .map((team, index) => {
            if (!team || typeof team !== 'object') {
              return null;
            }
            const isPlayerInTeam = team.players && Array.isArray(team.players) && team.players.includes(playerName);
            const teamColor = (team.color && typeof team.color === 'string') ? team.color : TEAM_COLORS[index % TEAM_COLORS.length];
            const teamName = (team.name && typeof team.name === 'string') ? team.name : `קבוצה ${index + 1}`;
            const playerCount = (team.players && Array.isArray(team.players)) ? team.players.filter(p => p && p.trim().length > 0).length : 0;
            const isTeamFull = playerCount >= 1; // Only one player allowed per team

            return (
              <View key={`team-${index}`} style={[styles.teamCard, { borderColor: teamColor }]}>
                <View style={[styles.teamHeader, { backgroundColor: teamColor }]}>
                  <View style={styles.teamHeaderLeft}>
                    <Text style={styles.teamName}>{teamName}</Text>
                    <Text style={styles.teamPlayerCount}>
                      {playerCount} שחקנים
                    </Text>
                  </View>
                  {isHost && playerCount === 0 && (
                    <Pressable
                      onPress={() => handleRemoveTeam(index)}
                      style={styles.removeTeamButton}
                    >
                      <Text style={styles.removeTeamIcon}>🗑️</Text>
                    </Pressable>
                  )}
                </View>

                <View style={styles.playersContainer}>
                  {team.players && Array.isArray(team.players) && team.players.length > 0 ? (
                    team.players.map((player, playerIndex) => {
                      const playerNameStr = typeof player === 'string' ? player : String(player || '');
                      return (
                        <PlayerCard
                          key={playerIndex}
                          playerName={playerNameStr}
                          isHost={playerNameStr === room.host_name}
                        />
                      );
                    })
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
                        variant="alias"
                        style={styles.teamButton}
                        disabled={isJoiningTeam}
                      />
                    ) : isTeamFull ? (
                      <View style={styles.teamFullContainer}>
                        <Text style={styles.teamFullText}>הקבוצה מלאה</Text>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => handleJoinTeam(index)}
                        style={[styles.whiteTeamButton, isJoiningTeam && styles.whiteTeamButtonDisabled]}
                        disabled={isJoiningTeam}
                      >
                        <Text style={styles.whiteTeamButtonText}>הצטרף לקבוצה</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>


        {/* Start Game Button (Host Only) */}
        {isHost && (
          <View style={styles.startGameContainer}>
            <GradientButton
              title={isStartingGame ? 'מתחיל משחק...' : 'התחל משחק'}
              onPress={handleStartGame}
              variant="alias"
              style={styles.startButton}
              disabled={isStartingGame || room.game_status !== 'setup'}
            />
            {isStartingGame && (
              <View style={styles.loadingIndicatorContainer}>
                <ActivityIndicator color="#FFFFFF" size="small" />
              </View>
            )}
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
      <BannerAd />
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 16,
    paddingTop: 50,
    paddingBottom: 20,
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
  },
  togglesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  toggleItem: {
    flex: 1,
    backgroundColor: '#4FA8FF', // Alias theme color - כחול בהיר
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#4FA8FF', // Alias theme color border
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 36,
  },
  toggleLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF', // White text for good contrast on blue background
    marginRight: 8,
  },
  compactSwitch: {
    transform: [{ scaleX: 0.6 }, { scaleY: 0.6 }],
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  roomCodeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roomCodePressable: {
    backgroundColor: 'rgba(79, 168, 255, 0.15)', // Alias theme color with transparency - כחול בהיר
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    borderWidth: 1,
    borderColor: '#4FA8FF',
  },
  copyLinkButton: {
    paddingHorizontal: 12,
  },
  whiteCopyLinkButton: {
    backgroundColor: '#4FA8FF', // Alias theme color - כחול בהיר
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  whiteCopyLinkButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  roomCodeLabel: {
    color: '#4FA8FF', // Alias theme color - כחול בהיר
    fontSize: 14,
    fontWeight: '600',
  },
  roomCode: {
    color: '#4FA8FF', // Alias theme color - כחול בהיר
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
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4FA8FF', // Alias theme color - כחול בהיר
    textAlign: 'right',
  },
  addTeamButton: {
    paddingHorizontal: 12,
  },
  whiteAddTeamButton: {
    backgroundColor: '#4FA8FF', // Alias theme color - כחול בהיר
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  whiteAddTeamButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
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
  teamHeaderLeft: {
    flex: 1,
  },
  removeTeamButton: {
    padding: 8,
    marginLeft: 8,
  },
  removeTeamIcon: {
    fontSize: 20,
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
  whiteTeamButton: {
    width: '100%',
    backgroundColor: '#4FA8FF', // Alias theme color - כחול בהיר
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 1,
  },
  whiteTeamButtonDisabled: {
    opacity: 0.5,
    backgroundColor: '#4FA8FF',
  },
  whiteTeamButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  teamFullContainer: {
    width: '100%',
    backgroundColor: '#E0E0E0',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamFullText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  startGameContainer: {
    marginBottom: 24,
  },
  startButton: {
    width: '100%',
  },
  loadingIndicatorContainer: {
    marginTop: 8,
    alignItems: 'center',
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
