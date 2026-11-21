import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Pressable, Alert, ActivityIndicator, Switch, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BannerAd from '../../components/shared/BannerAd';
import UnifiedTopBar from '../../components/shared/UnifiedTopBar';
import RulesModal from '../../components/shared/RulesModal';
import { db, waitForFirestoreReady } from '../../firebase';
import { doc, getDoc, updateDoc, onSnapshot, collection, getDocs, runTransaction, arrayUnion, arrayRemove } from 'firebase/firestore';
import { atomicPlayerJoin } from '../../utils/playerJoin';
import storage from '../../utils/storage';
import { saveCurrentRoom, loadCurrentRoom, clearCurrentRoom } from '../../utils/navigationState';
import { setupGameEndDeletion, setupAllAutoDeletions } from '../../utils/roomManagement';
import { showInterstitialIfAvailable } from '../../utils/interstitialAd';
import { getActivePlayers, getActingHostName, markPlayerInactive } from '../../utils/gameSync';
import Animated, { FlipInEasyY, useReducedMotion } from 'react-native-reanimated';
import { S } from '../../strings';
import { colors, motion, radii, spacing, useGameTheme } from '../../theme';
import { AppText, Badge, Button, Card, Icon, PlayerChip, Screen, TextField, TimerDisplay, feedback } from '../../ui';
import { REPEAT_SPY_WEIGHT, pickFresh, remember, weightedSample } from '../../utils/random';
import { dealRoles } from '../../logic/spyLocal';
import { serverNow, syncServerClock } from '../../utils/serverClock';

const GAME_SECONDS = 360; // 6 minutes
// If the acting host's phone is asleep, any player may end an overdue game
// after this grace period (the transaction makes duplicate attempts harmless).
const OVERDUE_GRACE_SECONDS = 5;

// Actual number of spies in the current game (may be lower than the lobby setting)
const getSpyCount = (roomData) =>
  (Array.isArray(roomData?.spy_names) && roomData.spy_names.length) || roomData?.number_of_spies || 1;

// Votes each player must cast: one per spy, but never more than the number of
// other active players (otherwise voting could never complete after people leave).
const getRequiredVotes = (roomData) => {
  const others = getActivePlayers(roomData).length - 1;
  return Math.max(1, Math.min(getSpyCount(roomData), others));
};

// Voting is complete when every *active* player has cast all their votes.
const allActiveVoted = (roomData) => {
  const active = getActivePlayers(roomData);
  const required = getRequiredVotes(roomData);
  return active.length > 0 && active.every(p => (p.votes || []).length >= required);
};

// A game is identified by its start time; used inside transactions so a stale
// device can't end or vote in a newer game.
const isSameGame = (a, b) => (a?.game_start_time ?? null) === (b?.game_start_time ?? null);

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
  const lastResetTriggerRef = useRef(null); // Track last reset trigger to show ad once per reset
  const latestRoomRef = useRef(null); // Latest room for timers/listeners (avoids stale closures)
  const currentPlayerNameRef = useRef('');
  const isEndingGameRef = useRef(false);
  const isVotingRef = useRef(false);

  useEffect(() => {
    latestRoomRef.current = room;
  }, [room]);

  // Measure this device's offset from the server clock once, so timers and
  // time-based points use the same clock on every phone
  useEffect(() => {
    if (room?.id) {
      syncServerClock('SpyRoom', room.id);
    }
  }, [room?.id]);

  useEffect(() => {
    currentPlayerNameRef.current = currentPlayerName;
  }, [currentPlayerName]);

  const theme = useGameTheme();
  const reducedMotion = useReducedMotion();

  // Haptic cues: card dealt / game over (no-op on web)
  useEffect(() => {
    if (room?.game_status === 'playing') feedback.reveal();
    if (room?.game_status === 'finished') feedback.success();
  }, [room?.game_status]);

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
            Alert.alert(S.common.error, S.spy.room.missingRoomCode);
            navigation.goBack();
            return;
          }
        } catch (error) {
          console.warn('⚠️ Error restoring room:', error);
          await clearCurrentRoom();
          Alert.alert(S.common.error, S.spy.room.missingRoomCode);
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
      // Mark as inactive so voting doesn't wait for a player who left
      const current = latestRoomRef.current;
      const me = currentPlayerNameRef.current;
      if (current?.id && me) {
        markPlayerInactive('SpyRoom', current.id, me).catch(err => {
          console.error('Error marking player as inactive:', err);
        });
      }
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

      const updateTimer = () => {
        const current = latestRoomRef.current;
        if (!current?.game_start_time) return;
        const elapsedMs = serverNow() - current.game_start_time;
        setTimeLeft(Math.max(0, GAME_SECONDS - Math.floor(elapsedMs / 1000)));

        // Only the acting host ends the game on time; others take over if the
        // host's phone is asleep and the game is overdue. Keep ticking until the
        // status actually changes so the fallback can kick in.
        if (elapsedMs >= GAME_SECONDS * 1000) {
          const overdue = elapsedMs >= (GAME_SECONDS + OVERDUE_GRACE_SECONDS) * 1000;
          if (getActingHostName(current) === currentPlayerNameRef.current || overdue) {
            endGame('timer');
          }
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
        Alert.alert(S.common.error, S.spy.room.roomNotFound);
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
          Alert.alert(S.common.error, S.spy.room.gameStarted);
          navigation.goBack();
          return;
        }
        // Returning player who had left - mark active again
        const existing = roomData.players.find(p => p && p.name === playerName);
        if (existing && existing.active === false) {
          const result = await atomicPlayerJoin(
            'SpyRoom',
            roomData.id,
            playerName,
            null,
            (players, name) => players.findIndex(p => p && p.name === name),
            (p) => ({ ...p, active: true })
          );
          if (result.success && result.roomData) {
            setRoom(result.roomData);
            return;
          }
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
          (p) => (p.active === false ? { ...p, active: true } : null), // Reactivate a returning player
          3 // maxRetries
        );
        
        if (result.success && result.roomData) {
          console.log('✅ Player joined Spy room successfully:', playerName);
          setRoom(result.roomData);
          return;
        } else {
          console.error('❌ Failed to join Spy room:', result.error);
          Alert.alert(S.common.error, S.spy.room.joinFailed);
          navigation.goBack();
          return;
        }
      }
      setRoom(roomData);
    } catch (error) {
      console.error('❌ Error loading room:', error);
      Alert.alert(S.common.error, S.spy.room.loadFailed);
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
        
        // Handle reset trigger for showing ad to all players (non-host)
        if (newRoom.reset_triggered_at && 
            newRoom.reset_triggered_at !== lastResetTriggerRef.current &&
            newRoom.game_status === 'lobby' &&
            newRoom.host_name !== currentPlayerNameRef.current) {
          lastResetTriggerRef.current = newRoom.reset_triggered_at;
          // Show ad to non-host players when host resets
          showInterstitialIfAvailable(() => {
            // Ad closed, continue normally
          });
        }
        
        setRoom(prevRoom => {
          if (!prevRoom) {
            // Update numberOfSpies when room is first loaded
            if (newRoom.number_of_spies !== undefined && newRoom.number_of_spies !== null) {
              setNumberOfSpies(newRoom.number_of_spies);
            }
            return newRoom;
          }
          
          // Always apply the server state. (A previous "block critical changes"
          // check here could leave a player on a different spy/location than
          // everyone else if the game was started twice.)
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

  // End the game once voting is complete. Re-evaluated whenever the room
  // changes, so it also fires when the last missing voter *leaves*.
  // Any device may trigger it; the transaction re-checks on the server.
  useEffect(() => {
    if (!room || room.game_status !== 'playing') return;
    if (room.all_votes_submitted === true || allActiveVoted(room)) {
      endGame('votes');
    }
  }, [room]);

  const startGame = async () => {
    const currentRoom = room;
    if (!currentRoom || !currentRoom.id || currentRoom.host_name !== currentPlayerName) return;

    if (getActivePlayers(currentRoom).length < 3) {
      Alert.alert(S.common.error, S.spy.room.needThree);
      return;
    }

    if (currentRoom.game_status !== 'lobby') {
      console.warn('⚠️ Cannot start game - room is not in lobby state:', currentRoom.game_status);
      Alert.alert(S.common.error, S.spy.room.notReady);
      return;
    }

    const currentGameMode = currentRoom.game_mode || 'locations';

    // Content queries can't run inside a transaction - load them first
    let randomLocation = null;
    let allLocationNames = [];
    let randomWord = '';

    try {
      if (currentGameMode === 'locations') {
        const locations = [];
        const locationsSnapshot = await getDocs(collection(db, 'SpyLocation'));
        locationsSnapshot.forEach((d) => locations.push({ id: d.id, ...d.data() }));
        const valid = locations.filter(l => l && l.location && Array.isArray(l.roles) && l.roles.length > 0);
        if (valid.length === 0) {
          Alert.alert(S.common.error, S.spy.room.noLocations);
          return;
        }
        randomLocation = pickFresh(valid, currentRoom.recent_secrets, (l) => l.location);
        allLocationNames = locations.map(loc => loc.location).filter(loc => loc != null);
      } else {
        const words = [];
        const wordsSnapshot = await getDocs(collection(db, 'WordCard'));
        wordsSnapshot.forEach((d) => {
          const w = d.data()?.word;
          if (typeof w === 'string' && w.trim().length > 0) words.push(w.trim());
        });
        if (words.length === 0) {
          Alert.alert(S.common.error, S.spy.room.noWords);
          return;
        }
        randomWord = pickFresh(words, currentRoom.recent_secrets);
      }
    } catch (error) {
      console.error('❌ Error loading game content:', error);
      Alert.alert(S.common.error, S.spy.room.contentLoadFailed);
      return;
    }

    try {
      const roomDocRef = doc(db, 'SpyRoom', currentRoom.id);
      const outcome = await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(roomDocRef);
        if (!snap.exists()) return 'missing';
        const fresh = snap.data();
        // Guard against double-start: a second start would deal different
        // spies/roles and players could end up seeing different games
        if (fresh.game_status !== 'lobby') return 'not_lobby';

        const allPlayers = (fresh.players || []).filter(p => p && p.name);
        const active = allPlayers.filter(p => p.active !== false);
        if (active.length < 3) return 'not_enough';

        // Spies are chosen among active players only; at most half of them
        const maxSpies = Math.max(1, Math.floor(active.length / 2));
        const actualNumSpies = Math.min(fresh.number_of_spies || 1, maxSpies);
        // Fair pick (the old random sort favoured the first players). Last
        // game's spies are less likely, never excluded.
        const previousSpies = new Set(fresh.recent_spies || []);
        const spyNames = weightedSample(active, actualNumSpies, p => (previousSpies.has(p.name) ? REPEAT_SPY_WEIGHT : 1))
          .map(p => p.name);
        const spySet = new Set(spyNames);
        const roleDeck = currentGameMode === 'locations' ? dealRoles(randomLocation.roles, active.length - spySet.size) : [];

        const updatedPlayers = allPlayers.map(player => {
          if (player.active === false) {
            return { name: player.name, active: false }; // Sits this game out
          }
          if (spySet.has(player.name)) {
            return { name: player.name, is_spy: true, location: '', role: '', votes: [] };
          }
          if (currentGameMode === 'locations') {
            const roles = randomLocation.roles;
            return {
              name: player.name,
              is_spy: false,
              location: randomLocation.location,
              role: roleDeck.pop() || roles[0],
              votes: []
            };
          }
          // Word mode: all non-spies get the same word (stored in `location`), no role
          return { name: player.name, is_spy: false, location: randomWord, role: '', votes: [] };
        });

        transaction.update(roomDocRef, {
          players: updatedPlayers,
          game_status: 'playing',
          game_start_time: serverNow(),
          spy_name: spyNames.length === 1 ? spyNames[0] : '', // Backward compatibility
          spy_names: spyNames,
          // Kept across resets to avoid repeats in the next game
          recent_spies: spyNames,
          recent_secrets: remember(fresh.recent_secrets, currentGameMode === 'locations' ? randomLocation.location : randomWord),
          chosen_location: currentGameMode === 'locations' ? randomLocation.location : randomWord,
          all_locations: currentGameMode === 'locations' ? allLocationNames : [],
          eliminated_locations: [],
          all_votes_submitted: false,
          spy_guess: null,
          spy_guess_correct: null,
          spy_guess_player: null
        });
        return 'ok';
      });

      if (outcome === 'not_enough') {
        Alert.alert(S.common.error, S.spy.room.needThree);
        return;
      }
      if (outcome === 'ok') {
        console.log('✅ Game started successfully with fresh state');
        const { logGameStart } = await import('../../utils/analytics');
        logGameStart('spy', currentRoom.id);
      }
    } catch (error) {
      console.error('❌ Error starting game:', error);
      Alert.alert(S.common.error, S.spy.room.startFailed);
    }
  };

  const toggleLocationEliminated = async (locationName) => {
    if (!room || room.game_status !== 'playing' || !isSpy) return;

    const eliminated = room.eliminated_locations || [];
    try {
      const roomDocRef = doc(db, 'SpyRoom', room.id);
      // arrayUnion/arrayRemove change one element server-side, so two spies
      // marking locations at the same time don't overwrite each other
      await updateDoc(roomDocRef, {
        eliminated_locations: eliminated.includes(locationName)
          ? arrayRemove(locationName)
          : arrayUnion(locationName)
      });
    } catch (error) {
      console.error('❌ Error updating eliminated locations:', error);
    }
  };

  const voteForPlayer = async (votedPlayerName) => {
    if (!room || !room.id || room.game_status !== 'playing' || !currentPlayerName) return;
    if (isVotingRef.current) return;
    isVotingRef.current = true;

    const gameAtVote = { game_start_time: room.game_start_time };

    try {
      const roomDocRef = doc(db, 'SpyRoom', room.id);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(roomDocRef);
        if (!snap.exists()) return;
        const fresh = snap.data();
        if (fresh.game_status !== 'playing' || !isSameGame(fresh, gameAtVote)) return;

        const players = fresh.players || [];
        const myIndex = players.findIndex(p => p && p.name === currentPlayerName);
        if (myIndex === -1) return;

        // Toggle: remove if already voted for them, otherwise add (up to the limit)
        const currentVotes = players[myIndex].votes || [];
        let updatedVotes;
        if (currentVotes.includes(votedPlayerName)) {
          updatedVotes = currentVotes.filter(v => v !== votedPlayerName);
        } else if (currentVotes.length < getRequiredVotes(fresh)) {
          updatedVotes = [...currentVotes, votedPlayerName];
        } else {
          return; // Already at limit
        }

        // Change only *my* votes, on top of the server's latest players array,
        // so simultaneous votes from other players are never lost
        const updatedPlayers = players.map((p, i) => (i === myIndex ? { ...p, votes: updatedVotes } : p));
        transaction.update(roomDocRef, {
          players: updatedPlayers,
          all_votes_submitted: allActiveVoted({ ...fresh, players: updatedPlayers })
        });
      });
    } catch (error) {
      console.error('❌ Error submitting vote:', error);
    } finally {
      isVotingRef.current = false;
    }
  };

  const submitSpyGuess = async (guess) => {
    if (!room || room.game_status !== 'playing' || !currentPlayerName || !isSpy) return;
    if (!guess || !guess.trim()) {
      Alert.alert(S.common.error, S.spy.room.enterGuess);
      return;
    }

    if (room.spy_guess) {
      Alert.alert(S.common.error, S.spy.room.alreadyGuessed);
      return;
    }

    const trimmedGuess = guess.trim();
    const isWordMode = room.game_mode === 'word';
    const gameAtGuess = { game_start_time: room.game_start_time };
    setSpyGuessSubmitted(true);

    try {
      const roomDocRef = doc(db, 'SpyRoom', room.id);
      const result = await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(roomDocRef);
        if (!snap.exists()) return { outcome: 'missing' };
        const fresh = snap.data();
        if (fresh.game_status !== 'playing' || !isSameGame(fresh, gameAtGuess)) return { outcome: 'over' };
        // With several spies, only the first guess counts
        if (fresh.spy_guess) return { outcome: 'already' };

        const correctAnswer = fresh.chosen_location || '';
        const isCorrect = trimmedGuess.toLowerCase() === correctAnswer.toLowerCase();
        transaction.update(roomDocRef, {
          spy_guess: trimmedGuess,
          spy_guess_correct: isCorrect,
          spy_guess_player: currentPlayerName,
          game_status: 'finished'
        });
        return { outcome: isCorrect ? 'correct' : 'wrong', correctAnswer };
      });

      const what = isWordMode ? S.spy.room.answerWord : S.spy.room.answerLocation;
      if (result.outcome === 'correct') {
        Alert.alert(S.spy.room.winTitle, S.spy.room.winBody(what, result.correctAnswer));
      } else if (result.outcome === 'wrong') {
        Alert.alert(S.spy.room.wrongTitle, S.spy.room.wrongBody(what, result.correctAnswer));
      } else if (result.outcome === 'already') {
        Alert.alert(S.spy.room.heads, S.spy.room.otherSpyGuessed);
      } else if (result.outcome === 'over') {
        Alert.alert(S.spy.room.heads, S.spy.room.gameAlreadyOver);
      }
    } catch (error) {
      console.error('❌ Error submitting spy guess:', error);
      setSpyGuessSubmitted(false);
      Alert.alert(S.common.error, S.spy.room.guessFailed);
    }
  };

  /**
   * End the current game.
   * reason: 'manual' (host button), 'timer' (time is up), 'votes' (everyone voted).
   * Runs in a transaction keyed on game_start_time, so a stale device can't
   * end a newer game, and 'votes' is re-verified against the server's votes.
   */
  const endGame = async (reason = 'manual') => {
    const current = latestRoomRef.current;
    const me = currentPlayerNameRef.current;
    if (!current || !current.id || current.game_status !== 'playing') return;

    if (reason === 'manual' && getActingHostName(current) !== me) {
      console.log('❌ Only host can end the game manually');
      return;
    }
    if (isEndingGameRef.current) return;
    isEndingGameRef.current = true;

    const gameAtCall = { game_start_time: current.game_start_time };

    try {
      const roomDocRef = doc(db, 'SpyRoom', current.id);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(roomDocRef);
        if (!snap.exists()) return;
        const fresh = snap.data();
        if (fresh.game_status !== 'playing' || !isSameGame(fresh, gameAtCall)) return;
        if (reason === 'votes' && !allActiveVoted(fresh)) return; // Someone changed their vote
        transaction.update(roomDocRef, { game_status: 'finished' });
      });
      console.log(`✅ Game ended (${reason})`);
    } catch (error) {
      console.error('❌ Error ending game:', error);
      if (reason === 'manual') {
        Alert.alert(S.common.error, S.spy.room.endFailed);
      }
    } finally {
      isEndingGameRef.current = false;
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
    
    // Keep players who left marked inactive so they don't count in the next game
    const resetPlayers = room.players.map(p => (p.active === false ? { name: p.name, active: false } : { name: p.name }));
    
    try {
      // Update game state FIRST - this moves all players to lobby screen
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
        spy_guess_player: null,
        reset_triggered_at: Date.now() // Signal to other players to show ad
        // Note: game_mode is preserved when resetting
      });
      // Reset local state
      setSpyGuess('');
      setSpyGuessSubmitted(false);
      console.log('✅ Game reset successfully - all state cleared');

      // Show ad AFTER state is updated - all players are now on lobby screen
      showInterstitialIfAvailable(() => {
        // Ad closed, continue normally
      });
    } catch (error) {
      console.error('❌ Error resetting game:', error);
      Alert.alert(S.common.error, S.spy.room.resetFailed);
    }
  };

  const handleRulesPress = () => {
    setShowRulesModal(true);
  };

  const goBack = async () => {
    // Show interstitial ad before navigating to main menu
    showInterstitialIfAvailable(async () => {
      // Mark as inactive so voting doesn't wait for us
      if (room?.id && currentPlayerName) {
        try {
          await markPlayerInactive('SpyRoom', room.id, currentPlayerName);
        } catch (err) {
          console.error('Error marking player as inactive:', err);
        }
      }

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
    });
  };

  if (error) {
    return (
      <Screen contentStyle={styles.centered}>
        <Card style={styles.stateCard}>
          <Icon name="alert" size={40} color={colors.danger} />
          <AppText variant="title" align="center">
            {S.spy.room.loadErrorTitle}
          </AppText>
          <AppText align="center" color={colors.inkSoft}>
            {S.spy.room.loadErrorMessage}
          </AppText>
          <Button
            title={S.common.back}
            icon="back"
            fullWidth
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
          />
        </Card>
      </Screen>
    );
  }

  if (isLoading || !room) {
    return (
      <Screen contentStyle={styles.centered}>
        <ActivityIndicator size="large" color={theme.accent} />
        <AppText variant="subtitle" align="center" color={colors.inkSoft}>
          {S.spy.room.loading}
        </AppText>
      </Screen>
    );
  }

  const isHost = room?.host_name === currentPlayerName;
  const players = room?.players && Array.isArray(room.players) ? room.players : [];
  const currentPlayer = players.find(p => p && p.name === currentPlayerName);
  const isSpy = currentPlayer?.is_spy || false;
  const myVotes = currentPlayer?.votes || []; // Array of votes
  const numSpies = getSpyCount(room);
  const requiredVotes = getRequiredVotes(room);
  const activePlayers = getActivePlayers(room);
  const isActingHost = !!currentPlayerName && getActingHostName(room) === currentPlayerName;
  const isWordMode = room.game_mode === 'word';

  return (
    <Screen
      header={
        <UnifiedTopBar
          roomCode={roomCode}
          variant="spy"
          onExit={goBack}
          onRulesPress={handleRulesPress}
          drinkingMode={drinkingMode}
        />
      }
      footer={<BannerAd />}
    >
      <RulesModal
        visible={showRulesModal}
        onClose={() => setShowRulesModal(false)}
        variant="spy"
        gameMode={room?.game_mode || 'locations'}
      />

      {/* Lobby State */}
      {room.game_status === 'lobby' && (
        <Card style={styles.section}>
          <View style={styles.titleRow}>
            <Icon name="players" size={26} color={theme.accentInk} />
            <AppText variant="title" color={theme.accentInk} accessibilityRole="header">
              {S.spy.room.lobbyTitle}
            </AppText>
          </View>

          {/* Current game mode, for everyone */}
          {room?.game_mode && (
            <Badge label={S.spy.room.gameModeInfo(room.game_mode === 'word')} icon={room.game_mode === 'word' ? 'card' : 'location'} tone="tint" />
          )}

          {isHost && (
            <Card tone="tint" padding="md" style={styles.section}>
              <Badge label={S.spy.room.youAreHost} icon="crown" tone="gold" />

              <View style={styles.toggleRow}>
                <Icon name="drink" size={22} color={colors.ink} />
                <AppText variant="bodyStrong" style={styles.flex}>
                  {S.spy.room.drinkingToggle}
                </AppText>
                <Switch
                  value={drinkingMode}
                  accessibilityLabel={S.spy.room.drinkingToggle}
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
                      Alert.alert(S.common.error, S.spy.room.drinkingUpdateFailed);
                    }
                  }}
                  trackColor={{ false: colors.line, true: theme.accent }}
                  thumbColor={colors.card}
                />
              </View>

              {/* Game Mode Selection */}
              <View style={styles.setting}>
                <AppText variant="label" color={colors.inkSoft}>
                  {S.spy.room.gameModeLabel}
                </AppText>
                <View style={styles.segmented} accessibilityRole="radiogroup">
                  {[
                    { value: 'locations', label: S.spy.room.modeLocations, icon: 'location' },
                    { value: 'word', label: S.spy.room.modeWord, icon: 'card' }
                  ].map((mode) => {
                    const isSelected = gameMode === mode.value;
                    return (
                      <Pressable
                        key={mode.value}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={mode.label}
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
                        style={[styles.segment, isSelected && { backgroundColor: theme.accent, borderColor: theme.accentDeep }]}
                      >
                        <Icon name={isSelected ? 'check' : mode.icon} size={20} color={isSelected ? theme.onAccent : theme.accentInk} />
                        <AppText variant="bodyStrong" color={isSelected ? theme.onAccent : theme.accentInk}>
                          {mode.label}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
                <AppText variant="caption" color={colors.inkSoft}>
                  {gameMode === 'locations' ? S.spy.room.modeLocationsHint : S.spy.room.modeWordHint}
                </AppText>
              </View>

              {/* Number of Spies Selection */}
              <View style={styles.setting}>
                <AppText variant="label" color={colors.inkSoft}>
                  {S.spy.room.spiesLabel}
                </AppText>
                <View style={styles.countRow} accessibilityRole="radiogroup">
                  {[1, 2, 3, 4].map((num) => {
                    const maxSpies = Math.max(1, Math.floor(players.length / 2));
                    const isDisabled = num > maxSpies || num > players.length;
                    const isSelected = numberOfSpies === num;
                    return (
                      <Pressable
                        key={num}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: isSelected, disabled: isDisabled }}
                        accessibilityLabel={S.spy.room.spiesHint(num)}
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
                          styles.countToken,
                          isSelected && { backgroundColor: theme.accent, borderColor: theme.accentDeep },
                          isDisabled && styles.disabled,
                        ]}
                      >
                        <AppText variant="title" align="center" color={isSelected ? theme.onAccent : colors.ink} maxScale={1.3}>
                          {num}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
                <AppText variant="caption" color={colors.inkSoft}>
                  {S.spy.room.spiesHint(numberOfSpies)}
                </AppText>
              </View>
            </Card>
          )}

          {/* Number of spies for non-host players (game mode shown above) */}
          {!isHost && room?.number_of_spies ? (
            <Badge label={S.spy.room.spiesInfo(room.number_of_spies)} icon="spy" tone="tint" />
          ) : null}

          {!isHost && room?.drinking_mode === true && (
            <Badge label={S.spy.room.drinkingActive} icon="drink" tone="gold" />
          )}

          <AppText variant="subtitle">{S.spy.room.greeting(currentPlayerName)}</AppText>

          <AppText variant="label" color={colors.inkSoft}>
            {S.spy.room.playersInRoom(activePlayers.length)}
          </AppText>
          <View style={styles.chips}>
            {activePlayers.map((player, idx) => {
              const playerName = typeof player.name === 'string' ? player.name : String(player.name || '');
              return (
                <PlayerChip
                  key={`player-${idx}`}
                  name={playerName}
                  color={PLAYER_TOKEN_COLORS[idx % PLAYER_TOKEN_COLORS.length]}
                  isHost={playerName === room?.host_name}
                  isMe={playerName === currentPlayerName}
                  hostLabel={S.common.host}
                  meLabel={S.common.you}
                />
              );
            })}
          </View>

          {isHost && (
            <Button
              title={S.spy.room.startGame}
              icon="play"
              onPress={startGame}
              disabled={activePlayers.length < 3}
              fullWidth
            />
          )}

          {activePlayers.length < 3 && (
            <View style={styles.noticeRow}>
              <Icon name="info" size={20} color={colors.inkSoft} />
              <AppText color={colors.inkSoft} style={styles.flexShrink}>
                {S.spy.room.needThreeWarning}
              </AppText>
            </View>
          )}
        </Card>
      )}

      {/* Playing State */}
      {room.game_status === 'playing' && (
        <>
          <TimerDisplay
            remaining={timeLeft}
            total={GAME_SECONDS}
            warnAt={60}
            label={S.spy.room.timerLabel}
            warningLabel={S.spy.room.lastMinute}
          />

          {/* The secret card, dealt with a flip */}
          <Animated.View entering={reducedMotion ? undefined : FlipInEasyY.duration(motion.slow * 2)}>
            <View style={[styles.secretCard, isSpy ? styles.secretCardSpy : { borderColor: theme.accent }]}>
              <View style={[styles.secretHeader, { backgroundColor: isSpy ? colors.ink : theme.accent }]}>
                <Icon name={isSpy ? 'spy' : isWordMode ? 'card' : 'roles'} size={24} color={colors.white} />
                <AppText variant="title" color={colors.white} accessibilityRole="header">
                  {isSpy ? S.spy.room.youAreSpyHeader : isWordMode ? S.spy.room.theWordHeader : S.spy.room.yourRoleHeader}
                </AppText>
              </View>

              <View style={styles.secretBody}>
                {isSpy ? (
                  <>
                    <View style={styles.spyEmblem}>
                      <Icon name="spy" size={56} color={colors.white} />
                    </View>
                    <AppText align="center" variant="bodyStrong">
                      {isWordMode ? S.spy.room.spyWordDesc : S.spy.room.spyLocationDesc}
                    </AppText>
                    {!isWordMode && (
                      <View style={styles.tip}>
                        <Icon name="clue" size={20} color={colors.inkSoft} />
                        <AppText variant="caption" color={colors.inkSoft} style={styles.flexShrink}>
                          {S.spy.room.tipLabel} {S.spy.room.spyTip}
                        </AppText>
                      </View>
                    )}
                  </>
                ) : (
                  <>
                    <View style={[styles.secretValue, { backgroundColor: theme.tint }]}>
                      <AppText variant="label" color={colors.inkSoft} align="center">
                        {isWordMode ? S.spy.room.wordLabel : S.spy.room.locationLabel}
                      </AppText>
                      <AppText variant="heading" align="center" color={theme.accentInk}>
                        {currentPlayer?.location}
                      </AppText>
                    </View>
                    {!isWordMode && (
                      <View style={styles.secretValue}>
                        <AppText variant="label" color={colors.inkSoft} align="center">
                          {S.spy.room.roleLabel}
                        </AppText>
                        <AppText variant="title" align="center">
                          {currentPlayer?.role}
                        </AppText>
                      </View>
                    )}
                    <View style={styles.tip}>
                      <Icon name="clue" size={20} color={colors.inkSoft} />
                      <AppText variant="caption" color={colors.inkSoft} style={styles.flexShrink}>
                        {S.spy.room.tipLabel} {isWordMode ? S.spy.room.wordTip : S.spy.room.locationTip}
                      </AppText>
                    </View>
                  </>
                )}
              </View>
            </View>
          </Animated.View>

          {/* Voting */}
          <Card style={styles.section}>
            <View style={styles.titleRow}>
              <Icon name="vote" size={24} color={theme.accentInk} />
              <AppText variant="title" color={theme.accentInk} accessibilityRole="header" style={styles.flexShrink}>
                {S.spy.room.voteTitle(numSpies > 1, myVotes.length, requiredVotes)}
              </AppText>
            </View>
            {numSpies > 1 && (
              <AppText color={colors.inkSoft}>{S.spy.room.voteSubtitle(numSpies, requiredVotes)}</AppText>
            )}

            <View style={styles.voteGrid}>
              {players
                // Everyone who was dealt into this game (a player who left can still be the spy)
                .filter((player) => player != null && player.name != null &&
                  (player.active !== false || typeof player.is_spy === 'boolean'))
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
                  const atLimit = myVotes.length >= requiredVotes && !isMyVote;

                  return (
                    <Pressable
                      key={`voting-player-${idx}`}
                      onPress={() => {
                        if (isMe) return;
                        feedback.select();
                        voteForPlayer(playerName);
                      }}
                      disabled={isMe || atLimit}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isMyVote, disabled: isMe || atLimit }}
                      accessibilityLabel={[playerName, S.spy.room.votesCount(votesForPlayer), isMyVote && S.spy.room.myVote(myVoteCount)].filter(Boolean).join(', ')}
                      style={({ pressed }) => [
                        styles.voteOption,
                        isMyVote && { borderColor: theme.accent, backgroundColor: theme.tint },
                        (isMe || atLimit) && styles.disabled,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View style={styles.voteTop}>
                        <AppText variant="bodyStrong" numberOfLines={1} style={styles.flexShrink}>
                          {playerName}
                        </AppText>
                        {playerName === room.host_name && <Icon name="crown" size={16} color={colors.goldDeep} />}
                      </View>
                      {isMe && (
                        <AppText variant="caption" color={colors.inkSoft}>
                          {S.common.you}
                        </AppText>
                      )}
                      {votesForPlayer > 0 && (
                        <Badge label={S.spy.room.votesCount(votesForPlayer)} icon="vote" tone="neutral" />
                      )}
                      {isMyVote && (
                        <Badge label={S.spy.room.myVote(myVoteCount)} icon="check" tone="accent" />
                      )}
                    </Pressable>
                  );
                })}
            </View>

            <View style={styles.tip}>
              <Icon name="info" size={20} color={colors.inkSoft} />
              <View style={styles.flexShrink}>
                <AppText variant="caption" color={colors.inkSoft}>{S.spy.room.canChangeVote}</AppText>
                <AppText variant="caption" color={colors.inkSoft}>{S.spy.room.gameEndsWhen(requiredVotes)}</AppText>
              </View>
            </View>

            <View style={styles.progressRow}>
              <AppText variant="title" color={theme.accentInk}>
                {S.spy.room.votedProgress(activePlayers.filter(p => (p.votes || []).length >= requiredVotes).length, activePlayers.length)}
              </AppText>
              <AppText color={colors.inkSoft}>{S.spy.room.votedProgressLabel}</AppText>
            </View>
          </Card>

          {/* Acting host (host, or first active player if the host left) can end the game */}
          {isActingHost && (
            <Button title={S.spy.room.endGame} icon="finish" variant="secondary" onPress={() => endGame('manual')} fullWidth />
          )}

          {/* Spy Guess Input - Only for Spy */}
          {isSpy && !room.spy_guess && !spyGuessSubmitted && room.game_status === 'playing' && (
            <Card style={[styles.section, styles.spyGuessCard]}>
              <View style={styles.titleRow}>
                <Icon name="target" size={24} color={colors.ink} />
                <AppText variant="title" accessibilityRole="header">
                  {S.spy.room.spyGuessTitle}
                </AppText>
              </View>
              <AppText color={colors.inkSoft}>{S.spy.room.spyGuessDesc}</AppText>
              <TextField
                placeholder={S.spy.room.spyGuessPlaceholder}
                accessibilityLabel={S.spy.room.spyGuessTitle}
                value={spyGuess}
                onChangeText={setSpyGuess}
                editable={!spyGuessSubmitted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Button
                title={S.spy.room.submitGuess}
                icon="target"
                onPress={() => submitSpyGuess(spyGuess)}
                disabled={!spyGuess.trim() || spyGuessSubmitted}
                fullWidth
              />
            </Card>
          )}

          {/* Submitted guess status */}
          {isSpy && (room.spy_guess || spyGuessSubmitted) && room.game_status === 'playing' && (
            <Badge label={S.spy.room.guessSent(room.spy_guess || spyGuess)} icon="check" tone="success" />
          )}

          {/* Locations List - Only for Spy and only in Locations mode */}
          {isSpy && room.game_mode !== 'word' && (
            <Card style={styles.section}>
              <Pressable
                onPress={() => setShowLocations(!showLocations)}
                accessibilityRole="button"
                accessibilityLabel={S.spy.room.locationsTitle}
                accessibilityState={{ expanded: showLocations }}
                style={styles.collapseHeader}
              >
                <Icon name="location" size={24} color={theme.accentInk} />
                <AppText variant="title" color={theme.accentInk} style={styles.flex}>
                  {S.spy.room.locationsTitle}
                </AppText>
                <Icon name={showLocations ? 'minus' : 'plus'} size={24} color={theme.accentInk} />
              </Pressable>
              {showLocations && (
                <View style={styles.chips}>
                  {room.all_locations && room.all_locations.map((location, idx) => {
                    const isEliminated = room.eliminated_locations?.includes(location);
                    return (
                      <Pressable
                        key={idx}
                        onPress={() => toggleLocationEliminated(location)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: isEliminated }}
                        accessibilityLabel={isEliminated ? `${location}, ${S.spy.room.eliminated}` : location}
                        style={[styles.locationChip, isEliminated && styles.locationChipOut]}
                      >
                        {isEliminated ? <Icon name="close" size={16} color={colors.inkSoft} /> : null}
                        <AppText
                          variant="label"
                          color={isEliminated ? colors.inkSoft : colors.ink}
                          style={isEliminated && styles.struck}
                        >
                          {location}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </Card>
          )}
        </>
      )}

      {/* Finished State */}
      {room.game_status === 'finished' && (() => {
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

        // Determine winner based on spy guess (unchanged rules):
        // 1. If spy guessed correctly → spy wins
        // 2. If spy guessed incorrectly → spy loses (regardless of votes)
        // 3. If spy didn't guess → spies win unless every spy got the max votes
        const spyGuessed = room.spy_guess && room.spy_guess.trim() !== '';
        let spyWon;
        if (spyGuessed) {
          spyWon = room.spy_guess_correct === true;
        } else {
          const allSpiesCaught = spyVotes.length > 0 && spyVotes.every(v => v === maxVotes && maxVotes > 0);
          spyWon = !allSpiesCaught;
        }

        return (
          <>
            <View style={[styles.resultBanner, spyWon ? styles.resultSpyWon : styles.resultCaught]}>
              <Icon name={spyWon ? 'spy' : 'checkCircle'} size={44} color={colors.white} />
              <AppText variant="heading" align="center" color={colors.white} accessibilityRole="header">
                {spyWon ? S.spy.room.spyWonTitle(spyNames.length) : S.spy.room.spyCaughtTitle(spyNames.length)}
              </AppText>
              <AppText align="center" color={colors.white}>
                {spyWon ? S.spy.room.spyWonDesc(spyNames.length) : S.spy.room.spyCaughtDesc(spyNames.length)}
              </AppText>
            </View>

            <View style={styles.revealRow}>
              <Card style={styles.revealCard}>
                <Icon name="spy" size={28} color={theme.accentInk} />
                <AppText variant="label" color={colors.inkSoft} align="center">
                  {S.spy.room.spyWas(spyNames.length)}
                </AppText>
                <AppText variant="title" align="center">{spyNames.join(', ')}</AppText>
              </Card>
              <Card style={styles.revealCard}>
                <Icon name={isWordMode ? 'card' : 'location'} size={28} color={theme.accentInk} />
                <AppText variant="label" color={colors.inkSoft} align="center">
                  {isWordMode ? S.spy.room.wordWas : S.spy.room.locationWas}
                </AppText>
                <AppText variant="title" align="center">{room.chosen_location}</AppText>
              </Card>
            </View>

            {room.spy_guess ? (
              <Card style={styles.section}>
                <AppText variant="label" color={colors.inkSoft}>{S.spy.room.spyGuessLabel}</AppText>
                <AppText variant="title">{room.spy_guess}</AppText>
                {room.spy_guess_correct === true ? (
                  <Badge label={S.spy.room.guessRight} icon="checkCircle" tone="success" />
                ) : room.spy_guess_correct === false ? (
                  <Badge label={S.spy.room.guessWrong} icon="close" tone="danger" />
                ) : null}
              </Card>
            ) : null}

            {room.drinking_mode && (
              <Card style={[styles.section, styles.drinkCard]}>
                <View style={styles.titleRow}>
                  <Icon name="drink" size={26} color={colors.ink} />
                  <AppText variant="title">{S.spy.room.drinkingTitle}</AppText>
                </View>
                <AppText variant="bodyStrong">
                  {spyWon ? S.spy.room.drinkSpyWon(spyNames.length) : S.spy.room.drinkSpyCaught(spyNames.length)}
                </AppText>
              </Card>
            )}

            <Card style={styles.section}>
              <View style={styles.titleRow}>
                <Icon name="vote" size={24} color={theme.accentInk} />
                <AppText variant="title" color={theme.accentInk}>{S.spy.room.voteResults}</AppText>
              </View>
              {[...voteCounts]
                .sort((a, b) => b.votes - a.votes)
                .map(({ player, votes, wasSpy }, idx) => (
                  <View key={idx} style={[styles.resultRow, wasSpy && { borderColor: colors.ink, backgroundColor: colors.cardboard }]}>
                    <View style={styles.voteTop}>
                      <AppText variant="bodyStrong">{player.name}</AppText>
                      {wasSpy && <Badge label={S.spy.room.spyBadge} icon="spy" tone="accent" />}
                    </View>
                    <Badge label={S.spy.room.votesCount(votes)} icon="vote" tone="neutral" />
                  </View>
                ))}
            </Card>

            <Button title={S.spy.room.newGame} icon="dice" onPress={resetGame} disabled={!isHost} fullWidth />
            {!isHost && (
              <AppText variant="caption" align="center" color={colors.inkSoft}>
                {S.spy.room.hostOnlyNewGame}
              </AppText>
            )}
            <Button title={S.spy.room.backToMenu} icon="home" variant="secondary" onPress={goBack} fullWidth />
          </>
        );
      })()}
    </Screen>
  );
}

// Visual token colors for players in the lobby (Spy players have no color field)
const PLAYER_TOKEN_COLORS = ['#3F7D3A', '#2F6FB5', '#B83E33', '#7A4FC2', '#8A5A2B', '#22335C', '#B07E12', '#6B5443'];

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
  stateCard: {
    width: '100%',
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
  setting: {
    gap: spacing.sm,
  },
  segmented: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  countRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  countToken: {
    width: 52,
    height: 52,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderBottomWidth: 4,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  secretCard: {
    borderRadius: radii.xl,
    borderWidth: 3,
    borderBottomWidth: 7,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  secretCardSpy: {
    borderColor: colors.ink,
  },
  secretHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  secretBody: {
    padding: spacing.lg,
    gap: spacing.md,
    alignItems: 'stretch',
  },
  spyEmblem: {
    alignSelf: 'center',
    width: 96,
    height: 96,
    borderRadius: radii.pill,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secretValue: {
    gap: 2,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  voteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  voteOption: {
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: 64,
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 2.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  voteTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  spyGuessCard: {
    borderColor: colors.ink,
    borderWidth: 2.5,
  },
  collapseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
  },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  locationChipOut: {
    backgroundColor: colors.cardboard,
    borderStyle: 'dashed',
  },
  struck: {
    textDecorationLine: 'line-through',
  },
  resultBanner: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
    borderRadius: radii.xl,
    borderBottomWidth: 7,
  },
  resultSpyWon: {
    backgroundColor: colors.ink,
    borderColor: '#1E140D',
  },
  resultCaught: {
    backgroundColor: colors.success,
    borderColor: colors.successDeep,
  },
  revealRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  revealCard: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  drinkCard: {
    backgroundColor: colors.goldTint,
    borderColor: colors.gold,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.paper,
  },
});
