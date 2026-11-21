import React, { useState, useEffect, useRef } from 'react';
import BannerAd from '../../components/shared/BannerAd';
import PlayModeDialog from '../../components/shared/PlayModeDialog';
import { db } from '../../firebase';
import { doc, getDoc, setDoc, query, collection, where, getDocs, Timestamp } from 'firebase/firestore';
import storage from '../../utils/storage';
import { S } from '../../strings';
import { GameEntryLayout } from '../../ui';
import { generateUniqueRoomCode } from '../../utils/roomManagement';


export default function SpyHomeScreen({ navigation, route }) {
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [modeDialogOpen, setModeDialogOpen] = useState(false);
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
      console.log('⚠️ [SPY] Room creation already in progress, ignoring duplicate call');
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
      console.warn('⚠️ [SPY] Could not save player name:', e);
    }

    try {
      if (!db) {
        throw new Error('Firestore database is not initialized');
      }

      // Generate unique room code using utility
      const newRoomCode = await generateUniqueRoomCode('SpyRoom', generateRoomCode);
      
      if (!newRoomCode) {
        setError(S.entry.errors.uniqueCodeFailed);
        isCreatingRoomRef.current = false;
        setIsCreating(false);
        return;
      }

      console.log('🔵 [SPY] Creating Spy room with code:', newRoomCode);

      const roomData = {
        room_code: newRoomCode,
        host_name: playerName,
        players: [{ name: playerName }],
        game_status: 'lobby',
        number_of_spies: 1, // Default to 1 spy
        game_mode: 'locations', // Default mode (set here so the room screen doesn't write it on load)
        created_at: Date.now(), // Store as timestamp for age calculation
        expires_at: Timestamp.fromMillis(Date.now() + (2 * 60 * 60 * 1000)) // 2 hours from now
      };

      const roomRef = doc(db, 'SpyRoom', newRoomCode);
      console.log('🔵 [SPY] Calling setDoc with room code:', newRoomCode);
      console.log('🔵 [SPY] Room data:', JSON.stringify(roomData, null, 2));
      
      try {
        await setDoc(roomRef, roomData);
        console.log('✅ [SPY] setDoc completed successfully');
      } catch (setDocError) {
        console.error('❌ [SPY] setDoc failed:', setDocError);
        console.error('❌ [SPY] Error code:', setDocError.code);
        console.error('❌ [SPY] Error message:', setDocError.message);
        throw setDocError;
      }
      
      console.log('✅ [SPY] Room created successfully with code:', newRoomCode);
      
      // Log analytics event
      const { logCreateRoom } = await import('../../utils/analytics');
      logCreateRoom('spy', newRoomCode);
      
      // Save player name BEFORE navigation (like Alias does)
      try {
        await storage.setItem('playerName', playerName);
        console.log('✅ [SPY] Player name saved to storage');
      } catch (e) {
        console.warn('⚠️ [SPY] Could not save player name:', e);
      }
      
      // Navigate to room
      console.log('🔵 [SPY] Navigating to room...');
      navigation.navigate('SpyRoom', { roomCode: newRoomCode });
    } catch (error) {
      console.error('❌ [SPY] Error creating room:', error);
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

  const joinRoom = () => {
    if (!playerName.trim()) {
      setError(S.entry.errors.nameRequired);
      return;
    }
    if (!roomCode.trim()) {
      setError(S.entry.errors.codeRequired);
      return;
    }

    storage.setItem('playerName', playerName);
    
    // Log analytics event
    import('../../utils/analytics').then(({ logJoinRoom }) => {
      logJoinRoom('spy', roomCode.toUpperCase());
    });
    
    // Navigate to room
    navigation.navigate('SpyRoom', { roomCode: roomCode.toUpperCase() });
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
    <>
    <GameEntryLayout
      icon="spy"
      title={S.spy.entry.title}
      subtitle={S.spy.entry.subtitle}
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
      onCreate={() => setModeDialogOpen(true)}
      onJoin={joinRoom}
      onBack={goBack}
      steps={S.spy.entry.steps}
      footer={<BannerAd />}
    />
    <PlayModeDialog
      visible={modeDialogOpen}
      onClose={() => setModeDialogOpen(false)}
      onRegular={createRoom}
      onLocal={() => navigation.navigate('SpyLocal')}
      localTitle={S.spy.local.modeTitle}
      localHint={S.spy.local.modeHint}
      localIcon="phone"
    />
    </>
  );
}
