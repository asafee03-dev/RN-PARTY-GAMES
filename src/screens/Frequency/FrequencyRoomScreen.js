import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator, Modal, Switch, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';
import BannerAd from '../../components/shared/BannerAd';
import FrequencyGauge from '../../components/frequency/FrequencyGauge';
import ScoreBoard from '../../components/frequency/ScoreBoard';
import UnifiedTopBar from '../../components/shared/UnifiedTopBar';
import RulesModal from '../../components/shared/RulesModal';
import { db, waitForFirestoreReady } from '../../firebase';
import { doc, getDoc, updateDoc, onSnapshot, query, collection, where, getDocs } from 'firebase/firestore';
import { atomicPlayerJoin } from '../../utils/playerJoin';
import storage from '../../utils/storage';
import { saveCurrentRoom, loadCurrentRoom, clearCurrentRoom } from '../../utils/navigationState';
import { setupGameEndDeletion, setupAllAutoDeletions } from '../../utils/roomManagement';
import { showInterstitialIfAvailable } from '../../utils/interstitialAd';

const PLAYER_COLORS = ["#F59E0B", "#EF4444", "#8B5CF6", "#FCD34D", "#3B82F6", "#EC4899", "#F97316", "#14B8A6"];
const waveIcons = ["📻", "📡", "🎚️", "🎛️"];

export default function FrequencyRoomScreen({ navigation, route }) {
  const roomCode = route?.params?.roomCode || '';
  const insets = useSafeAreaInsets();
  const [room, setRoom] = useState(null);
  const [currentPlayerName, setCurrentPlayerName] = useState('');
  const [drinkingMode, setDrinkingMode] = useState(false);
  const [isAdvancingTurn, setIsAdvancingTurn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [forceCloseModal, setForceCloseModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);

  const needleUpdateTimeout = useRef(null);
  const isProcessingReveal = useRef(false);
  const isSubmittingGuess = useRef(false);
  const unsubscribeRef = useRef(null);
  const autoDeletionCleanupRef = useRef({ cancelGameEnd: () => {}, cancelEmptyRoom: () => {}, cancelAge: () => {} });
  const pendingTopicRef = useRef(null); // Track topic being set during turn advancement
  const pendingTopicTimeoutRef = useRef(null); // Timeout to clear pendingTopicRef if update doesn't complete
  const lastResetTriggerRef = useRef(null); // Track last reset trigger to show ad once per reset
  const lastStateUpdateTimestampRef = useRef(null); // Track last state update timestamp to prevent out-of-order updates
  const lastTurnIndexRef = useRef(null); // Track last turn index to detect turn changes
  const lastRoundIdRef = useRef(null); // Track round identifier to prevent mixing guesses from different rounds

  const loadRoom = async () => {
    try {
      setIsLoading(true);
      console.log('🔵 Loading Frequency room with code:', roomCode);
      
      await waitForFirestoreReady();
      
      const roomRef = doc(db, 'FrequencyRoom', roomCode);
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

      // Check if player exists in room (by name)
      const existingPlayerIndex = roomData.players && Array.isArray(roomData.players) 
        ? roomData.players.findIndex(p => p && p.name === playerName)
        : -1;
      const playerExists = existingPlayerIndex !== -1;
      
      if (playerName) {
        if (playerExists) {
          // Player exists - check if they're rejoining (inactive)
          const existingPlayer = roomData.players[existingPlayerIndex];
          if (existingPlayer.active === false) {
            // Rejoining: restore active state, keep score - use atomic join
            console.log('🔄 Player rejoining Frequency room:', playerName);
            const result = await atomicPlayerJoin(
              'FrequencyRoom',
              roomData.id,
              playerName,
              null, // createPlayerObject (not needed for rejoin)
              (players, name) => players.findIndex(p => p && p.name === name), // findPlayerIndex
              (existingPlayer) => ({ ...existingPlayer, active: true }), // updatePlayerObject
              3 // maxRetries
            );
            
            if (result.success && result.roomData) {
              console.log('✅ Player rejoined Frequency room successfully:', playerName);
              setRoom(result.roomData);
              return;
            } else {
              console.error('❌ Failed to rejoin Frequency room:', result.error);
              // Continue anyway - player exists, just couldn't update active status
            }
          }
          // Player already active, continue normally
        } else {
          // New player joining
          if (roomData.game_status === 'lobby') {
            // Only allow new players in lobby - use atomic join
            const playerColor = PLAYER_COLORS[roomData.players?.length % PLAYER_COLORS.length || 0];
            const result = await atomicPlayerJoin(
              'FrequencyRoom',
              roomData.id,
              playerName,
              () => ({ 
                name: playerName, 
                score: 0, 
                has_guessed: false, 
                color: playerColor,
                active: true 
              }), // createPlayerObject
              (players, name) => players.findIndex(p => p && p.name === name), // findPlayerIndex
              null, // updatePlayerObject
              3 // maxRetries
            );
            
            if (result.success && result.roomData) {
              console.log('✅ Player joined Frequency room successfully:', playerName);
              setRoom(result.roomData);
              return;
            } else {
              console.error('❌ Failed to join Frequency room:', result.error);
              Alert.alert('שגיאה', 'לא הצלחנו להצטרף לחדר. נסה שוב.');
              navigation.goBack();
              return;
            }
          } else if (roomData.game_status === 'playing' || roomData.game_status === 'finished') {
            // Game in progress - new players cannot join
            console.warn('⚠️ New player tried to join game that is already in progress');
            Alert.alert('שגיאה', 'המשחק כבר התחיל. לא ניתן להצטרף כעת.');
            navigation.goBack();
            return;
          }
        }
      }
      setRoom(roomData);
      
      // Initialize refs from loaded room data
      if (roomData.game_status === 'playing' && roomData.current_turn_index !== undefined) {
        lastTurnIndexRef.current = roomData.current_turn_index;
        if (roomData.current_round_id) {
          lastRoundIdRef.current = roomData.current_round_id;
        }
        if (roomData.topic_update_timestamp) {
          lastStateUpdateTimestampRef.current = roomData.topic_update_timestamp;
        }
      }
    } catch (error) {
      console.error('❌ Error loading room:', error);
      Alert.alert('שגיאה', 'לא הצלחנו לטעון את החדר');
      navigation.goBack();
    } finally {
      setIsLoading(false);
    }
  };

  // Load player name on mount (like Alias does)
  useEffect(() => {
    const loadPlayerName = async () => {
      try {
        const savedName = await storage.getItem('playerName');
        if (savedName) {
          setCurrentPlayerName(savedName);
        }
        // Load drinking mode from room data (preferred) or local storage (fallback)
        if (roomData.drinking_mode !== undefined) {
          setDrinkingMode(roomData.drinking_mode);
          await storage.setItem('drinkingMode', roomData.drinking_mode.toString());
        } else {
          const savedMode = await storage.getItem('drinkingMode');
          if (savedMode) {
            setDrinkingMode(savedMode === 'true');
          }
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
      saveCurrentRoom('frequency', roomCode, {});
    }
  }, [roomCode]);

  // Initialize room and set up listener (like Alias does)
  useEffect(() => {
    if (!roomCode) {
      // Try to restore from saved state on refresh
      const restoreRoom = async () => {
        try {
          const savedRoom = await loadCurrentRoom();
          if (savedRoom && savedRoom.gameType === 'frequency' && savedRoom.roomCode) {
            // Navigate to saved room
            navigation.replace('FrequencyRoom', { roomCode: savedRoom.roomCode });
            return;
          } else {
            Alert.alert('שגיאה', 'קוד חדר חסר');
            await clearCurrentRoom();
            navigation.goBack();
            return;
          }
        } catch (error) {
          console.warn('⚠️ Error restoring room:', error);
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
    if (needleUpdateTimeout.current) {
      clearTimeout(needleUpdateTimeout.current);
      needleUpdateTimeout.current = null;
    }

    loadRoom();
    setupRealtimeListener();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      if (needleUpdateTimeout.current) {
        clearTimeout(needleUpdateTimeout.current);
        needleUpdateTimeout.current = null;
      }
    };
  }, [roomCode]);

  // Cleanup timers/listeners on navigation away and mark player as inactive
  useEffect(() => {
    const unsubscribeNav = navigation.addListener('beforeRemove', async () => {
      // Mark player as inactive instead of removing
      if (room && room.id && currentPlayerName) {
        try {
          const roomRef = doc(db, 'FrequencyRoom', room.id);
          const updatedPlayers = room.players.map(p => {
            if (p && p.name === currentPlayerName) {
              return { ...p, active: false };
            }
            return p;
          });
          await updateDoc(roomRef, { players: updatedPlayers });
          console.log('🔄 Marked player as inactive:', currentPlayerName);
        } catch (error) {
          console.error('Error marking player as inactive:', error);
        }
      }
      
      if (needleUpdateTimeout.current) {
        clearTimeout(needleUpdateTimeout.current);
      }
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    });
    return unsubscribeNav;
  }, [navigation, room, currentPlayerName]);

  // Reset force close modal flag when game status changes back to lobby
  useEffect(() => {
    if (room?.game_status === 'lobby' && forceCloseModal) {
      setForceCloseModal(false);
    }
  }, [room?.game_status, forceCloseModal]);

  const setupRealtimeListener = () => {
    // Prevent duplicate listeners
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    const roomRef = doc(db, 'FrequencyRoom', roomCode);
    
    unsubscribeRef.current = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const newRoom = { id: snapshot.id, ...snapshot.data() };
        
        // Sync drinking mode from room data
        if (newRoom.drinking_mode !== undefined) {
          setDrinkingMode(newRoom.drinking_mode);
          // Also sync to local storage
          storage.setItem('drinkingMode', newRoom.drinking_mode.toString()).catch(() => {});
        }
        
        // Handle reset trigger for showing ad to all players (non-host)
        // Show ad AFTER state has been updated to lobby (all players are on lobby screen)
        if (newRoom.reset_triggered_at && 
            newRoom.reset_triggered_at !== lastResetTriggerRef.current &&
            newRoom.game_status === 'lobby' &&
            newRoom.host_name !== currentPlayerName) {
          lastResetTriggerRef.current = newRoom.reset_triggered_at;
          // Show ad to non-host players - they're already on lobby screen
          showInterstitialIfAvailable(() => {
            // Ad closed, continue normally
          });
        }
        
        setRoom(prevRoom => {
          // Prevent out-of-order updates when app returns from background
          // Use turn index and round identifier to ensure we only apply updates from the current or newer round
          const currentTurnIndex = newRoom.current_turn_index;
          const currentRoundId = `${currentTurnIndex}-${newRoom.turn_phase || 'unknown'}-${newRoom.topic_update_timestamp || 0}`;
          
          // If we have a previous room, check if this update is from an older round/turn
          if (prevRoom && prevRoom.game_status === 'playing') {
            const prevTurnIndex = prevRoom.current_turn_index;
            const prevRoundId = `${prevTurnIndex}-${prevRoom.turn_phase || 'unknown'}-${prevRoom.topic_update_timestamp || 0}`;
            
            // If the new update is from an older turn, ignore it (this can happen when app returns from background)
            if (currentTurnIndex < prevTurnIndex && prevRoom.game_status === 'playing' && newRoom.game_status === 'playing') {
              console.warn('⚠️ Ignoring out-of-order update: new turn index is older than current');
              return prevRoom;
            }
            
            // If we're in the same turn but the round ID suggests this is an older update, be cautious
            if (currentTurnIndex === prevTurnIndex && 
                newRoom.topic_update_timestamp && 
                prevRoom.topic_update_timestamp &&
                newRoom.topic_update_timestamp < prevRoom.topic_update_timestamp) {
              console.warn('⚠️ Ignoring older topic update in same turn');
              // Keep previous topic but allow other fields to update
              newRoom.current_topic = prevRoom.current_topic;
            }
            
            // Validate round ID - if new round ID doesn't match expected, be cautious
            if (lastRoundIdRef.current && newRoom.current_round_id && 
                newRoom.current_round_id !== lastRoundIdRef.current &&
                currentTurnIndex === prevTurnIndex) {
              // This might be a stale update - check timestamps
              if (newRoom.topic_update_timestamp && prevRoom.topic_update_timestamp &&
                  newRoom.topic_update_timestamp < prevRoom.topic_update_timestamp) {
                console.warn('⚠️ Round ID mismatch with older timestamp - keeping previous state');
                return prevRoom;
              }
            }
            
            // Update refs to track current state
            lastTurnIndexRef.current = currentTurnIndex;
            if (newRoom.current_round_id) {
              lastRoundIdRef.current = newRoom.current_round_id;
            } else {
              lastRoundIdRef.current = currentRoundId;
            }
          } else if (!prevRoom) {
            // First load - initialize refs
            lastTurnIndexRef.current = currentTurnIndex;
            if (newRoom.current_round_id) {
              lastRoundIdRef.current = newRoom.current_round_id;
            } else {
              lastRoundIdRef.current = currentRoundId;
            }
          }
          
          // Preserve submitted needle positions - don't overwrite if player has already submitted
          // BUT only preserve if we're still in the same round
          if (prevRoom && currentPlayerName) {
            const hasSubmitted = hasPlayerSubmittedGuess(prevRoom, currentPlayerName);
            const isSameRound = prevRoom.current_turn_index === newRoom.current_turn_index && 
                               prevRoom.turn_phase === newRoom.turn_phase;
            
            if (hasSubmitted && isSameRound && prevRoom.needle_positions && prevRoom.needle_positions[currentPlayerName] !== undefined) {
              // Preserve the submitted needle position even if Firestore update doesn't have it yet
              // But only if we're in the same round
              const preservedNeedlePositions = {
                ...(newRoom.needle_positions || {}),
                [currentPlayerName]: prevRoom.needle_positions[currentPlayerName]
              };
              newRoom.needle_positions = preservedNeedlePositions;
            } else if (!isSameRound && hasSubmitted) {
              // New round - clear the submitted status for this player
              // The guess_submitted_names should already be cleared by the turn advancement
              // But ensure needle_positions doesn't have stale data
              if (newRoom.needle_positions && newRoom.needle_positions[currentPlayerName] !== undefined && 
                  !newRoom.guess_submitted_names?.[currentPlayerName]) {
                // Remove stale needle position if player hasn't submitted in new round
                const { [currentPlayerName]: removed, ...rest } = newRoom.needle_positions;
                newRoom.needle_positions = rest;
              }
            }
          }
          
          // Prevent topic flickering during turn advancement
          // When advancing a turn, use the pending topic we're setting instead of accepting
          // potentially stale data from Firestore snapshot
          if (pendingTopicRef.current) {
            const pendingTopic = pendingTopicRef.current;
            const isTransitioning = prevRoom?.turn_phase === 'summary' && newRoom.turn_phase === 'clue';
            const incomingTopicValid = newRoom.current_topic && 
                                     newRoom.current_topic.left_side && 
                                     newRoom.current_topic.right_side;
            const incomingMatches = incomingTopicValid &&
                                  newRoom.current_topic.left_side === pendingTopic.left_side &&
                                  newRoom.current_topic.right_side === pendingTopic.right_side;
            
            // Use pending topic if transitioning, if incoming doesn't match, or if incoming is invalid
            if (isTransitioning || !incomingMatches || !incomingTopicValid) {
              // Use pending topic but remove the internal _updateId field
              newRoom.current_topic = {
                left_side: pendingTopic.left_side,
                right_side: pendingTopic.right_side
              };
            } else if (incomingMatches && newRoom.turn_phase === 'clue') {
              // Topic matches and we're in the new phase - update completed successfully
              // Use the incoming topic from Firestore and clear the ref
              if (pendingTopicTimeoutRef.current) {
                clearTimeout(pendingTopicTimeoutRef.current);
                pendingTopicTimeoutRef.current = null;
              }
              pendingTopicRef.current = null;
            }
          } else {
            // No pending topic - ensure we have a valid topic when in playing state
            // If we're transitioning from summary to clue and there's no topic, this is an error
            if (prevRoom?.turn_phase === 'summary' && newRoom.turn_phase === 'clue' && 
                (!newRoom.current_topic || !newRoom.current_topic.left_side || !newRoom.current_topic.right_side)) {
              console.warn('⚠️ Missing topic during turn transition - keeping previous topic');
              // Keep previous topic if new one is invalid during transition
              if (prevRoom.current_topic) {
                newRoom.current_topic = prevRoom.current_topic;
              }
            }
          }
          
          // Update timestamp ref to track this update
          if (newRoom.topic_update_timestamp) {
            lastStateUpdateTimestampRef.current = newRoom.topic_update_timestamp;
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
      autoDeletionCleanupRef.current.cancelGameEnd = setupGameEndDeletion('FrequencyRoom', room.id, 5 * 60 * 1000);
      
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
      const cleanup = setupAllAutoDeletions('FrequencyRoom', room.id, {
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

  const calculateSectors = () => {
    const twoPointWidth = 10;
    const onePointWidth = 10;
    
    // Center of 2-point sector can be random between 5 and 175
    // This ensures the 2-point sector can appear anywhere in the gauge
    const minCenter = 5;
    const maxCenter = 175;
    const centerPos = Math.random() * (maxCenter - minCenter) + minCenter;
    
    // Calculate sector boundaries (may extend beyond 0-180)
    const leftStart = centerPos - twoPointWidth / 2 - onePointWidth;
    const leftEnd = centerPos - twoPointWidth / 2;
    const centerStart = centerPos - twoPointWidth / 2;
    const centerEnd = centerPos + twoPointWidth / 2;
    const rightStart = centerPos + twoPointWidth / 2;
    const rightEnd = centerPos + twoPointWidth / 2 + onePointWidth;
    
    return [
      { id: 'left', start: leftStart, end: leftEnd, points: 1 },
      { id: 'center', start: centerStart, end: centerEnd, points: 2 },
      { id: 'right', start: rightStart, end: rightEnd, points: 1 }
    ];
  };

  const getSectorScore = (guessAngle, sectors) => {
    // Clamp guess angle to valid range (0-180)
    const clampedAngle = Math.max(0, Math.min(180, guessAngle));
    
    for (const sector of sectors) {
      // Check if clamped angle falls within sector range
      // Sectors can extend beyond 0-180, but we only check the visible part
      const sectorStart = Math.max(0, sector.start);
      const sectorEnd = Math.min(180, sector.end);
      
      if (clampedAngle >= sectorStart && clampedAngle <= sectorEnd) {
        return sector.points;
      }
    }
    return 0;
  };

  // Helper function to check if an angle is within the correct sector (the one containing target_position)
  const isInCorrectSector = (guessAngle, targetPosition, sectors) => {
    // Find which sector contains the target position
    const clampedTarget = Math.max(0, Math.min(180, targetPosition));
    let correctSector = null;
    
    for (const sector of sectors) {
      const sectorStart = Math.max(0, sector.start);
      const sectorEnd = Math.min(180, sector.end);
      if (clampedTarget >= sectorStart && clampedTarget <= sectorEnd) {
        correctSector = sector;
        break;
      }
    }
    
    if (!correctSector) return false;
    
    // Check if guess angle is within the correct sector
    const clampedGuess = Math.max(0, Math.min(180, guessAngle));
    const sectorStart = Math.max(0, correctSector.start);
    const sectorEnd = Math.min(180, correctSector.end);
    
    return clampedGuess >= sectorStart && clampedGuess <= sectorEnd;
  };

  const getGuessSubmittedNames = (roomData) => {
    if (!roomData) return {};
    if (typeof roomData.guess_submitted_names === 'object' && roomData.guess_submitted_names !== null && !Array.isArray(roomData.guess_submitted_names)) {
      return roomData.guess_submitted_names;
    }
    return {};
  };

  const getGuessSubmittedCount = (roomData) => {
    const names = getGuessSubmittedNames(roomData);
    return Object.keys(names).length;
  };

  const hasPlayerSubmittedGuess = (roomData, playerName) => {
    const names = getGuessSubmittedNames(roomData);
    return names[playerName] === true;
  };

  const startGame = async () => {
    if (!room || room.host_name !== currentPlayerName) return;
    if (room.players.length < 2) {
      Alert.alert('שגיאה', 'צריך לפחות 2 שחקנים כדי להתחיל!');
      return;
    }

    try {
      const topicsSnapshot = await getDocs(collection(db, 'FrequencyTopic'));
      const allTopics = [];
      topicsSnapshot.forEach((doc) => {
        allTopics.push({ id: doc.id, ...doc.data() });
      });
      
      if (!allTopics || allTopics.length === 0) {
        Alert.alert('שגיאה', 'אין נושאים זמינים במערכת!');
        return;
      }

      const randomTopic = allTopics[Math.floor(Math.random() * allTopics.length)];
      const randomTarget = Math.floor(Math.random() * 180);
      const sectors = calculateSectors();

      if (!room || !room.id) {
        console.error('❌ Cannot start game: room or room.id is missing');
        Alert.alert('שגיאה', 'חדר לא נטען כראוי. נסה לרענן את הדף.');
        return;
      }

      if (!randomTopic || !randomTopic.left || !randomTopic.right) {
        console.error('❌ Invalid topic structure:', randomTopic);
        Alert.alert('שגיאה', 'נושא לא תקין. נסה שוב.');
        return;
      }

      console.log('🔵 Starting Frequency game, updating room:', room.id);
      try {
        const roomRef = doc(db, 'FrequencyRoom', room.id);
        const initialRoundId = `${room.current_turn_index || 0}-guessing-${Date.now()}`;
        const updates = {
          game_status: 'playing',
          current_topic: { left_side: randomTopic.left, right_side: randomTopic.right },
          target_position: randomTarget,
          current_round_sectors: sectors,
          turn_phase: 'guessing', // Automatically start in guessing phase
          guess_submitted_names: {},
          topic_update_timestamp: Date.now(),
          current_round_id: initialRoundId
        };
        await updateDoc(roomRef, updates);
        console.log('✅ Game started successfully');
        setRoom(prev => ({ ...prev, ...updates }));
        
        // Initialize refs
        lastTurnIndexRef.current = room.current_turn_index || 0;
        lastRoundIdRef.current = initialRoundId;
        
        // Log analytics event
        const { logGameStart } = await import('../../utils/analytics');
        logGameStart('frequency', room.id);
      } catch (error) {
        console.error('❌ Error starting game:', error);
        Alert.alert('שגיאה', 'שגיאה בהתחלת המשחק. נסה שוב.');
        return;
      }
    } catch (error) {
      console.error('Error starting game:', error);
      Alert.alert('שגיאה', 'שגיאה בהתחלת המשחק. נסה שוב.');
    }
  };

  const handleSubmitGuess = async () => {
    if (!room || isMyTurn()) return;
    if (!room?.id) return;

    if (isSubmittingGuess.current) {
      console.log('⚠️ Guess submission already in progress, skipping...');
      return;
    }

    if (hasPlayerSubmittedGuess(room, currentPlayerName)) {
      console.log('⚠️ Player already submitted guess, skipping...');
      return;
    }
    
    // Validate that we're in the correct phase and round
    if (room.turn_phase !== 'guessing') {
      console.warn('⚠️ Cannot submit guess - not in guessing phase');
      return;
    }
    
    // Ensure we're not submitting a guess for an old round
    // Check if the turn index matches what we expect
    if (lastTurnIndexRef.current !== null && room.current_turn_index !== lastTurnIndexRef.current) {
      console.warn('⚠️ Turn index mismatch - possible stale state, refreshing...');
      // Don't submit - let the realtime listener update the state first
      return;
    }

    isSubmittingGuess.current = true;

    // Lock the needle position immediately to prevent movement
    const angle = global.currentNeedlePosition || room.needle_positions?.[currentPlayerName] || 90;
    
    // Update local state immediately to lock the needle - use functional update to preserve state
    setRoom(prev => {
      const lockedNeedlePositions = { ...(prev.needle_positions || {}), [currentPlayerName]: angle };
      return { ...prev, needle_positions: lockedNeedlePositions };
    });
    
    // Store the locked angle to preserve it through async operations
    const lockedAngle = angle;
    
    try {
      const updatedNeedlePositions = { ...(room.needle_positions || {}), [currentPlayerName]: lockedAngle };
      
      const clueGiver = room.players[room.current_turn_index]?.name;
      
      const currentGuessSubmittedNames = getGuessSubmittedNames(room);
      const updatedGuessSubmittedNames = {
        ...currentGuessSubmittedNames,
        [currentPlayerName]: true
      };
      
      const activePlayers = (room.players || []).filter(p => p && p.name && (p.active !== false));
      const activeGuessers = activePlayers.filter(p => p.name !== clueGiver);
      const totalGuessersRequired = Math.max(activeGuessers.length, 0);
      const allGuessed = getGuessSubmittedCount({ guess_submitted_names: updatedGuessSubmittedNames }) === totalGuessersRequired;
    
      // Add round identifier to ensure guesses are tied to the correct round
      const currentRoundId = `${room.current_turn_index}-${room.turn_phase || 'guessing'}-${room.topic_update_timestamp || Date.now()}`;
      
      const updateData = {
        needle_positions: updatedNeedlePositions,
        guess_submitted_names: updatedGuessSubmittedNames,
        last_guess_result: null,
        current_round_id: currentRoundId // Track which round this guess belongs to
      };
      
      if (allGuessed) {
        const sectors = room.current_round_sectors || global.currentSectors || calculateSectors();
        const targetPos = room.target_position;
        
        const guessesSummary = room.players
          .filter(p => p && p.name && p.name !== clueGiver && (p.active !== false))
          .map(player => {
            const playerAngle = updatedNeedlePositions[player.name];
            return {
              player_name: player.name,
              guess_angle: playerAngle ?? null,
              points_earned: playerAngle !== undefined ? getSectorScore(playerAngle, sectors) : 0
            };
          });

        // Calculate clue giver points (half of total points earned by all guessers)
        const totalPointsEarnedByGuessers = guessesSummary.reduce((sum, guess) => sum + guess.points_earned, 0);
        const clueGiverPoints = totalPointsEarnedByGuessers / 2;

        // Evaluate drinking at end of round
        let drinkingPlayers = [];
        const drinkingModeActive = room.drinking_mode === true;
        
        if (drinkingModeActive && targetPos !== undefined && targetPos !== null) {
          // Get all active guessers (excluding clue giver)
          const activeGuessers = room.players.filter(p => 
            p && p.name && p.name !== clueGiver && (p.active !== false)
          );
          
          // Check which guessers got it correct (within correct sector)
          const correctGuessers = [];
          const incorrectGuessers = [];
          
          activeGuessers.forEach(player => {
            const angle = updatedNeedlePositions[player.name];
            if (angle !== undefined && isInCorrectSector(angle, targetPos, sectors)) {
              correctGuessers.push(player.name);
            } else {
              incorrectGuessers.push(player.name);
            }
          });
          
          // Case 1: No correct guesses → clue giver drinks
          if (correctGuessers.length === 0) {
            drinkingPlayers = [clueGiver];
          }
          // Case 2: Partial success → only failed guessers drink
          else if (incorrectGuessers.length > 0) {
            drinkingPlayers = incorrectGuessers;
          }
          // Case 3: Full success → no one drinks (drinkingPlayers stays empty)
        }

        updateData.turn_phase = 'summary';
        updateData.last_guess_result = {
          type: 'round_summary',
          target_angle: targetPos,
          sectors: sectors,
          guesses: guessesSummary,
          clue_giver: clueGiver,
          clue_giver_points: clueGiverPoints,
          show_popup: true
        };
        updateData.drinking_players = drinkingPlayers.length > 0 ? drinkingPlayers : null;
      }

      const roomRef = doc(db, 'FrequencyRoom', room.id);
      await updateDoc(roomRef, updateData);
      
      // Ensure the submitted position is preserved in local state after write
      // This prevents the realtime listener from overwriting it
      setRoom(prev => {
        // Preserve the submitted needle position
        const preservedNeedlePositions = { ...(prev.needle_positions || {}), [currentPlayerName]: lockedAngle };
        return { ...prev, needle_positions: preservedNeedlePositions, ...updateData };
      });
      
      console.log('✅ Guess submitted successfully');
    } catch (error) {
      console.error('❌ Error submitting guess:', error);
      // On error, still preserve the submitted position locally
      setRoom(prev => {
        const preservedNeedlePositions = { ...(prev.needle_positions || {}), [currentPlayerName]: lockedAngle };
        return { ...prev, needle_positions: preservedNeedlePositions };
      });
      Alert.alert('שגיאה', 'שגיאה בשליחת הניחוש. נסה שוב.');
    } finally {
      isSubmittingGuess.current = false;
    }
  };

  const advanceToNextTurn = async () => {
    if (!room || room.turn_phase !== 'summary') return;
    if (!room?.id) return;
    
    if (isProcessingReveal.current) {
      console.log('⚠️ Turn advance already processing, skipping...');
      return;
    }
    
    isProcessingReveal.current = true;
    console.log('🔄 Advancing to next Frequency turn...');

    try {
      const sectors = room.current_round_sectors;
      const currentClueGiver = room.players[room.current_turn_index]?.name;
      
      let totalPointsEarnedByGuessers = 0;
      const updatedPlayers = room.players.map(player => {
        // Skip inactive players in score calculation (but preserve their data)
        if (player.active === false) {
          return player;
        }
        
        if (player.name === currentClueGiver) {
          return player;
        }
        const angle = room.needle_positions[player.name];
        const pointsEarned = angle !== undefined ? getSectorScore(angle, sectors) : 0;
        totalPointsEarnedByGuessers += pointsEarned;
        
        return {
          ...player,
          score: player.score + pointsEarned
        };
      });
      
      const clueGiverPoints = totalPointsEarnedByGuessers / 2;
      const finalUpdatedPlayers = updatedPlayers.map(player => {
        // Skip inactive players
        if (player.active === false) {
          return player;
        }
        
        if (player.name === currentClueGiver) {
          return {
            ...player,
            score: player.score + clueGiverPoints
          };
        }
        return player;
      });
      
      // Only check active players for winner
      const winner = finalUpdatedPlayers.find(p => p && p.score >= 10 && (p.active !== false));
      
      if (winner) {
        try {
          const roomRef = doc(db, 'FrequencyRoom', room.id);
          await updateDoc(roomRef, {
            players: finalUpdatedPlayers,
            game_status: 'finished',
            winner_name: winner.name,
            last_guess_result: null,
            drinking_players: null // Clear drinking players when game ends
          });
        } catch (error) {
          console.error('Error finishing game:', error);
        }
      } else {
        // Find next active player for turn rotation
        const activePlayers = room.players.filter(p => p && p.name && (p.active !== false));
        if (activePlayers.length === 0) {
          console.warn('⚠️ No active players found, cannot advance turn');
          isProcessingReveal.current = false;
          return;
        }
        
        // Find current player index in active players
        const currentClueGiverName = room.players[room.current_turn_index]?.name;
        let currentActiveIndex = activePlayers.findIndex(p => p.name === currentClueGiverName);
        if (currentActiveIndex === -1) {
          currentActiveIndex = 0; // Fallback to first active player
        }
        
        // Move to next active player
        const nextActiveIndex = (currentActiveIndex + 1) % activePlayers.length;
        const nextPlayerName = activePlayers[nextActiveIndex].name;
        
        // Find the actual index in the full players array
        let nextTurnIndex = room.players.findIndex(p => p && p.name === nextPlayerName);
        if (nextTurnIndex === -1) {
          // Fallback: use first active player
          nextTurnIndex = room.players.findIndex(p => p && p.name && (p.active !== false));
          if (nextTurnIndex === -1) {
            console.warn('⚠️ Could not find next active player');
            isProcessingReveal.current = false;
            return;
          }
        }
        const topicsSnapshot = await getDocs(collection(db, 'FrequencyTopic'));
        const allTopics = [];
        topicsSnapshot.forEach((doc) => {
          allTopics.push({ id: doc.id, ...doc.data() });
        });
        
        if (!allTopics || allTopics.length === 0) {
          console.error('Error loading topics: no topics found');
          isProcessingReveal.current = false;
          return;
        }
        
        const randomTopic = allTopics[Math.floor(Math.random() * allTopics.length)];
        
        if (!randomTopic || !randomTopic.left || !randomTopic.right) {
          console.error('❌ Invalid topic structure:', randomTopic);
          isProcessingReveal.current = false;
          if (pendingTopicTimeoutRef.current) {
            clearTimeout(pendingTopicTimeoutRef.current);
            pendingTopicTimeoutRef.current = null;
          }
          pendingTopicRef.current = null;
          return;
        }
        
        const newTopic = { left_side: randomTopic.left, right_side: randomTopic.right };
        const randomTarget = Math.floor(Math.random() * 180);
        const newSectors = calculateSectors();

        // Store the topic in ref before updating Firestore to prevent race conditions
        // Use a unique identifier to track this specific topic update
        const topicUpdateId = Date.now();
        pendingTopicRef.current = { ...newTopic, _updateId: topicUpdateId };
        
        // Clear any existing timeout
        if (pendingTopicTimeoutRef.current) {
          clearTimeout(pendingTopicTimeoutRef.current);
          pendingTopicTimeoutRef.current = null;
        }
        
        // Set timeout to clear pendingTopicRef after 5 seconds as fallback
        // This ensures the ref doesn't stay forever if update doesn't complete
        pendingTopicTimeoutRef.current = setTimeout(() => {
          if (pendingTopicRef.current && pendingTopicRef.current._updateId === topicUpdateId) {
            console.warn('⚠️ Pending topic ref timeout - clearing after 5 seconds');
            pendingTopicRef.current = null;
          }
          pendingTopicTimeoutRef.current = null;
        }, 5000);

        try {
          const roomRef = doc(db, 'FrequencyRoom', room.id);
          // Update all fields atomically to prevent partial updates
          // Generate new round ID for the new turn
          const newRoundId = `${nextTurnIndex}-clue-${Date.now()}`;
          
          await updateDoc(roomRef, {
            players: finalUpdatedPlayers,
            current_turn_index: nextTurnIndex,
            current_topic: newTopic,
            target_position: randomTarget,
            needle_positions: {},
            guess_submitted_names: {},
            current_round_sectors: newSectors,
            turn_phase: 'clue',
            last_guess_result: null,
            drinking_players: null, // Clear drinking players when advancing turn
            topic_update_timestamp: Date.now(), // Add timestamp to track topic updates
            current_round_id: newRoundId // Set new round ID
          });
          
          // Update refs immediately to track the new round
          lastTurnIndexRef.current = nextTurnIndex;
          lastRoundIdRef.current = newRoundId;
          
          // Clear pending topic ref after successful update
          // The ref will be cleared when onSnapshot receives the correct topic
        } catch (error) {
          console.error('Error advancing to next turn:', error);
          if (pendingTopicTimeoutRef.current) {
            clearTimeout(pendingTopicTimeoutRef.current);
            pendingTopicTimeoutRef.current = null;
          }
          // Only clear if this is the same update that failed
          if (pendingTopicRef.current && pendingTopicRef.current._updateId === topicUpdateId) {
            pendingTopicRef.current = null;
          }
        }
      }
    } catch (error) {
      console.error('Error in advanceToNextTurn:', error);
      if (pendingTopicTimeoutRef.current) {
        clearTimeout(pendingTopicTimeoutRef.current);
        pendingTopicTimeoutRef.current = null;
      }
      pendingTopicRef.current = null;
    } finally {
      isProcessingReveal.current = false;
    }
  };

  const handleRoundSummaryContinue = async () => {
    if (isAdvancingTurn) return;
    setIsAdvancingTurn(true);
    await advanceToNextTurn();
    setIsAdvancingTurn(false);
  };

  const resetGame = async () => {
    if (!room || !room?.id || !isHost) return;

    // Force close modal immediately
    setForceCloseModal(true);

    if (typeof global !== 'undefined') {
      global.currentNeedlePosition = undefined;
      global.currentSectors = undefined;
    }

    if (needleUpdateTimeout.current) {
      clearTimeout(needleUpdateTimeout.current);
      needleUpdateTimeout.current = null;
    }
    isProcessingReveal.current = false;
    isSubmittingGuess.current = false;

    const resetPlayers = room.players.map(p => ({ ...p, score: 0, has_guessed: false }));

    try {
      // Update game state FIRST - this moves all players to lobby screen
      const roomRef = doc(db, 'FrequencyRoom', room.id);
      await updateDoc(roomRef, {
        players: resetPlayers,
        game_status: 'lobby',
        current_turn_index: 0,
        needle_positions: {},
        guess_submitted_names: {},
        current_topic: null,
        target_position: null,
        current_round_sectors: null,
        turn_phase: null,
        last_guess_result: null,
        winner_name: null,
        drinking_players: null,
        reset_triggered_at: Date.now() // Signal to other players to show ad
      });
      
      // Reset force close flag after a short delay
      setTimeout(() => {
        setForceCloseModal(false);
      }, 100);

      // Show ad AFTER state is updated - all players are now on lobby screen
      showInterstitialIfAvailable(() => {
        // Ad closed, continue normally
      });
    } catch (error) {
      console.error('Error resetting game:', error);
      setForceCloseModal(false);
    }
  };

  const handleRulesPress = () => {
    setShowRulesModal(true);
  };

  const goBack = async () => {
    // Show interstitial ad before navigating to main menu
    showInterstitialIfAvailable(async () => {
      // Cleanup all listeners and timers
      if (needleUpdateTimeout.current) {
        clearTimeout(needleUpdateTimeout.current);
        needleUpdateTimeout.current = null;
      }
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      
      // Clear saved room state when leaving
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

  const isMyTurn = () => {
    if (!room || !room.players) return false;
    return room.players[room.current_turn_index]?.name === currentPlayerName;
  };

  const getCurrentPlayerName = () => {
    if (!room || !room.players) return '';
    return room.players[room.current_turn_index]?.name || '';
  };

  const allPlayersGuessed = () => {
    if (!room || !room.players) return false;
    return getGuessSubmittedCount(room) === (room.players.length - 1);
  };

  if (error) {
    return (
      <GradientBackground variant="frequency">
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
            variant="frequency"
            style={styles.errorButton}
          />
        </View>
      </GradientBackground>
    );
  }

  if (isLoading || !room) {
    return (
      <GradientBackground variant="frequency">
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.loadingText}>טוען חדר משחק...</Text>
        </View>
      </GradientBackground>
    );
  }

  const isHost = room.host_name === currentPlayerName;

  return (
    <GradientBackground variant="darkBlue">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!room || room.game_status !== 'playing' || isMyTurn() || hasPlayerSubmittedGuess(room, currentPlayerName)}
        nestedScrollEnabled={true}
      >
        {/* Unified Top Bar */}
        <UnifiedTopBar
          roomCode={roomCode}
          variant="frequency"
          onExit={goBack}
          onRulesPress={handleRulesPress}
          drinkingMode={drinkingMode}
        />

        {/* Drinking Mode Badge */}
        {drinkingMode && (
          <View style={styles.drinkingBadgeWrapper}>
            <View style={styles.drinkingBadge}>
              <Text style={styles.drinkingBadgeText}>🍺 מצב שתייה</Text>
            </View>
          </View>
        )}

        {/* Rules Modal */}
        <RulesModal
          visible={showRulesModal}
          onClose={() => setShowRulesModal(false)}
          variant="frequency"
        />

        {/* Lobby State */}
        {room.game_status === 'lobby' && (
          <View style={styles.lobbyCard}>
            <View style={styles.lobbyHeader}>
              <Text style={styles.lobbyTitle}>לובי - ממתינים לשחקנים</Text>
            </View>
            <View style={styles.lobbyContent}>
              {isHost ? (
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
                            const roomRef = doc(db, 'FrequencyRoom', room.id);
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
                </View>
              ) : drinkingMode ? (
                <View style={styles.drinkingBadge}>
                  <Text style={styles.drinkingBadgeText}>🍺 מצב שתייה פעיל</Text>
                </View>
              ) : null}

              <View style={styles.playersSection}>
                <Text style={styles.playersTitle}>שחקנים בחדר ({room?.players && Array.isArray(room.players) ? room.players.length : 0}):</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.playersList}>
                  {room.players && Array.isArray(room.players) && room.players
                    .filter((player) => player != null && player.name != null)
                    .map((player, idx) => {
                      const playerName = typeof player.name === 'string' ? player.name : String(player.name || '');
                      return (
                        <View key={`player-${idx}`} style={styles.playerCard}>
                          <Text style={styles.playerCardName}>{playerName}</Text>
                          {playerName === room.host_name && (
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
                  variant="frequency"
                  style={styles.startButton}
                  disabled={room.players.length < 2}
                />
              )}

              {!isHost && (
                <Text style={styles.waitingText}>ממתין למארח להתחיל את המשחק...</Text>
              )}
            </View>
          </View>
        )}

        {/* Round Summary Modal */}
        {room.last_guess_result?.type === 'round_summary' && room.last_guess_result.show_popup && (
          <Modal
            visible={true}
            transparent={true}
            animationType="fade"
            onRequestClose={() => {}}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.summaryHeader}>
                  <Text style={styles.summaryIcon}>📊</Text>
                  <Text style={styles.summaryTitle}>סיכום הסיבוב</Text>
                  <Text style={styles.summarySubtitle}>
                    נותן הרמז: {room.last_guess_result.clue_giver || getCurrentPlayerName()}
                  </Text>
                </View>

                <ScrollView style={styles.summaryGuesses}>
                  {/* Clue Giver Points */}
                  {room.last_guess_result.clue_giver && (
                    <View style={[styles.guessRow, styles.clueGiverRow]}>
                      <View style={styles.guessInfo}>
                        <Text style={styles.guessPlayerName}>
                          {room.last_guess_result.clue_giver} (נותן הרמז)
                        </Text>
                        <Text style={styles.guessAngle}>
                          קיבל חצי מסך הנקודות שניתנו בסבב
                        </Text>
                      </View>
                      <View style={[styles.pointsBadge, styles.clueGiverPointsBadge, (room.last_guess_result.clue_giver_points || 0) > 0 && styles.pointsBadgeSuccess]}>
                        <Text style={[styles.pointsText, (room.last_guess_result.clue_giver_points || 0) > 0 && styles.pointsTextSuccess]}>
                          {(room.last_guess_result.clue_giver_points || 0) > 0 ? `+${(room.last_guess_result.clue_giver_points || 0).toFixed(1)} נק'` : '0 נקודות'}
                        </Text>
                      </View>
                    </View>
                  )}
                  
                  {/* Guessers Points */}
                  {(room.last_guess_result.guesses || []).map((guess, idx) => (
                    <View key={`${guess.player_name}-${idx}`} style={styles.guessRow}>
                      <View style={styles.guessInfo}>
                        <Text style={styles.guessPlayerName}>{guess.player_name}</Text>
                        <Text style={styles.guessAngle}>
                          {guess.guess_angle !== null ? `ניחש ${Math.round(guess.guess_angle)}°` : 'לא הוגש ניחוש'}
                        </Text>
                      </View>
                      <View style={[styles.pointsBadge, guess.points_earned > 0 && styles.pointsBadgeSuccess]}>
                        <Text style={[styles.pointsText, guess.points_earned > 0 && styles.pointsTextSuccess]}>
                          {guess.points_earned > 0 ? `+${guess.points_earned} נק'` : '0 נקודות'}
                        </Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>

                <View style={styles.summaryGauge}>
                  <FrequencyGauge
                    leftLabel={room.current_topic?.left_side || ''}
                    rightLabel={room.current_topic?.right_side || ''}
                    targetPosition={room.last_guess_result.target_angle}
                    showTarget={true}
                    needlePosition={room.last_guess_result.target_angle}
                    canMove={false}
                    showAllNeedles={true}
                    allNeedles={room.needle_positions}
                    sectors={room.last_guess_result.sectors || room.current_round_sectors}
                    players={room.players}
                    currentPlayerName={currentPlayerName}
                  />
                </View>

                <GradientButton
                  title={isAdvancingTurn ? 'מעביר תור...' : 'המשך לסיבוב הבא'}
                  onPress={handleRoundSummaryContinue}
                  variant="frequency"
                  style={styles.continueButton}
                  disabled={isAdvancingTurn}
                />
              </View>
            </View>
          </Modal>
        )}

        {/* Drinking Mode Modal */}
        {room.drinking_players && room.drinking_players.length > 0 && (
          <Modal
            visible={true}
            transparent={true}
            animationType="fade"
            onRequestClose={() => {}}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.drinkingIcon}>🍺</Text>
                <Text style={styles.drinkingTitle}>זמן שתייה!</Text>
                <Text style={styles.drinkingMessage}>
                  {(() => {
                    const clueGiver = room.players[room.current_turn_index]?.name;
                    const isClueGiverDrinking = room.drinking_players.includes(clueGiver);
                    
                    if (isClueGiverDrinking) {
                      return 'אף אחד לא ניחש נכון – נותן הרמז חייבת לשתות!';
                    } else if (room.drinking_players.length === 1) {
                      return 'פספסת את התדר!';
                    } else {
                      return 'פספסתם את התדר!';
                    }
                  })()}
                </Text>
                <View style={styles.drinkingPlayersList}>
                  {room.drinking_players.map((name, idx) => (
                    <View key={idx} style={styles.drinkingPlayerBadge}>
                      <Text style={styles.drinkingPlayerName}>{name}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.drinkingEmoji}>🍻</Text>
                <Text style={styles.drinkingAction}>
                  {room.drinking_players.length === 1 ? 'קח שוט! 🥃' : 'קחו שוט! 🥃'}
                </Text>
                <GradientButton
                  title="המשך"
                  onPress={async () => {
                    if (!room?.id) return;
                    try {
                      const roomRef = doc(db, 'FrequencyRoom', room.id);
                      await updateDoc(roomRef, {
                        drinking_players: null
                      });
                    } catch (error) {
                      console.error('Error clearing drinking players:', error);
                    }
                  }}
                  variant="frequency"
                  style={styles.continueButton}
                />
              </View>
            </View>
          </Modal>
        )}

        {/* Playing State */}
        {room.game_status === 'playing' && (
          <View style={styles.gameContainer}>
            <View style={styles.gameMain}>
              <View style={styles.statusCard}>
                {isMyTurn() ? (
                  <>
                    <View style={styles.turnBadge}>
                      <Text style={styles.turnBadgeText}>🎮 התור שלך!</Text>
                    </View>
                    <Text style={styles.turnMessage}>תן רמז לשחקנים האחרים - השחקנים מנחשים...</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.turnMessage}>התור של {getCurrentPlayerName()}</Text>
                    {!hasPlayerSubmittedGuess(room, currentPlayerName) && (
                      <Text style={styles.guessHint}>גע או גרור את המחוגן למיקום הנכון ולחץ שלח ניחוש</Text>
                    )}
                    {hasPlayerSubmittedGuess(room, currentPlayerName) && (
                      <View style={styles.submittedBadge}>
                        <Text style={styles.submittedText}>✓ ניחשת!</Text>
                      </View>
                    )}
                  </>
                )}
              </View>

              <View 
                style={styles.gaugeContainer}
                onStartShouldSetResponder={() => !isMyTurn() && !hasPlayerSubmittedGuess(room, currentPlayerName) && room.game_status === 'playing'}
                onMoveShouldSetResponder={() => !isMyTurn() && !hasPlayerSubmittedGuess(room, currentPlayerName) && room.game_status === 'playing'}
                onResponderTerminationRequest={() => false}
                onTouchStart={(e) => {
                  if (!isMyTurn() && !hasPlayerSubmittedGuess(room, currentPlayerName) && room.game_status === 'playing') {
                    e.stopPropagation();
                  }
                }}
                onTouchMove={(e) => {
                  if (!isMyTurn() && !hasPlayerSubmittedGuess(room, currentPlayerName) && room.game_status === 'playing') {
                    e.stopPropagation();
                  }
                }}
              >
                <FrequencyGauge
                  leftLabel={room.current_topic?.left_side || ''}
                  rightLabel={room.current_topic?.right_side || ''}
                  targetPosition={room.target_position}
                  showTarget={isMyTurn()}
                  needlePosition={(() => {
                    // Preserve submitted position - use stored value if player has submitted
                    const storedPosition = room.needle_positions?.[currentPlayerName];
                    if (hasPlayerSubmittedGuess(room, currentPlayerName) && storedPosition !== undefined) {
                      return storedPosition;
                    }
                    // Use global position if available (for active dragging), otherwise fallback to stored or 90
                    return global.currentNeedlePosition || storedPosition || 90;
                  })()}
                  canMove={!isMyTurn() && !hasPlayerSubmittedGuess(room, currentPlayerName) && room.game_status === 'playing'}
                  showAllNeedles={isMyTurn() || allPlayersGuessed()}
                  allNeedles={room.needle_positions}
                  sectors={room.current_round_sectors}
                  players={room.players}
                  currentPlayerName={currentPlayerName}
                />
              </View>

              {/* Guess Progress */}
              {room.game_status === 'playing' && (room.turn_phase === 'guessing' || room.turn_phase === 'clue') && (
                <View style={styles.progressCard}>
                  <Text style={styles.progressText}>
                    {getGuessSubmittedCount(room)} מתוך {Math.max((room.players || []).filter(p => p.name !== room.players[room.current_turn_index]?.name).length, 0)} שחקנים ניחשו
                  </Text>
                  <View style={styles.submittedPlayersList}>
                    {(() => {
                      const submittedNames = getGuessSubmittedNames(room);
                      const clueGiver = room.players[room.current_turn_index]?.name;
                      const submittedPlayers = room.players
                        .filter(p => p.name !== clueGiver && submittedNames[p.name] === true)
                        .map(p => p.name);
                      
                      if (submittedPlayers.length === 0) {
                        return <Text style={styles.noGuessesText}>אין שחקנים שניחשו עדיין</Text>;
                      }
                      
                      return submittedPlayers.map((playerName, idx) => (
                        <View key={`${playerName}-${idx}`} style={styles.submittedPlayerBadge}>
                          <Text style={styles.submittedPlayerText}>✓ {playerName}</Text>
                        </View>
                      ));
                    })()}
                  </View>
                </View>
              )}

              {!isMyTurn() && !hasPlayerSubmittedGuess(room, currentPlayerName) && (
                <GradientButton
                  title="שלח ניחוש"
                  onPress={handleSubmitGuess}
                  variant="frequency"
                  style={styles.submitButton}
                />
              )}

              {isMyTurn() && room.turn_phase === 'summary' && (
                <View style={styles.waitingSummaryCard}>
                  <Text style={styles.waitingSummaryText}>📊 ממתין לסיכום הסיבוב...</Text>
                </View>
              )}
            </View>

            <View style={styles.scoreboardContainer}>
              <ScoreBoard players={room.players.filter(p => p && p.name && (p.active !== false))} currentTurnIndex={room.current_turn_index} />
            </View>
          </View>
        )}

        {/* Finished State Modal */}
        {room.game_status === 'finished' && !forceCloseModal && (
          <Modal
            visible={true}
            transparent={true}
            animationType="fade"
            onRequestClose={() => {}}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.finishedHeader}>
                  <Text style={styles.finishedTitle}>🎉 המשחק הסתיים! 🎉</Text>
                </View>

                {/* Podium */}
                <View style={styles.podiumContainer}>
                  {[...room.players]
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 3)
                    .map((player, idx) => {
                      const position = idx === 0 ? 1 : idx === 1 ? 2 : 3;
                      const medals = ['🥇', '🥈', '🥉'];
                      const order = idx === 0 ? 1 : idx === 1 ? 0 : 2;
                      
                      return (
                        <View key={player.name} style={[styles.podiumItem, { order }]}>
                          <Text style={styles.medal}>{medals[idx]}</Text>
                          <Text style={styles.podiumName}>{player.name}</Text>
                          <View style={styles.podiumScore}>
                            <Text style={styles.podiumScoreText}>{player.score} נקודות</Text>
                          </View>
                          <View style={[styles.podiumBase, styles[`podium${position}`]]}>
                            <Text style={styles.podiumNumber}>{position}</Text>
                          </View>
                        </View>
                      );
                    })}
                </View>

                {/* All Players Results */}
                {room.players.length > 3 && (
                  <View style={styles.otherPlayersSection}>
                    <Text style={styles.otherPlayersTitle}>שאר השחקנים:</Text>
                    {[...room.players]
                      .sort((a, b) => b.score - a.score)
                      .slice(3)
                      .map((player, idx) => (
                        <View key={player.name} style={styles.otherPlayerRow}>
                          <Text style={styles.otherPlayerRank}>#{idx + 4}</Text>
                          <Text style={styles.otherPlayerName}>{player.name}</Text>
                          <Text style={styles.otherPlayerScore}>{player.score} נקודות</Text>
                        </View>
                      ))}
                  </View>
                )}

                <View style={styles.finishedActions}>
                  <GradientButton
                    title="משחק חדש"
                    onPress={resetGame}
                    variant="frequency"
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
                    style={styles.backHomeButton}
                  />
                </View>
              </View>
            </View>
          </Modal>
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
    gap: 4,
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
  drinkingBadgeWrapper: {
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  drinkingBadge: {
    backgroundColor: '#F97316',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
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
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  whiteCopyLinkButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  whiteCopyLinkButtonText: {
    color: '#7A2FE2',
    fontSize: 14,
    fontWeight: '600',
  },
  roomCodeLabel: {
    color: '#6B7280',
    fontSize: 12,
  },
  roomCodeText: {
    color: '#0A1A3A', // Frequency theme color - navy blue
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
    backgroundColor: '#0A1A3A', // Frequency theme color - navy blue
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
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#0A1A3A', // Frequency theme color - navy blue
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
  playersSection: {
    gap: 12,
  },
  playersTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  playersList: {
    gap: 12,
    paddingVertical: 4,
  },
  playerCard: {
    minWidth: 100,
    backgroundColor: '#F9FAFB',
    borderWidth: 2,
    borderColor: '#0A1A3A', // Frequency theme color - navy blue
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  playerCardName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0A1A3A', // Frequency theme color - כחול כהה
  },
  crownIconSmall: {
    fontSize: 12,
  },
  startButton: {
    marginTop: 8,
  },
  waitingText: {
    textAlign: 'center',
    color: '#6B7280',
    fontSize: 14,
  },
  gameContainer: {
    gap: 16,
  },
  gameMain: {
    gap: 16,
  },
  statusCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  turnBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  turnBadgeText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  turnMessage: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
    textAlign: 'center',
  },
  guessHint: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3B82F6',
    textAlign: 'center',
  },
  submittedBadge: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  submittedText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  gaugeContainer: {
    alignItems: 'center',
    // Prevent scroll when interacting with gauge
    touchAction: 'none',
    zIndex: 10,
  },
  progressCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  progressText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
  submittedPlayersList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  noGuessesText: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  submittedPlayerBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  submittedPlayerText: {
    color: '#0A1A3A', // Frequency theme color - כחול כהה
    fontSize: 12,
    fontWeight: '600',
  },
  submitButton: {
    marginTop: 8,
  },
  waitingSummaryCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#0A1A3A', // Frequency theme color - navy blue
    borderRadius: 16,
    padding: 16,
  },
  waitingSummaryText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#0A1A3A', // Frequency theme color - navy blue
    textAlign: 'center',
  },
  scoreboardContainer: {
    marginTop: 16,
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
    padding: 24,
    width: '100%',
    maxWidth: 600,
    maxHeight: '90%',
    gap: 16,
  },
  summaryHeader: {
    alignItems: 'center',
    gap: 8,
  },
  summaryIcon: {
    fontSize: 48,
  },
  summaryTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0A1A3A', // Frequency theme color - navy blue
  },
  summarySubtitle: {
    fontSize: 16,
    color: '#374151',
  },
  summaryGuesses: {
    maxHeight: 200,
  },
  guessRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  clueGiverRow: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
    borderWidth: 2,
    marginBottom: 12,
  },
  clueGiverPointsBadge: {
    backgroundColor: '#DBEAFE',
  },
  guessInfo: {
    flex: 1,
  },
  guessPlayerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0A1A3A', // Frequency theme color - כחול כהה
  },
  guessAngle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  pointsBadge: {
    backgroundColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  pointsBadgeSuccess: {
    backgroundColor: '#10B981',
  },
  pointsText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  pointsTextSuccess: {
    color: '#FFFFFF',
  },
  summaryGauge: {
    alignItems: 'center',
  },
  continueButton: {
    marginTop: 8,
  },
  drinkingIcon: {
    fontSize: 56,
    textAlign: 'center',
  },
  drinkingTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#F97316',
    textAlign: 'center',
  },
  drinkingMessage: {
    fontSize: 20,
    color: '#374151',
    textAlign: 'center',
  },
  drinkingPlayersList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 16,
  },
  drinkingPlayerBadge: {
    backgroundColor: '#F97316',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  drinkingPlayerName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  drinkingEmoji: {
    fontSize: 48,
    textAlign: 'center',
  },
  drinkingAction: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F97316',
    textAlign: 'center',
  },
  finishedHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  finishedTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
  },
  podiumContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 24,
  },
  podiumItem: {
    alignItems: 'center',
    gap: 8,
  },
  medal: {
    fontSize: 40,
  },
  podiumName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  podiumScore: {
    backgroundColor: '#0A1A3A', // Frequency theme color - navy blue
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  podiumScoreText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  podiumBase: {
    width: 80,
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  podium1: {
    height: 120,
    backgroundColor: '#FCD34D',
  },
  podium2: {
    height: 100,
    backgroundColor: '#D1D5DB',
  },
  podium3: {
    height: 80,
    backgroundColor: '#F59E0B',
  },
  podiumNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  otherPlayersSection: {
    gap: 8,
    marginBottom: 24,
  },
  otherPlayersTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
  },
  otherPlayerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
  },
  otherPlayerRank: {
    fontSize: 14,
    color: '#6B7280',
  },
  otherPlayerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  otherPlayerScore: {
    fontSize: 14,
    color: '#6B7280',
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
  hostOnlyText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  backHomeButton: {
    marginTop: 8,
  },
});
