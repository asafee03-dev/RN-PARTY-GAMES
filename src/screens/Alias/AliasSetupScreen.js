import { doc, getDoc, onSnapshot, runTransaction, updateDoc } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Switch, View } from 'react-native';
import BannerAd from '../../components/shared/BannerAd';
import RulesModal from '../../components/shared/RulesModal';
import UnifiedTopBar from '../../components/shared/UnifiedTopBar';
import { db } from '../../firebase';
import { clearCurrentRoom, loadCurrentRoom, saveCurrentRoom } from '../../utils/navigationState';
import storage from '../../utils/storage';
import { randomInt, shuffle } from '../../utils/random';
import { syncServerClock } from '../../utils/serverClock';
import { S } from '../../strings';
import { colors, radii, spacing, touch, useGameTheme } from '../../theme';
import { AppText, Button, Card, Icon, IconButton, PlayerChip, Screen, accessibleSurface, readableOn } from '../../ui';

const TEAM_COLORS = ["#EF4444", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316"];

export default function AliasSetupScreen({ navigation, route }) {
  const theme = useGameTheme();
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
            Alert.alert(S.alias.setup.error, S.alias.setup.missingRoomCode);
            navigation.goBack();
            return;
          }
        } catch (error) {
          console.warn('⚠️ Error restoring room:', error);
          await clearCurrentRoom();
          Alert.alert(S.alias.setup.error, S.alias.setup.missingRoomCode);
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

  // Measure the server clock offset while still in setup, so it's ready
  // before the first turn's timer (runs once per app session)
  useEffect(() => {
    if (room?.id) {
      syncServerClock('GameRoom', room.id);
    }
  }, [room?.id]);

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
        Alert.alert(S.alias.setup.error, S.alias.setup.roomNotFound);
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
      Alert.alert(S.alias.setup.error, S.alias.setup.loadFailed);
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
        Alert.alert(S.alias.setup.error, S.alias.setup.roomDeleted);
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
      Alert.alert(S.alias.setup.error, S.alias.setup.nameRequired);
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
        Alert.alert(S.alias.setup.error, S.alias.setup.roomDeleted);
        navigation.goBack();
      } else if (result.error === 'invalid') {
        Alert.alert(S.alias.setup.error, S.alias.setup.invalidTeam);
      } else if (result.error === 'full') {
        Alert.alert(S.alias.setup.error, S.alias.setup.teamFullAlert);
      } else {
        console.log('✅ Player joined team:', teamIndex);
      }
    } catch (error) {
      console.error('❌ Error joining team:', error);
      Alert.alert(S.alias.setup.error, S.alias.setup.joinFailed);
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
      Alert.alert(S.alias.setup.error, S.alias.setup.leaveFailed);
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
      Alert.alert(S.alias.setup.error, S.alias.setup.settingsFailed);
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
      Alert.alert(S.alias.setup.error, S.alias.setup.drinkingFailed);
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
      Alert.alert(S.alias.setup.error, S.alias.setup.addTeamFailed);
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
        Alert.alert(S.alias.setup.error, S.alias.setup.removeHasPlayers);
      } else if (result.error === 'min_teams') {
        Alert.alert(S.alias.setup.error, S.alias.setup.minTeams);
      }
    } catch (error) {
      console.error('Error removing team:', error);
      Alert.alert(S.alias.setup.error, S.alias.setup.removeFailed);
    }
  };

  const handleStartGame = async () => {
    if (!isHost || !room) return;
    if (isStartingGame) return;
    setIsStartingGame(true);

    // Golden squares: 10 random positions 1-58 (avoiding start and end)
    const squares = [];
    for (let i = 1; i < 59; i++) squares.push(i);
    const randomGoldenSquares = shuffle(squares).slice(0, 10);

    try {
      const result = await updateTeamsTx((teams, fresh) => {
        // Refuse a second start (double tap)
        if (fresh.game_status && fresh.game_status !== 'setup') return { error: 'started' };

        // Validate on the server copy, so a player who just left is accounted for
        if (teams.filter(t => t.players.length > 0).length < 2) return { error: 'min_teams' };
        const emptyIndex = teams.findIndex(t => t.players.length === 0);
        if (emptyIndex !== -1) return { error: 'empty_team', index: emptyIndex };

        // Random starting team (it used to be team 1 every game)
        const startingTurn = randomInt(teams.length);
        return {
          teams: teams.map(team => ({
            ...team,
            position: team.position !== undefined ? team.position : 0,
            round_start_position: null
          })),
          extra: {
            game_status: 'waiting',
            golden_squares: fresh.golden_rounds_enabled ? randomGoldenSquares : [],
            current_turn: startingTurn,
            starting_turn: startingTurn,
            round_active: false
          }
        };
      });

      if (result.error === 'min_teams') {
        Alert.alert(S.alias.setup.error, S.alias.setup.needTwoTeams);
      } else if (result.error === 'empty_team') {
        Alert.alert(S.alias.setup.error, S.alias.setup.emptyTeam(result.index + 1));
      }
      if (result.error && result.error !== 'started') {
        setIsStartingGame(false);
        return;
      }
      // Navigation will happen automatically via useEffect when game_status changes
      console.log('✅ Game started');
    } catch (error) {
      console.error('Error starting game:', error);
      Alert.alert(S.alias.setup.error, S.alias.setup.startFailed);
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
      <Screen contentStyle={styles.centered}>
        <ActivityIndicator size="large" color={theme.accent} />
        <AppText variant="subtitle" align="center" color={colors.inkSoft}>
          {S.alias.setup.loading}
        </AppText>
      </Screen>
    );
  }

  return (
    <Screen
      header={
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
      }
      footer={<BannerAd />}
    >
      <RulesModal
        visible={showRulesModal}
        onClose={() => setShowRulesModal(false)}
        variant="alias"
      />

      {/* Settings */}
      <Card padding="md" style={styles.section}>
        <View style={styles.toggleRow}>
          <Icon name="drink" size={22} color={colors.ink} />
          <AppText variant="bodyStrong" style={styles.flex}>
            {S.alias.setup.drinking}
          </AppText>
          <Switch
            value={drinkingMode}
            onValueChange={handleToggleDrinkingMode}
            disabled={!isHost}
            accessibilityLabel={S.alias.setup.drinking}
            trackColor={{ false: colors.line, true: theme.accent }}
            thumbColor={colors.card}
          />
        </View>

        {/* Golden Rounds Toggle (Host Only) */}
        {isHost && (
          <View style={styles.toggleRow}>
            <Icon name="golden" size={22} color={colors.goldDeep} />
            <AppText variant="bodyStrong" style={styles.flex}>
              {S.alias.setup.goldenRounds}
            </AppText>
            <Switch
              value={room.golden_rounds_enabled || false}
              onValueChange={handleToggleGoldenRounds}
              accessibilityLabel={S.alias.setup.goldenRounds}
              trackColor={{ false: colors.line, true: colors.gold }}
              thumbColor={colors.card}
            />
          </View>
        )}
      </Card>

      {/* Teams */}
      <View style={styles.sectionHeader}>
        <AppText variant="title" accessibilityRole="header">
          {S.alias.setup.teams}
        </AppText>
        {isHost && (
          <Button title={S.alias.setup.addTeam} icon="plus" size="sm" variant="secondary" onPress={handleAddTeam} />
        )}
      </View>

      {room.teams && Array.isArray(room.teams) && room.teams
        .filter((team) => team != null && typeof team === 'object')
        .map((team, index) => {
          if (!team || typeof team !== 'object') {
            return null;
          }
          const isPlayerInTeam = team.players && Array.isArray(team.players) && team.players.includes(playerName);
          const teamColor = accessibleSurface((team.color && typeof team.color === 'string') ? team.color : TEAM_COLORS[index % TEAM_COLORS.length]);
          const teamName = (team.name && typeof team.name === 'string') ? team.name : S.alias.board.teamFallback(index + 1);
          const playerCount = (team.players && Array.isArray(team.players)) ? team.players.filter(p => p && p.trim().length > 0).length : 0;
          const isTeamFull = playerCount >= 1; // Only one player allowed per team
          const fg = readableOn(teamColor);

          return (
            <View key={`team-${index}`} style={[styles.teamCard, { borderColor: teamColor }]}>
              <View style={[styles.teamHeader, { backgroundColor: teamColor }]}>
                <View style={styles.teamNumber}>
                  <AppText variant="label" color={colors.ink} align="center" maxScale={1.3}>
                    {index + 1}
                  </AppText>
                </View>
                <View style={styles.flex}>
                  <AppText variant="bodyStrong" color={fg} numberOfLines={1}>
                    {teamName}
                  </AppText>
                  <AppText variant="caption" color={fg}>
                    {S.alias.setup.playerCount(playerCount)}
                  </AppText>
                </View>
                {isHost && playerCount === 0 && (
                  <IconButton icon="trash" label={S.alias.setup.removeTeam} onPress={() => handleRemoveTeam(index)} size={touch.min - 4} />
                )}
              </View>

              <View style={styles.teamBody}>
                {team.players && Array.isArray(team.players) && team.players.length > 0 ? (
                  <View style={styles.chips}>
                    {team.players.map((player, playerIndex) => {
                      const playerNameStr = typeof player === 'string' ? player : String(player || '');
                      return (
                        <PlayerChip
                          key={playerIndex}
                          name={playerNameStr}
                          color={teamColor}
                          isHost={playerNameStr === room.host_name}
                          isMe={playerNameStr === playerName}
                          hostLabel={S.common.host}
                          meLabel={S.common.you}
                        />
                      );
                    })}
                  </View>
                ) : (
                  <AppText color={colors.inkSoft}>{S.alias.setup.noPlayers}</AppText>
                )}

                {playerName && (
                  isPlayerInTeam ? (
                    <Button
                      title={S.alias.setup.leaveTeam}
                      icon="exit"
                      variant="secondary"
                      size="sm"
                      onPress={handleLeaveTeam}
                      disabled={isJoiningTeam}
                      fullWidth
                    />
                  ) : isTeamFull ? (
                    <View style={styles.fullRow}>
                      <Icon name="player" size={20} color={colors.inkSoft} />
                      <AppText color={colors.inkSoft}>{S.alias.setup.teamFull}</AppText>
                    </View>
                  ) : (
                    <Button
                      title={S.alias.setup.joinTeam}
                      icon="addPlayer"
                      size="sm"
                      onPress={() => handleJoinTeam(index)}
                      disabled={isJoiningTeam}
                      fullWidth
                    />
                  )
                )}
              </View>
            </View>
          );
        })}

      {/* Start Game Button (Host Only) */}
      {isHost && (
        <Button
          title={isStartingGame ? S.alias.setup.starting : S.alias.setup.startGame}
          icon="play"
          onPress={handleStartGame}
          loading={isStartingGame}
          disabled={isStartingGame || room.game_status !== 'setup'}
          fullWidth
        />
      )}

      {/* Waiting for host */}
      {!isHost && room.game_status === 'setup' && (
        <View style={styles.waitingRow}>
          <Icon name="hourglass" size={22} color={colors.inkSoft} />
          <AppText color={colors.inkSoft}>{S.alias.setup.waitingHost}</AppText>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  section: {
    gap: spacing.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  teamCard: {
    borderRadius: radii.lg,
    borderWidth: 3,
    borderBottomWidth: 6,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  teamHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  teamNumber: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamBody: {
    gap: spacing.md,
    padding: spacing.md,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  fullRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 40,
  },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
});
