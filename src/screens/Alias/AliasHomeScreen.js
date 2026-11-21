import { collection, doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import BannerAd from '../../components/shared/BannerAd';
import { db } from '../../firebase';
import { generateUniqueRoomCode } from '../../utils/roomManagement';
import storage from '../../utils/storage';
import { S } from '../../strings';
import { GameEntryLayout } from '../../ui';

const TEAM_COLORS = ["#EF4444", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316"];



const BASE_TEAMS = [
  { name: "קבוצה אדומה", position: 0, color: TEAM_COLORS[0], players: [] },
  { name: "קבוצה ירוקה", position: 0, color: TEAM_COLORS[2], players: [] }
];

export default function AliasHomeScreen({ navigation, route }) {
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const isCreatingRoomRef = useRef(false);

  useEffect(() => {
    const loadSavedName = async () => {
      try {
        const savedName = await storage.getItem('playerName');
        if (savedName) {
          setPlayerName(savedName);
        }
      } catch (e) {
        console.warn('Could not load saved player name:', e);
      }
    };
    loadSavedName();
    
    // Check for pre-filled room code from deep link
    if (route?.params?.prefillRoomCode) {
      setRoomCode(route.params.prefillRoomCode);
    }
  }, [route?.params?.prefillRoomCode]);

  const generateRoomCode = () => {
    return Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  };

  const createRoom = async () => {
    if (isCreatingRoomRef.current) {
      console.log('⚠️ Room creation already in progress, ignoring duplicate call');
      return;
    }

    if (!playerName.trim()) {
      setError(S.entry.errors.nameRequired);
      return;
    }

    isCreatingRoomRef.current = true;
    setIsCreating(true);
    setError('');

    try {
      await storage.setItem('playerName', playerName);
    } catch (e) {
      console.warn('⚠️ Could not save player name:', e);
    }

    try {
      if (!db) {
        throw new Error('Firestore database is not initialized');
      }

      console.log('🔵 Starting room creation process...');

      // Generate unique room code using utility
      const newRoomCode = await generateUniqueRoomCode('GameRoom', generateRoomCode);
      
      if (!newRoomCode) {
        setError(S.entry.errors.uniqueCodeFailed);
        isCreatingRoomRef.current = false;
        setIsCreating(false);
        return;
      }

      const roomData = {
        room_code: newRoomCode,
        host_name: playerName,
        teams: BASE_TEAMS,
        game_status: 'setup',
        current_turn: 0,
        round_active: false,
        current_round_score: 0,
        golden_rounds_enabled: false,
        created_at: Date.now(), // Store as timestamp for age calculation
        expires_at: Timestamp.fromMillis(Date.now() + (2 * 60 * 60 * 1000)) // 2 hours from now
      };

      console.log('🔵 Creating room with code:', newRoomCode);

      const gameRoomCollection = collection(db, 'GameRoom');
      const roomRef = doc(gameRoomCollection, newRoomCode);

      try {
        console.log('🔵 [ALIAS] setDoc() call initiated');
        await setDoc(roomRef, roomData);
        console.log('✅ [ALIAS] setDoc() write completed successfully!');
        // No need to verify - if setDoc succeeds, document exists
      } catch (writeError) {
        console.error('❌ [ALIAS] Error during setDoc:', writeError);
        isCreatingRoomRef.current = false;
        setIsCreating(false);
        throw writeError;
      }

      console.log('✅ [ALIAS] Room created successfully with code:', newRoomCode);
      
      // Log analytics event
      const { logCreateRoom } = await import('../../utils/analytics');
      logCreateRoom('alias', newRoomCode);
      
      // Navigate to setup screen
      navigation.navigate('AliasSetup', { roomCode: newRoomCode });
    } catch (error) {
      console.error('❌ [ALIAS] Error creating room:', error);
      isCreatingRoomRef.current = false;
      setIsCreating(false);

      let errorMessage = S.entry.errors.createFailed;
      if (error.code === 'unavailable' || error.code === 'failed-precondition' || error.message?.includes('offline')) {
        errorMessage = S.entry.errors.notConnected;
      } else if (error.code === 'permission-denied') {
        errorMessage = S.entry.errors.permissionWrite;
      } else if (error.code === 'not-found') {
        errorMessage = S.entry.errors.notFound;
      }

      setError(errorMessage);
      Alert.alert(S.common.error, errorMessage + S.entry.errors.detailsPrefix + error.message);
    } finally {
      setTimeout(() => {
        isCreatingRoomRef.current = false;
        setIsCreating(false);
      }, 1000);
    }
  };

  const joinRoom = async () => {
    if (!playerName.trim()) {
      setError(S.entry.errors.nameRequired);
      return;
    }
    if (!roomCode.trim()) {
      setError(S.entry.errors.codeRequired);
      return;
    }

    try {
      // Check if room exists and if game is already playing
      const roomRef = doc(db, 'GameRoom', roomCode.toUpperCase());
      const roomSnap = await getDoc(roomRef);
      
      if (roomSnap.exists()) {
        const roomData = roomSnap.data();
        
        // Check if player is already in room (in any team)
        const playerInRoom = roomData.teams && Array.isArray(roomData.teams) &&
          roomData.teams.some(team => 
            team.players && Array.isArray(team.players) && 
            team.players.some(p => p && p.name === playerName)
          ) || roomData.host_name === playerName;
        
        // If game is playing or finished and player is not in room, show error
        if ((roomData.game_status === 'playing' || roomData.game_status === 'waiting' || roomData.game_status === 'finished') && !playerInRoom) {
          setError(S.entry.errors.gameStarted);
          return;
        }
      }
      
      await storage.setItem('playerName', playerName);
      
      // Log analytics event
      const { logJoinRoom } = await import('../../utils/analytics');
      logJoinRoom('alias', roomCode.toUpperCase());
      
      // Navigate to setup screen
      navigation.navigate('AliasSetup', { roomCode: roomCode.toUpperCase() });
    } catch (e) {
      console.warn('Could not save player name:', e);
      
      // Navigate to setup screen
      navigation.navigate('AliasSetup', { roomCode: roomCode.toUpperCase() });
    }
  };

  const goBack = () => {
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
  };

  return (
    <GameEntryLayout
      icon="alias"
      title={S.alias.entry.title}
      subtitle={S.alias.entry.subtitle}
      playerName={playerName}
      onChangePlayerName={(text) => {
        setPlayerName(text);
        setError('');
      }}
      roomCode={roomCode}
      onChangeRoomCode={(text) => {
        setRoomCode(text.toUpperCase());
        setError('');
      }}
      roomCodeMaxLength={4}
      error={error}
      isCreating={isCreating}
      onCreate={createRoom}
      onJoin={joinRoom}
      onBack={goBack}
      steps={S.alias.entry.steps}
      footer={<BannerAd />}
    />
  );
}
