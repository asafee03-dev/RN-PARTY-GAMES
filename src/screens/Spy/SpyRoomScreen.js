import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator, Modal, Switch, TouchableOpacity, Platform, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';
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
        Alert.alert('שגיאה', 'החדר לא נמצא');
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
          Alert.alert('שגיאה', 'המשחק כבר התחיל. לא ניתן להצטרף כעת.');
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
          Alert.alert('שגיאה', 'לא הצלחנו להצטרף לחדר. נסה שוב.');
          navigation.goBack();
          return;
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
      Alert.alert('שגיאה', 'נדרשים לפחות 3 שחקנים!');
      return;
    }

    if (currentRoom.game_status !== 'lobby') {
      console.warn('⚠️ Cannot start game - room is not in lobby state:', currentRoom.game_status);
      Alert.alert('שגיאה', 'החדר לא מוכן למשחק חדש. אנא לחץ על \'משחק חדש\' תחילה.');
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
          Alert.alert('שגיאה', 'אין מיקומים במערכת!');
          return;
        }
        randomLocation = valid[Math.floor(Math.random() * valid.length)];
        allLocationNames = locations.map(loc => loc.location).filter(loc => loc != null);
      } else {
        const words = [];
        const wordsSnapshot = await getDocs(collection(db, 'WordCard'));
        wordsSnapshot.forEach((d) => {
          const w = d.data()?.word;
          if (typeof w === 'string' && w.trim().length > 0) words.push(w.trim());
        });
        if (words.length === 0) {
          Alert.alert('שגיאה', 'אין מילים במערכת!');
          return;
        }
        randomWord = words[Math.floor(Math.random() * words.length)];
      }
    } catch (error) {
      console.error('❌ Error loading game content:', error);
      Alert.alert('שגיאה', 'שגיאה בטעינת נתוני המשחק. נסה שוב.');
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
        const spyNames = [...active]
          .sort(() => Math.random() - 0.5)
          .slice(0, actualNumSpies)
          .map(p => p.name);
        const spySet = new Set(spyNames);

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
              role: roles[Math.floor(Math.random() * roles.length)],
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
        Alert.alert('שגיאה', 'נדרשים לפחות 3 שחקנים!');
        return;
      }
      if (outcome === 'ok') {
        console.log('✅ Game started successfully with fresh state');
        const { logGameStart } = await import('../../utils/analytics');
        logGameStart('spy', currentRoom.id);
      }
    } catch (error) {
      console.error('❌ Error starting game:', error);
      Alert.alert('שגיאה', 'שגיאה בהתחלת המשחק. נסה שוב.');
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
      Alert.alert('שגיאה', 'אנא הכנס ניחוש');
      return;
    }

    if (room.spy_guess) {
      Alert.alert('שגיאה', 'כבר שלחת ניחוש');
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

      const what = isWordMode ? 'המילה הייתה' : 'המיקום היה';
      if (result.outcome === 'correct') {
        Alert.alert('🎉 ניצחון!', `צדקת! ${what}: ${result.correctAnswer}\nהמשחק הסתיים - המרגל ניצח!`);
      } else if (result.outcome === 'wrong') {
        Alert.alert('❌ טעות', `הניחוש שלך שגוי.\n${what}: ${result.correctAnswer}\nהמשחק הסתיים - המרגל הפסיד!`);
      } else if (result.outcome === 'already') {
        Alert.alert('שים לב', 'מרגל אחר כבר שלח ניחוש.');
      } else if (result.outcome === 'over') {
        Alert.alert('שים לב', 'המשחק כבר הסתיים - הניחוש לא נשלח.');
      }
    } catch (error) {
      console.error('❌ Error submitting spy guess:', error);
      setSpyGuessSubmitted(false);
      Alert.alert('שגיאה', 'שגיאה בשליחת הניחוש. נסה שוב.');
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
        Alert.alert('שגיאה', 'שגיאה בסיום המשחק. נסה שוב.');
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
      Alert.alert('שגיאה', 'לא הצלחנו לאפס את המשחק. נסה שוב.');
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

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (error) {
    return (
      <GradientBackground variant="spy">
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>שגיאה בטעינת החדר</Text>
          <Text style={styles.errorMessage}>לא הצלחנו לטעון את חדר המשחק</Text>
          <GradientButton
            title="חזרה"
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
            variant="spy"
            style={styles.errorButton}
          />
        </View>
      </GradientBackground>
    );
  }

  if (isLoading || !room) {
    return (
      <GradientBackground variant="spy">
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
  const myVotes = currentPlayer?.votes || []; // Array of votes
  const numSpies = getSpyCount(room);
  const requiredVotes = getRequiredVotes(room);
  const activePlayers = getActivePlayers(room);
  const isActingHost = !!currentPlayerName && getActingHostName(room) === currentPlayerName;

  return (
    <GradientBackground variant="spy">
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Unified Top Bar */}
        <UnifiedTopBar
          roomCode={roomCode}
          variant="spy"
          onExit={goBack}
          onRulesPress={handleRulesPress}
          drinkingMode={drinkingMode}
        />

        {/* Rules Modal */}
        <RulesModal
          visible={showRulesModal}
          onClose={() => setShowRulesModal(false)}
          variant="spy"
          gameMode={room?.game_mode || 'locations'}
        />

        {/* Lobby State */}
        {room.game_status === 'lobby' && (
          <View style={styles.lobbyCard}>
            <View style={styles.lobbyHeader}>
              <Text style={styles.lobbyTitle}>👥 חדר המתנה</Text>
            </View>
            <View style={styles.lobbyContent}>
              {/* Show current game mode to all players in lobby */}
              {room?.game_mode && (
                <View style={styles.gameModeInfoBadge}>
                  <Text style={styles.gameModeInfoText}>
                    🎮 מצב משחק: {room.game_mode === 'word' ? 'מילה' : 'מיקומים'}
                  </Text>
                </View>
              )}
              
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
                          Alert.alert('שגיאה', 'לא הצלחנו לעדכן את מצב השתייה');
                        }
                      }}
                      trackColor={{ false: '#D1D5DB', true: '#F97316' }}
                      thumbColor={drinkingMode ? '#FFFFFF' : '#9CA3AF'}
                    />
                    <Text style={styles.drinkingToggleLabel}>🍺</Text>
                  </View>
                  
                  {/* Game Mode Selection */}
                  <View style={styles.gameModeSelectionContainer}>
                    <Text style={styles.gameModeSelectionLabel}>🎮 מצב משחק:</Text>
                    <View style={styles.gameModeButtonsRow}>
                      {[
                        { value: 'locations', label: 'מיקומים' },
                        { value: 'word', label: 'מילה' }
                      ].map((mode) => {
                        const isSelected = gameMode === mode.value;
                        return (
                          <Pressable
                            key={mode.value}
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
                            style={[
                              styles.gameModeButton,
                              isSelected && styles.gameModeButtonSelected
                            ]}
                          >
                            <Text style={[
                              styles.gameModeButtonText,
                              isSelected && styles.gameModeButtonTextSelected
                            ]}>
                              {mode.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Text style={styles.gameModeSelectionHint}>
                      {gameMode === 'locations' 
                        ? 'כל שחקן מקבל מיקום ותפקיד' 
                        : 'כל השחקנים מקבלים אותה מילה'}
                    </Text>
                  </View>

                  {/* Number of Spies Selection */}
                  <View style={styles.spiesSelectionContainer}>
                    <Text style={styles.spiesSelectionLabel}>🕵️ מספר מרגלים:</Text>
                    <View style={styles.spiesButtonsRow}>
                      {[1, 2, 3, 4].map((num) => {
                        const maxSpies = Math.max(1, Math.floor(players.length / 2));
                        const isDisabled = num > maxSpies || num > players.length;
                        const isSelected = numberOfSpies === num;
                        return (
                          <Pressable
                            key={num}
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
                              styles.spyCountButton,
                              isSelected && styles.spyCountButtonSelected,
                              isDisabled && styles.spyCountButtonDisabled
                            ]}
                          >
                            <Text style={[
                              styles.spyCountButtonText,
                              isSelected && styles.spyCountButtonTextSelected,
                              isDisabled && styles.spyCountButtonTextDisabled
                            ]}>
                              {num}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Text style={styles.spiesSelectionHint}>
                      {numberOfSpies === 1 
                        ? 'יהיה מרגל אחד במשחק' 
                        : `יהיו ${numberOfSpies} מרגלים במשחק`}
                    </Text>
                  </View>
                </View>
              )}

              {/* Show number of spies to non-host players (game mode already shown above) */}
              {!isHost && (
                <>
                  {room?.number_of_spies && (
                    <View style={styles.spiesInfoBadge}>
                      <Text style={styles.spiesInfoText}>
                        🕵️ במשחק זה {room.number_of_spies === 1 ? 'יהיה מרגל אחד' : `יהיו ${room.number_of_spies} מרגלים`}
                      </Text>
                    </View>
                  )}
                </>
              )}

              {!isHost && room?.drinking_mode === true && (
                <View style={styles.drinkingBadge}>
                  <Text style={styles.drinkingBadgeText}>🍺 מצב שתייה פעיל</Text>
                </View>
              )}

              <View style={styles.greetingCard}>
                <Text style={styles.greetingText}>שלום, {currentPlayerName}!</Text>
              </View>

              <View style={styles.playersSection}>
                <Text style={styles.playersTitle}>שחקנים בחדר ({activePlayers.length})</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.playersList}>
                  {activePlayers
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
                  variant="spy"
                  style={styles.startButton}
                  disabled={activePlayers.length < 3}
                />
              )}

              {activePlayers.length < 3 && (
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
                    {isSpy ? '👁️‍🗨️ אתה המרגל!' : (room.game_mode === 'word' ? '👁️ המילה' : '👁️ התפקיד שלך')}
                  </Text>
                </View>
                <View style={styles.playerInfoContent}>
                  {isSpy ? (
                    <View style={styles.spyInfo}>
                      <Text style={styles.spyEmoji}>🕵️</Text>
                      <Text style={styles.spyTitle}>אתה המרגל!</Text>
                      <Text style={styles.spyDescription}>
                        {room.game_mode === 'word' 
                          ? 'אתה לא יודע את המילה.\nנסה לגלות מהי המילה מבלי שיגלו שאתה המרגל!'
                          : 'אתה לא יודע את המקום.\nנסה לגלות מהו המיקום מבלי שיגלו שאתה המרגל!'}
                      </Text>
                      {room.game_mode !== 'word' && (
                        <View style={styles.spyTip}>
                          <Text style={styles.spyTipTitle}>💡 טיפ:</Text>
                          <Text style={styles.spyTipText}>השתמש ברשימת המקומות כדי לסמן מקומות שכבר שללת</Text>
                        </View>
                      )}
                    </View>
                  ) : (
                    <View style={styles.regularInfo}>
                      {room.game_mode === 'word' ? (
                        <View style={styles.locationCard}>
                          <Text style={styles.locationLabel}>המילה:</Text>
                          <Text style={styles.locationText}>{currentPlayer?.location}</Text>
                        </View>
                      ) : (
                        <>
                          <View style={styles.locationCard}>
                            <Text style={styles.locationLabel}>המיקום:</Text>
                            <Text style={styles.locationText}>{currentPlayer?.location}</Text>
                          </View>
                          <View style={styles.roleCard}>
                            <Text style={styles.roleLabel}>התפקיד שלך:</Text>
                            <Text style={styles.roleText}>{currentPlayer?.role}</Text>
                          </View>
                        </>
                      )}
                      <View style={styles.regularTip}>
                        <Text style={styles.regularTipTitle}>💡 טיפ:</Text>
                        <Text style={styles.regularTipText}>
                          {room.game_mode === 'word' 
                            ? 'אמור מילה הקשורה למילה הנתונה, אבל אל תחשוף אותה למרגל!'
                            : 'שאל שאלות כדי לגלות מי המרגל, אבל אל תחשוף יותר מדי!'}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              </View>

              {/* Voting Section */}
              <View style={styles.votingCard}>
                <View style={styles.votingHeader}>
                  <Text style={styles.votingTitle}>
                    הצבעה - מי המרגל{numSpies > 1 ? `ים? (${myVotes.length}/${requiredVotes} הצבעות)` : '?'}
                  </Text>
                  {numSpies > 1 && (
                    <Text style={styles.votingSubtitle}>
                      יש {numSpies} מרגלים - הצבע {requiredVotes} הצבעות
                    </Text>
                  )}
                </View>
                <View style={styles.votingContent}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.votingPlayersList}>
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

                      return (
                        <Pressable
                          key={`voting-player-${idx}`}
                          onPress={() => !isMe && voteForPlayer(playerName)}
                          disabled={isMe || (myVotes.length >= requiredVotes && !isMyVote)}
                          style={[
                            styles.votingPlayerCard,
                            isMyVote && styles.votingPlayerCardSelected,
                            isMe && styles.votingPlayerCardDisabled,
                            myVotes.length >= requiredVotes && !isMyVote && styles.votingPlayerCardDisabled
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
                              <Text style={styles.myVoteText}>
                                {myVoteCount > 1 ? `${myVoteCount}x ` : ''}ההצבעה שלך ✓
                              </Text>
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
                      המשחק יסתיים כשכולם יצביעו {requiredVotes > 1 ? `(${requiredVotes} הצבעות לכל שחקן)` : ''}, כשהמארח יסיים את המשחק, או כשהזמן יגמר.
                    </Text>
                    <View style={styles.votingProgress}>
                      <Text style={styles.votingProgressText}>
                        {activePlayers.filter(p => (p.votes || []).length >= requiredVotes).length} / {activePlayers.length}
                      </Text>
                      <Text style={styles.votingProgressLabel}>שחקנים סיימו להצביע</Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Acting host (host, or first active player if the host left) can end the game */}
              {isActingHost && (
                <GradientButton
                  title="סיים משחק"
                  onPress={() => endGame('manual')}
                  variant="spy"
                  style={styles.endButton}
                />
              )}

              {/* Spy Guess Input - Only for Spy */}
              {isSpy && !room.spy_guess && !spyGuessSubmitted && room.game_status === 'playing' && (
                <View style={styles.spyGuessCard}>
                  <View style={styles.spyGuessHeader}>
                    <Text style={styles.spyGuessTitle}>🎯 ניחוש המרגל</Text>
                  </View>
                  <View style={styles.spyGuessContent}>
                    <Text style={styles.spyGuessDescription}>
                      יש לך ניחוש אחד בלבד!{'\n'}
                      אם תצדק - תוכל לנצח את המשחק!
                    </Text>
                    <TextInput
                      style={styles.spyGuessInput}
                      placeholder="הכנס את הניחוש שלך..."
                      placeholderTextColor="#9CA3AF"
                      value={spyGuess}
                      onChangeText={setSpyGuess}
                      editable={!spyGuessSubmitted}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <GradientButton
                      title="שלח ניחוש"
                      onPress={() => submitSpyGuess(spyGuess)}
                      variant="spy"
                      style={styles.spyGuessButton}
                      disabled={!spyGuess.trim() || spyGuessSubmitted}
                    />
                  </View>
                </View>
              )}

              {/* Show submitted guess status */}
              {isSpy && (room.spy_guess || spyGuessSubmitted) && room.game_status === 'playing' && (
                <View style={styles.spyGuessSubmittedCard}>
                  <Text style={styles.spyGuessSubmittedText}>
                    ✓ ניחוש נשלח: {room.spy_guess || spyGuess}
                  </Text>
                </View>
              )}

              {/* Locations List - Only for Spy and only in Locations mode */}
              {isSpy && room.game_mode !== 'word' && (
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
                <Text style={styles.spyRevealLabel}>
                  {(() => {
                    const spyNames = room?.spy_names || (room?.spy_name ? [room.spy_name] : []);
                    return spyNames.length === 1 ? 'המרגל היה:' : 'המרגלים היו:';
                  })()}
                </Text>
                <Text style={styles.spyRevealName}>
                  {(() => {
                    const spyNames = room?.spy_names || (room?.spy_name ? [room.spy_name] : []);
                    return spyNames.join(', ');
                  })()}
                </Text>
              </View>

              <View style={styles.locationRevealCard}>
                <Text style={styles.locationRevealLabel}>
                  {room.game_mode === 'word' ? 'המילה הייתה:' : 'המיקום היה:'}
                </Text>
                <Text style={styles.locationRevealName}>{room.chosen_location}</Text>
              </View>

              {/* Spy Guess Result - Show if spy guessed and was wrong */}
              {room.spy_guess && room.spy_guess_correct === false && (
                <View style={styles.spyGuessResultCard}>
                  <Text style={styles.spyGuessResultLabel}>ניחוש המרגל:</Text>
                  <Text style={styles.spyGuessResultText}>{room.spy_guess}</Text>
                  <Text style={styles.spyGuessResultStatus}>❌ ניחוש שגוי</Text>
                </View>
              )}

              {/* Spy Guess Result - Show if spy guessed and was correct */}
              {room.spy_guess && room.spy_guess_correct === true && (
                <View style={styles.spyGuessResultCardCorrect}>
                  <Text style={styles.spyGuessResultLabel}>ניחוש המרגל:</Text>
                  <Text style={styles.spyGuessResultText}>{room.spy_guess}</Text>
                  <Text style={styles.spyGuessResultStatusCorrect}>✅ ניחוש נכון - המרגל ניצח!</Text>
                </View>
              )}

              {/* Voting Results */}
              <View style={styles.votingResultsCard}>
                <Text style={styles.votingResultsTitle}>תוצאות ההצבעה:</Text>
                {(() => {
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
                  const maxSpyVotes = spyVotes.length > 0 ? Math.max(...spyVotes) : 0;
                  
                  // Check if spy guessed
                  const spyGuessed = room.spy_guess && room.spy_guess.trim() !== '';
                  const spyGuessedCorrectly = room.spy_guess_correct === true;
                  const spyGuessedIncorrectly = room.spy_guess_correct === false;
                  
                  // Determine winner based on spy guess:
                  // 1. If spy guessed correctly → spy wins
                  // 2. If spy guessed incorrectly → spy loses (regardless of votes)
                  // 3. If spy didn't guess → use normal voting logic
                  let spyWon;
                  if (spyGuessed) {
                    spyWon = spyGuessedCorrectly;
                  } else {
                    // Normal voting logic: spies win if at least one spy has fewer votes than the max (not caught)
                    const allSpiesCaught = spyVotes.length > 0 && spyVotes.every(v => v === maxVotes && maxVotes > 0);
                    spyWon = !allSpiesCaught;
                  }
                  
                  return (
                    <>
                      <View style={[styles.resultCard, spyWon ? styles.resultCardSpyWon : styles.resultCardSpyCaught]}>
                        <Text style={styles.resultTitle}>
                          {spyWon 
                            ? (spyNames.length === 1 ? '🕵️ המרגל ניצח!' : '🕵️ המרגלים ניצחו!')
                            : (spyNames.length === 1 ? '✅ המרגל נתפס!' : '✅ כל המרגלים נתפסו!')}
                        </Text>
                        <Text style={styles.resultDescription}>
                          {spyWon 
                            ? (spyNames.length === 1 
                                ? 'המרגל הצליח להישאר בחשאי!' 
                                : 'לפחות אחד מהמרגלים הצליח להישאר בחשאי!')
                            : (spyNames.length === 1
                                ? 'השחקנים הצליחו לזהות את המרגל!'
                                : 'השחקנים הצליחו לזהות את כל המרגלים!')}
                        </Text>
                      </View>

                      {/* Drinking Section - Only show if drinking mode is enabled */}
                      {room.drinking_mode && (
                        <View style={styles.drinkingSection}>
                          <Text style={styles.drinkingSectionIcon}>🍺</Text>
                          <Text style={styles.drinkingSectionTitle}>זמן שתייה!</Text>
                          <Text style={styles.drinkingSectionMessage}>
                            {spyWon 
                              ? (spyNames.length === 1 
                                  ? 'המרגל ניצח – כל השחקנים האחרים חייבת לשתות 🍺'
                                  : 'המרגלים ניצחו – כל השחקנים האחרים חייבת לשתות 🍺')
                              : (spyNames.length === 1
                                  ? 'המרגל נתפס – המרגל חייבת לשתות 🍺'
                                  : 'כל המרגלים נתפסו – כל המרגלים חייבת לשתות 🍺')}
                          </Text>
                        </View>
                      )}
                      
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
              <GradientButton
                title="משחק חדש"
                onPress={resetGame}
                variant="spy"
                style={styles.resetButton}
                disabled={!isHost}
              />
              {!isHost && (
                <Text style={styles.hostOnlyText}>רק המארח יכול להתחיל משחק חדש</Text>
              )}
              <GradientButton
                title="חזרה לתפריט הראשי"
                onPress={goBack}
                variant="outline"
                style={styles.exitButton}
              />
            </View>
          </View>
        )}
      </ScrollView>
      <BannerAd />
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    padding: 10,
    paddingBottom: 16,
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
    color: '#6B7280',
    fontSize: 12,
  },
  roomCodeText: {
    color: '#7ED957', // Spy theme color
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
    backgroundColor: '#7ED957', // Spy theme color
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
    backgroundColor: '#7ED957', // Spy theme color
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
    backgroundColor: 'rgba(126, 217, 87, 0.15)', // Spy theme color with transparency
    borderWidth: 1,
    borderColor: '#7ED957', // Spy theme color
    borderRadius: 12,
    padding: 12,
  },
  warningText: {
    fontSize: 14,
    color: '#7ED957', // Spy theme color
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
    color: '#7ED957', // Spy theme color
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
    backgroundColor: '#7ED957', // Spy theme color
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
    color: '#7ED957', // Spy theme color
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
    textAlign: 'center',
  },
  votingSubtitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 4,
    opacity: 0.9,
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
    color: '#7ED957', // Spy theme color
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
    backgroundColor: 'rgba(126, 217, 87, 0.15)', // Spy theme color with transparency
    borderWidth: 2,
    borderColor: '#7ED957', // Spy theme color
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
    width: '100%',
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  resetButton: {
    width: '100%',
    minHeight: 48,
  },
  exitButton: {
    width: '100%',
    minHeight: 48,
  },
  hostOnlyText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
  },
  spiesSelectionContainer: {
    marginTop: 12,
    gap: 8,
  },
  spiesSelectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  spiesButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  spyCountButton: {
    minWidth: 50,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  spyCountButtonSelected: {
    backgroundColor: '#7ED957', // Spy theme color
    borderColor: '#7ED957',
  },
  spyCountButtonDisabled: {
    opacity: 0.4,
    backgroundColor: '#F3F4F6',
  },
  spyCountButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  spyCountButtonTextSelected: {
    color: '#FFFFFF',
  },
  spyCountButtonTextDisabled: {
    color: '#9CA3AF',
  },
  spiesSelectionHint: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  spiesInfoBadge: {
    backgroundColor: 'rgba(126, 217, 87, 0.2)', // Spy theme color with transparency
    borderWidth: 2,
    borderColor: '#7ED957', // Spy theme color
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  spiesInfoText: {
    fontSize: 14,
    color: '#374151',
    textAlign: 'center',
    fontWeight: '600',
  },
  gameModeSelectionContainer: {
    marginTop: 12,
    gap: 8,
  },
  gameModeSelectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  gameModeButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  gameModeButton: {
    flex: 1,
    minWidth: 100,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gameModeButtonSelected: {
    backgroundColor: '#7ED957', // Spy theme color
    borderColor: '#7ED957',
  },
  gameModeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  gameModeButtonTextSelected: {
    color: '#FFFFFF',
  },
  gameModeSelectionHint: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  gameModeInfoBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)', // Blue with transparency
    borderWidth: 2,
    borderColor: '#3B82F6',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  gameModeInfoText: {
    fontSize: 14,
    color: '#374151',
    textAlign: 'center',
    fontWeight: '600',
  },
  spyGuessCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    marginBottom: 16,
  },
  spyGuessHeader: {
    backgroundColor: '#DC2626',
    padding: 16,
    alignItems: 'center',
  },
  spyGuessTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  spyGuessContent: {
    padding: 20,
    gap: 16,
  },
  spyGuessDescription: {
    fontSize: 14,
    color: '#374151',
    textAlign: 'center',
    lineHeight: 20,
  },
  spyGuessInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#DC2626',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#1F2937',
    textAlign: 'right',
  },
  spyGuessButton: {
    marginTop: 8,
  },
  spyGuessSubmittedCard: {
    backgroundColor: '#D1FAE5',
    borderWidth: 2,
    borderColor: '#10B981',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  spyGuessSubmittedText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  spyGuessResultCard: {
    backgroundColor: '#FEE2E2',
    borderWidth: 2,
    borderColor: '#EF4444',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  spyGuessResultCardCorrect: {
    backgroundColor: '#D1FAE5',
    borderWidth: 2,
    borderColor: '#10B981',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  spyGuessResultLabel: {
    fontSize: 16,
    color: '#374151',
    fontWeight: '600',
  },
  spyGuessResultText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
  },
  spyGuessResultStatus: {
    fontSize: 16,
    fontWeight: '600',
    color: '#DC2626',
    marginTop: 8,
  },
  spyGuessResultStatusCorrect: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10B981',
    marginTop: 8,
  },
  drinkingSection: {
    backgroundColor: '#FFF7ED',
    borderWidth: 2,
    borderColor: '#F97316',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginTop: 16,
    gap: 8,
  },
  drinkingSectionIcon: {
    fontSize: 48,
    marginBottom: 4,
  },
  drinkingSectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  drinkingSectionMessage: {
    fontSize: 18,
    color: '#374151',
    textAlign: 'center',
    lineHeight: 24,
  },
});
