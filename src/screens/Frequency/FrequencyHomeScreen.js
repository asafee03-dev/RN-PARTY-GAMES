import { doc, setDoc, Timestamp } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import BannerAd from '../../components/shared/BannerAd';
import { db } from '../../firebase';
import { generateUniqueRoomCode } from '../../utils/roomManagement';
import storage from '../../utils/storage';
import { S } from '../../strings';
import { GameEntryLayout } from '../../ui';

const PLAYER_COLORS = ["#F59E0B", "#EF4444", "#8B5CF6", "#10B981", "#3B82F6", "#EC4899", "#F97316", "#14B8A6"];

export default function FrequencyHomeScreen({ navigation, route }) {
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
    // Prevent multiple simultaneous calls
    if (isCreatingRoomRef.current) {
      console.log('⚠️ [FREQUENCY] Room creation already in progress, ignoring duplicate call');
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
      console.warn('⚠️ [FREQUENCY] Could not save player name:', e);
    }

    try {
      if (!db) {
        throw new Error('Firestore database is not initialized');
      }

      // Generate unique room code using utility
      const newRoomCode = await generateUniqueRoomCode('FrequencyRoom', generateRoomCode);
      
      if (!newRoomCode) {
        setError(S.entry.errors.uniqueCodeFailed);
        isCreatingRoomRef.current = false;
        setIsCreating(false);
        return;
      }

      console.log('🔵 [FREQUENCY] Creating Frequency room with code:', newRoomCode);

      // Create room document with room_code as document ID
      const roomData = {
        room_code: newRoomCode,
        host_name: playerName,
        players: [{ name: playerName, score: 0, has_guessed: false, color: PLAYER_COLORS[0], active: true }],
        game_status: 'lobby',
        current_turn_index: 0,
        needle_positions: {},
        created_at: Date.now(), // Store as timestamp for age calculation
        expires_at: Timestamp.fromMillis(Date.now() + (2 * 60 * 60 * 1000)) // 2 hours from now
      };

      const roomRef = doc(db, 'FrequencyRoom', newRoomCode);
      console.log('🔵 [FREQUENCY] Calling setDoc with room code:', newRoomCode);
      console.log('🔵 [FREQUENCY] Room data:', JSON.stringify(roomData, null, 2));
      
      try {
        await setDoc(roomRef, roomData);
        console.log('✅ [FREQUENCY] setDoc completed successfully');
      } catch (setDocError) {
        console.error('❌ [FREQUENCY] setDoc failed:', setDocError);
        console.error('❌ [FREQUENCY] Error code:', setDocError.code);
        console.error('❌ [FREQUENCY] Error message:', setDocError.message);
        throw setDocError;
      }
      
      console.log('✅ [FREQUENCY] Room created successfully with code:', newRoomCode);
      
      // Log analytics event
      const { logCreateRoom } = await import('../../utils/analytics');
      logCreateRoom('frequency', newRoomCode);
      
      // Save player name BEFORE navigation (like Alias does)
      try {
        await storage.setItem('playerName', playerName);
        console.log('✅ [FREQUENCY] Player name saved to storage');
      } catch (e) {
        console.warn('⚠️ [FREQUENCY] Could not save player name:', e);
      }
      
      // Navigate to room
      console.log('🔵 [FREQUENCY] Navigating to room...');
      navigation.navigate('FrequencyRoom', { roomCode: newRoomCode });
    } catch (error) {
      console.error('❌ [FREQUENCY] Error creating room:', error);
      let errorMessage = S.entry.errors.createFailed;
      if (error.message?.includes('Firestore Rules')) {
        errorMessage = S.entry.errors.rulesBlocked;
      } else if (error.code === 'permission-denied') {
        errorMessage = S.entry.errors.permissionDenied;
      } else if (error.code === 'unavailable') {
        errorMessage = S.entry.errors.unavailable;
      }
      setError(errorMessage);
    } finally {
      isCreatingRoomRef.current = false;
      setIsCreating(false);
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
      await storage.setItem('playerName', playerName);
      
      // Log analytics event
      const { logJoinRoom } = await import('../../utils/analytics');
      logJoinRoom('frequency', roomCode.toUpperCase());
      
      // Navigate to room
      navigation.navigate('FrequencyRoom', { roomCode: roomCode.toUpperCase() });
    } catch (e) {
      console.warn('Could not save player name:', e);
      
      // Log analytics event
      const { logJoinRoom } = await import('../../utils/analytics');
      logJoinRoom('frequency', roomCode.toUpperCase());
      
      // Navigate to room
      navigation.navigate('FrequencyRoom', { roomCode: roomCode.toUpperCase() });
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
      icon="frequency"
      title={S.frequency.entry.title}
      subtitle={S.frequency.entry.subtitle}
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
      steps={S.frequency.entry.steps}
      footer={<BannerAd />}
    />
  );
}
