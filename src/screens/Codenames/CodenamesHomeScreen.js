import React, { useState, useEffect, useRef } from 'react';
import BannerAd from '../../components/shared/BannerAd';
import { db } from '../../firebase';
import { doc, getDoc, setDoc, query, collection, where, getDocs, Timestamp } from 'firebase/firestore';
import storage from '../../utils/storage';
import { S } from '../../strings';
import { GameEntryLayout } from '../../ui';
import { generateUniqueRoomCode } from '../../utils/roomManagement';





export default function CodenamesHomeScreen({ navigation, route }) {
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
      console.log('⚠️ [CODENAMES] Room creation already in progress, ignoring duplicate call');
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
      console.warn('⚠️ [CODENAMES] Could not save player name:', e);
    }

    try {
      if (!db) {
        throw new Error('Firestore database is not initialized');
      }

      // Generate unique room code using utility
      const newRoomCode = await generateUniqueRoomCode('CodenamesRoom', generateRoomCode);
      
      if (!newRoomCode) {
        setError(S.entry.errors.uniqueCodeFailed);
        isCreatingRoomRef.current = false;
        setIsCreating(false);
        return;
      }
      
      console.log('🔵 [CODENAMES] Creating Codenames room with code:', newRoomCode);
      
      const roomData = {
        room_code: newRoomCode,
        host_name: playerName,
        game_mode: 'friends',
        red_team: {
          spymaster: '',
          guessers: [],
          revealed_words: []
        },
        blue_team: {
          spymaster: '',
          guessers: [],
          revealed_words: []
        },
        game_status: 'setup',
        current_turn: 'red',
        starting_team: 'red',
        board_words: [],
        key_map: [],
        guesses_remaining: 0,
        turn_phase: 'clue',
        created_at: Date.now(), // Store as timestamp for age calculation
        expires_at: Timestamp.fromMillis(Date.now() + (2 * 60 * 60 * 1000)) // 2 hours from now
      };
      
      console.log('🔵 [CODENAMES] About to call setDoc() - execution checkpoint 1');
      const roomRef = doc(db, 'CodenamesRoom', newRoomCode);
      
      try {
        console.log('🔵 [CODENAMES] setDoc() call initiated');
        await setDoc(roomRef, roomData);
        console.log('✅ [CODENAMES] setDoc() write completed successfully!');
        // No need to verify - if setDoc succeeds, document exists
      } catch (writeError) {
        console.error('❌ [CODENAMES] Error during setDoc:', writeError);
        console.error('❌ [CODENAMES] Error code:', writeError.code);
        console.error('❌ [CODENAMES] Error message:', writeError.message);
        isCreatingRoomRef.current = false;
        throw writeError;
      }
      
      console.log('✅ [CODENAMES] Room created successfully with code:', newRoomCode);
      console.log('🔵 [CODENAMES] About to navigate - execution checkpoint 4');
      
      // Log analytics event
      const { logCreateRoom } = await import('../../utils/analytics');
      logCreateRoom('codenames', newRoomCode);
      
      // Navigate to setup screen
      navigation.navigate('CodenamesSetup', { roomCode: newRoomCode, gameMode: 'friends' });
      console.log('✅ [CODENAMES] Navigation initiated - execution checkpoint 5');
    } catch (error) {
      console.error('❌ [CODENAMES] Error creating room:', error);
      isCreatingRoomRef.current = false;
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
      setIsCreating(false);
      setTimeout(() => {
        isCreatingRoomRef.current = false;
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
      await storage.setItem('playerName', playerName);
      
      // Log analytics event
      const { logJoinRoom } = await import('../../utils/analytics');
      logJoinRoom('codenames', roomCode.toUpperCase());
      
      // Navigate to setup screen
      navigation.navigate('CodenamesSetup', { roomCode: roomCode.toUpperCase(), gameMode: 'friends' });
    } catch (error) {
      console.error('❌ Error joining room:', error);
      setError(S.entry.errors.joinFailed);
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
      icon="codenames"
      title={S.codenames.entry.title}
      subtitle={S.codenames.entry.subtitle}
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
      steps={S.codenames.entry.steps}
      footer={<BannerAd />}
    />
  );
}
