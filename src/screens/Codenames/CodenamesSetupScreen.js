import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Alert, ActivityIndicator, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BannerAd from '../../components/shared/BannerAd';
import UnifiedTopBar from '../../components/shared/UnifiedTopBar';
import RulesModal from '../../components/shared/RulesModal';
import TwoPhonesLobby from '../../components/codenames/TwoPhonesLobby';
import { db } from '../../firebase';
import { doc, getDoc, updateDoc, onSnapshot, query, collection, where, getDocs, runTransaction } from 'firebase/firestore';
import storage from '../../utils/storage';
import { shuffle } from '../../utils/random';
import { loadContent } from '../../utils/contentCache';
import { S } from '../../strings';
import { colors, radii, spacing, useGameTheme } from '../../theme';
import { AppText, Badge, Button, Card, Icon, PlayerChip, Screen } from '../../ui';
import { getTeamStyle } from '../../components/codenames/teamStyle';
import { saveCurrentRoom, loadCurrentRoom, clearCurrentRoom } from '../../utils/navigationState';

export default function CodenamesSetupScreen({ navigation, route }) {
  const theme = useGameTheme();
  const roomCode = route?.params?.roomCode || '';
  const gameMode = route?.params?.gameMode || 'friends';
  const insets = useSafeAreaInsets();
  const [room, setRoom] = useState(null);
  const [currentPlayerName, setCurrentPlayerName] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [drinkingMode, setDrinkingMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showRulesModal, setShowRulesModal] = useState(false);
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

      // Load drinking mode from room data (preferred) or local storage (fallback)
      if (existingRoom.drinking_mode !== undefined) {
        setDrinkingMode(existingRoom.drinking_mode);
        // Also sync to local storage
        await storage.setItem('drinkingMode', existingRoom.drinking_mode.toString());
      } else {
        // Fallback to local storage if room doesn't have it yet
        const savedMode = await storage.getItem('drinkingMode');
        if (savedMode) {
          setDrinkingMode(savedMode === 'true');
        }
      }

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
          Alert.alert(S.codenames.setup.error, S.codenames.setup.gameStarted);
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
        
        // Sync drinking mode from room data
        if (updatedRoom.drinking_mode !== undefined) {
          setDrinkingMode(updatedRoom.drinking_mode);
          // Also sync to local storage
          storage.setItem('drinkingMode', updatedRoom.drinking_mode.toString()).catch(() => {});
        }
        
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

  /**
   * Join a team/role. Runs in a transaction and writes only the team fields
   * that actually change (e.g. `red_team.guessers`), so players picking teams
   * at the same moment no longer overwrite each other. (The old version wrote
   * the whole room document back from an earlier read.)
   */
  const joinTeam = async (team, role) => {
    if (!currentPlayerName || !room) return;

    if (!room.id) {
      console.error('❌ Cannot update room: room.id is missing');
      return;
    }

    try {
      const roomRef = doc(db, 'CodenamesRoom', room.id);
      const outcome = await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(roomRef);
        if (!snap.exists()) return 'missing';
        const fresh = snap.data();
        if (fresh.game_status !== 'setup') return 'not_setup';

        const targetKey = `${team}_team`;
        // Don't silently kick out another player who already holds this spymaster slot
        if (role === 'spymaster' && fresh[targetKey]?.spymaster && fresh[targetKey].spymaster !== currentPlayerName) {
          return 'taken';
        }

        const updates = {};
        ['red', 'blue'].forEach((t) => {
          const key = `${t}_team`;
          const teamData = fresh[key] || {};
          const oldSpymaster = teamData.spymaster || '';
          const oldGuessers = teamData.guessers || [];

          // Remove me from this team, then add me back if this is my new place
          let spymaster = oldSpymaster === currentPlayerName ? '' : oldSpymaster;
          let guessers = oldGuessers.filter(p => p !== currentPlayerName);
          if (t === team) {
            if (role === 'spymaster') {
              spymaster = currentPlayerName;
            } else {
              guessers = [...guessers, currentPlayerName];
            }
          }

          if (spymaster !== oldSpymaster) {
            updates[`${key}.spymaster`] = spymaster;
          }
          if (JSON.stringify(guessers) !== JSON.stringify(oldGuessers)) {
            updates[`${key}.guessers`] = guessers;
          }
        });

        if (Object.keys(updates).length > 0) {
          transaction.update(roomRef, updates);
        }
        return 'ok';
      });

      if (outcome === 'taken') {
        Alert.alert(S.codenames.setup.roleTakenTitle, S.codenames.setup.roleTakenBody);
      } else if (outcome === 'missing') {
        Alert.alert(S.codenames.setup.error, S.codenames.setup.roomDeleted);
        navigation.goBack();
      }
    } catch (error) {
      console.error('❌ Error joining team:', error);
      Alert.alert(S.codenames.setup.error, S.codenames.setup.joinFailed);
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
    
    if (!room.red_team.spymaster) missing.push(S.codenames.setup.reqSpymasterRed);
    if (!room.blue_team.spymaster) missing.push(S.codenames.setup.reqSpymasterBlue);
    if (room.red_team.guessers.length < 1) missing.push(S.codenames.setup.reqGuesserRed);
    if (room.blue_team.guessers.length < 1) missing.push(S.codenames.setup.reqGuesserBlue);
    
    return missing;
  };

  const startGame = async () => {
    if (!isHost) {
      Alert.alert(S.codenames.setup.error, S.codenames.setup.hostOnlyStart);
      return;
    }

    if (!canStartGame() && gameMode === 'friends') {
      const missing = getMissingRequirements();
      Alert.alert(S.codenames.setup.cannotStartTitle, S.codenames.setup.missingList(missing));
      return;
    }

    if (!room || !room.id) {
      console.error('❌ Cannot start game: room or room.id is missing');
      Alert.alert(S.codenames.setup.error, S.codenames.setup.roomNotLoaded);
      return;
    }

    // Word list (cached in memory and on the device) - loaded before the transaction
    let selectedWords;
    try {
      const wordDocs = await loadContent('WordCard');
      // A Set: the word list has some duplicate entries, and the same word
      // must never appear on two tiles of one board
      const unique = new Set();
      wordDocs.forEach((d) => {
        const w = d?.word;
        if (typeof w === 'string' && w.trim().length > 0) unique.add(w.trim());
      });
      const validWords = [...unique];

      if (validWords.length < 25) {
        Alert.alert(S.codenames.setup.error, S.codenames.setup.notEnoughWords(validWords.length));
        return;
      }
      selectedWords = shuffle(validWords).slice(0, 25);
    } catch (error) {
      console.error('❌ Error loading words:', error);
      Alert.alert(S.codenames.setup.error, S.codenames.setup.wordsLoadFailed);
      return;
    }

    const startingTeam = Math.random() > 0.5 ? 'red' : 'blue';
    const keyMap = [];
    for (let i = 0; i < 9; i++) keyMap.push(startingTeam);
    for (let i = 0; i < 8; i++) keyMap.push(startingTeam === 'red' ? 'blue' : 'red');
    for (let i = 0; i < 7; i++) keyMap.push('neutral');
    keyMap.push('black');
    // Fair shuffle: the old random sort made some tiles likelier to be the assassin
    keyMap.splice(0, keyMap.length, ...shuffle(keyMap));

    try {
      const roomRef = doc(db, 'CodenamesRoom', room.id);
      const outcome = await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(roomRef);
        if (!snap.exists()) return 'missing';
        const fresh = snap.data();
        // Refuse a second start: it would deal a different board/key map
        if (fresh.game_status !== 'setup') return 'not_setup';

        transaction.update(roomRef, {
          // Field paths: clear reveals without overwriting team membership
          'red_team.revealed_words': [],
          'blue_team.revealed_words': [],
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
          drinking_popup: null,
          // Use the room's drinking setting (shared by everyone), not this device's storage
          round_baseline_reveals: fresh.drinking_mode === true ? { red: 0, blue: 0 } : null
        });
        return 'ok';
      });

      if (outcome === 'not_setup') {
        // Already started (e.g. double tap) - just go to the game
        navigation.navigate('CodenamesGame', { roomCode });
        return;
      }
      if (outcome !== 'ok') return;

      console.log('✅ Game started successfully with fresh state');
      const { logGameStart } = await import('../../utils/analytics');
      logGameStart('codenames', room.id);
      navigation.navigate('CodenamesGame', { roomCode });
    } catch (error) {
      console.error('❌ Error starting game:', error);
      Alert.alert(S.codenames.setup.error, S.codenames.setup.startFailed);
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
      <Screen contentStyle={styles.centered}>
        <ActivityIndicator size="large" color={theme.accent} />
        <AppText variant="subtitle" align="center" color={colors.inkSoft}>
          {S.codenames.setup.loading}
        </AppText>
      </Screen>
    );
  }

  // Two phones mode (clue-givers phone + guessers phone) has its own lobby
  if (room.play_mode === 'two_phones') {
    return (
      <TwoPhonesLobby
        room={room}
        roomCode={roomCode}
        playerName={currentPlayerName}
        isHost={isHost}
        onStart={startGame}
        onExit={goBack}
      />
    );
  }

  const playerRole = getPlayerRole();
  const isRivalsMode = room.game_mode === 'rivals';
  const missingRequirements = getMissingRequirements();
  const canStart = canStartGame();

  // One team's card: header (icon + name), then spymaster and guesser sections
  const renderTeam = (color) => {
    const t = getTeamStyle(color);
    const team = color === 'red' ? room.red_team : room.blue_team;
    const spymasterName = team.spymaster
      ? (typeof team.spymaster === 'string' ? team.spymaster : String(team.spymaster || ''))
      : '';

    return (
      <View key={color} style={[styles.teamCard, { borderColor: t.fill }]}>
        <View style={[styles.teamHeader, { backgroundColor: t.fill }]}>
          <Icon name={t.icon} size={26} color={colors.white} />
          <AppText variant="title" color={colors.white} accessibilityRole="header">
            {S.codenames.setup.teamTitle(color)}
          </AppText>
        </View>

        <View style={styles.teamBody}>
          {/* Spymaster */}
          <View style={styles.roleSection}>
            <View style={styles.roleLabel}>
              <Icon name="spy" size={20} color={colors.inkSoft} />
              <AppText variant="label" color={colors.inkSoft}>
                {S.codenames.setup.spymasterRole}
              </AppText>
            </View>
            {spymasterName ? (
              <PlayerChip
                name={spymasterName}
                color={t.fill}
                isMe={playerRole?.team === color && playerRole?.role === 'spymaster'}
                meLabel={S.codenames.teams.youAreHere}
              />
            ) : (
              <AppText color={colors.inkSoft}>{S.codenames.setup.waitingSpymaster}</AppText>
            )}
            {(!playerRole || playerRole.team !== color || playerRole.role !== 'spymaster') && (
              <Button
                title={S.codenames.setup.joinSpymaster}
                icon="spy"
                variant="secondary"
                size="sm"
                onPress={() => joinTeam(color, 'spymaster')}
                disabled={team.spymaster !== '' && team.spymaster !== currentPlayerName}
                fullWidth
              />
            )}
          </View>

          {/* Guessers */}
          <View style={styles.roleSection}>
            <View style={styles.roleLabel}>
              <Icon name="players" size={20} color={colors.inkSoft} />
              <AppText variant="label" color={colors.inkSoft}>
                {S.codenames.setup.guessersRole(team.guessers.length)}
              </AppText>
            </View>
            {team.guessers.length > 0 ? (
              <View style={styles.chips}>
                {team.guessers
                  .filter((player) => player != null)
                  .map((player, idx) => {
                    const playerName = typeof player === 'string' ? player : String(player || '');
                    return (
                      <PlayerChip
                        key={`${color}-guesser-${idx}`}
                        name={playerName}
                        color={t.fill}
                        isMe={playerName === currentPlayerName}
                        meLabel={S.codenames.teams.youAreHere}
                      />
                    );
                  })}
              </View>
            ) : (
              <AppText color={colors.inkSoft}>{S.codenames.setup.waitingGuessers}</AppText>
            )}
            {(!playerRole || playerRole.team !== color || playerRole.role !== 'guesser') && (
              <Button
                title={S.codenames.setup.joinGuesser}
                icon="players"
                variant="secondary"
                size="sm"
                onPress={() => joinTeam(color, 'guesser')}
                fullWidth
              />
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <Screen
      header={
        <UnifiedTopBar
          roomCode={roomCode}
          variant="codenames"
          onExit={goBack}
          onRulesPress={() => setShowRulesModal(true)}
          drinkingMode={drinkingMode}
          showRules={true}
        />
      }
      footer={<BannerAd />}
    >
      {/* Rivals Mode Badge */}
      {isRivalsMode && <Badge label={S.codenames.setup.rivalsBadge} icon="target" tone="neutral" />}

      <RulesModal
        visible={showRulesModal}
        onClose={() => setShowRulesModal(false)}
        variant="codenames"
      />

      <Card style={styles.section}>
        <View style={styles.titleRow}>
          <Icon name="players" size={26} color={theme.accentInk} />
          <AppText variant="title" color={theme.accentInk} accessibilityRole="header">
            {S.codenames.setup.title}
          </AppText>
        </View>

        {isHost && (
          <Card tone="tint" padding="md" style={styles.section}>
            <View style={styles.titleRow}>
              <Icon name="crown" size={22} color={colors.goldDeep} />
              <AppText variant="bodyStrong" style={styles.flexShrink}>
                {S.codenames.setup.hello(currentPlayerName)} {S.codenames.setup.hostTag}
              </AppText>
            </View>
            <AppText variant="caption" color={colors.inkSoft}>
              {isRivalsMode ? S.codenames.setup.hostHintRivals : S.codenames.setup.hostHint}
            </AppText>
            <View style={styles.toggleRow}>
              <Icon name="drink" size={22} color={colors.ink} />
              <AppText variant="bodyStrong" style={styles.flex}>
                {S.codenames.setup.drinkingToggle}
              </AppText>
              <Switch
                value={drinkingMode}
                accessibilityLabel={S.codenames.setup.drinkingToggle}
                trackColor={{ false: colors.line, true: theme.accent }}
                thumbColor={colors.card}
                onValueChange={async (checked) => {
                  setDrinkingMode(checked);
                  try {
                    // Save to local storage
                    await storage.setItem('drinkingMode', checked.toString());

                    // Save to Firestore room data so all players see it
                    if (room && room.id) {
                      const roomRef = doc(db, 'CodenamesRoom', room.id);
                      await updateDoc(roomRef, {
                        drinking_mode: checked
                      });
                      console.log('✅ Drinking mode updated:', checked);
                    }
                  } catch (error) {
                    console.error('Error saving drinking mode:', error);
                    setDrinkingMode(!checked); // Revert on error
                    Alert.alert(S.codenames.setup.error, S.codenames.setup.drinkingFailed);
                  }
                }}
              />
            </View>
          </Card>
        )}

        {!isHost && (
          <View style={styles.section}>
            <AppText variant="subtitle">{S.codenames.setup.hello(currentPlayerName)}</AppText>
            {drinkingMode ? <Badge label={S.codenames.setup.drinkingActive} icon="drink" tone="gold" /> : null}
            <AppText color={colors.inkSoft}>
              {isRivalsMode ? S.codenames.setup.waitingAuto : S.codenames.setup.chooseRole}
            </AppText>
          </View>
        )}

        {!isRivalsMode && (
          <View style={styles.section}>
            {renderTeam('red')}
            {renderTeam('blue')}
          </View>
        )}

        {isRivalsMode && (
          <Card tone="tint" style={styles.section}>
            <View style={styles.titleRow}>
              <Icon name="hourglass" size={24} color={colors.inkSoft} />
              <AppText variant="title">{S.codenames.setup.rivalsWaitingTitle}</AppText>
            </View>
            <AppText color={colors.inkSoft}>{S.codenames.setup.rivalsWaitingSub}</AppText>
          </Card>
        )}

        {isHost && (
          <View style={styles.section}>
            <Button
              title={S.codenames.setup.startGame}
              icon="play"
              onPress={startGame}
              disabled={!canStart && !isRivalsMode}
              fullWidth
            />
            {canStart && !isRivalsMode && (
              <Badge label={S.codenames.setup.ready} icon="checkCircle" tone="success" />
            )}
            {!canStart && !isRivalsMode && missingRequirements.length > 0 && (
              <View style={styles.warning}>
                <View style={styles.titleRow}>
                  <Icon name="alert" size={22} color={colors.dangerDeep} />
                  <AppText variant="bodyStrong" color={colors.dangerDeep}>
                    {S.codenames.setup.cannotStart}
                  </AppText>
                </View>
                <AppText variant="caption" color={colors.inkSoft}>{S.codenames.setup.missingLabel}</AppText>
                {missingRequirements.map((req, idx) => (
                  <AppText key={idx} color={colors.ink}>
                    • {req}
                  </AppText>
                ))}
              </View>
            )}
            {isRivalsMode && (
              <Badge label={S.codenames.setup.rivalsInfo} icon="info" tone="neutral" />
            )}
          </View>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  flexShrink: {
    flexShrink: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  section: {
    gap: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
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
    gap: spacing.sm,
    padding: spacing.md,
  },
  teamBody: {
    gap: spacing.lg,
    padding: spacing.md,
  },
  roleSection: {
    gap: spacing.sm,
  },
  roleLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  warning: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.danger,
    backgroundColor: colors.dangerTint,
  },
});
