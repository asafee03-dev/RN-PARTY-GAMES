import React, { useState, useEffect, useRef } from 'react';
import BannerAd from '../../components/shared/BannerAd';
import { db } from '../../firebase';
import { doc, getDoc, setDoc, query, collection, where, getDocs, onSnapshot, Timestamp } from 'firebase/firestore';
import storage from '../../utils/storage';
import { S } from '../../strings';
import { GameEntryLayout } from '../../ui';
import { generateUniqueRoomCode } from '../../utils/roomManagement';


export default function DrawHomeScreen({ navigation, route }) {
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const isCreatingRoomRef = useRef(false);
  const joinedRoomCodeRef = useRef(null);
  const unsubscribeRef = useRef(null);

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

  // Cleanup listener on unmount
  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, []);

  const generateRoomCode = () => {
    return Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  };

  const handleCreateRoom = async () => {
    if (isCreatingRoomRef.current) {
      console.log('⚠️ [DRAW] Room creation already in progress, ignoring duplicate call');
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
      console.warn('⚠️ [DRAW] Could not save player name:', e);
    }

    try {
      if (!db) {
        throw new Error('Firestore database is not initialized');
      }

      // Generate unique room code using utility
      const code = await generateUniqueRoomCode('DrawRoom', generateRoomCode);
      
      if (!code) {
        setError(S.entry.errors.uniqueCodeFailed);
        isCreatingRoomRef.current = false;
        setIsCreating(false);
        return;
      }
      
      console.log('🔵 [DRAW] Creating Draw room with code:', code);
      
      const roomData = {
        room_code: code,
        host_name: playerName,
        players: [{ name: playerName, score: 0, active: true }],
        game_status: 'lobby',
        current_turn_index: 0,
        created_at: Date.now(), // Store as timestamp for age calculation
        expires_at: Timestamp.fromMillis(Date.now() + (2 * 60 * 60 * 1000)) // 2 hours from now
      };
      
      const roomRef = doc(db, 'DrawRoom', code);
      console.log('🔵 [DRAW] Calling setDoc with room code:', code);
      console.log('🔵 [DRAW] Room data:', JSON.stringify(roomData, null, 2));
      
      try {
        await setDoc(roomRef, roomData);
        console.log('✅ [DRAW] setDoc completed successfully');
      } catch (setDocError) {
        console.error('❌ [DRAW] setDoc failed:', setDocError);
        console.error('❌ [DRAW] Error code:', setDocError.code);
        console.error('❌ [DRAW] Error message:', setDocError.message);
        throw setDocError;
      }
      
      // No need to verify - if setDoc succeeds, document exists
      console.log('✅ [DRAW] Room created successfully with code:', code);
      
      // Log analytics event
      const { logCreateRoom } = await import('../../utils/analytics');
      logCreateRoom('draw', code);
      
      // Save player name before navigation
      try {
        await storage.setItem('playerName', playerName);
      } catch (e) {
        console.warn('⚠️ [DRAW] Could not save player name:', e);
      }
      
      // Navigate to room
      console.log('🔵 [DRAW] Navigating to room...');
      navigation.navigate('DrawRoom', { roomCode: code });
    } catch (error) {
      console.error('❌ [DRAW] Error creating room:', error);
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

  const handleJoinRoom = async () => {
    if (!playerName.trim()) {
      setError(S.entry.errors.nameRequired);
      return;
    }
    if (!roomCode.trim()) {
      setError(S.entry.errors.codeRequired);
      return;
    }

    try {
      const q = query(collection(db, 'DrawRoom'), where('room_code', '==', roomCode.toUpperCase()));
      const querySnapshot = await getDocs(q);
      const rooms = [];
      querySnapshot.forEach((doc) => {
        rooms.push({ id: doc.id, ...doc.data() });
      });
      
      if (rooms.length === 0) {
        setError(S.entry.errors.roomNotFound);
        return;
      }
      
      const joinedRoom = rooms[0];
      const joinedRoomCode = roomCode.toUpperCase();
      
      // Check if game is already playing and player is not in room
      const playerExists = joinedRoom.players && Array.isArray(joinedRoom.players) && 
        joinedRoom.players.some(p => p && p.name === playerName);
      
      if (!playerExists && joinedRoom.game_status === 'playing') {
        setError(S.entry.errors.gameStarted);
        return;
      }
      
      await storage.setItem('playerName', playerName);
      joinedRoomCodeRef.current = joinedRoomCode;
      
      // Log analytics event
      const { logJoinRoom } = await import('../../utils/analytics');
      logJoinRoom('draw', joinedRoomCode);
      
      // Set up listener to watch for game status changes
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      
      // Navigate to room
      navigation.navigate('DrawRoom', { roomCode: joinedRoomCode });
      
      // Set up a temporary listener to catch game start if player is still on this screen
      // This listener will be cleaned up when navigating to DrawRoom
      const roomRef = doc(db, 'DrawRoom', joinedRoom.id);
      const tempUnsubscribe = onSnapshot(roomRef, (snapshot) => {
        if (snapshot.exists()) {
          const roomData = snapshot.data();
          
          // If game status changes to "playing" and we're still on this screen, navigate
          // This handles the edge case where navigation is delayed
          if (roomData.game_status === 'playing' && joinedRoomCodeRef.current === joinedRoomCode) {
            tempUnsubscribe(); // Clean up this listener
            joinedRoomCodeRef.current = null;
            navigation.navigate('DrawRoom', { roomCode: joinedRoomCode });
          }
        }
      });
      
      // Store the unsubscribe function but it will be cleaned up on navigation
      unsubscribeRef.current = tempUnsubscribe;
    } catch (fetchError) {
      console.error('❌ Error fetching room:', fetchError);
      setError(S.entry.errors.searchFailed);
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
      icon="draw"
      title={S.draw.entry.title}
      subtitle={S.draw.entry.subtitle}
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
      onCreate={handleCreateRoom}
      onJoin={handleJoinRoom}
      onBack={goBack}
      steps={S.draw.entry.steps}
      footer={<BannerAd />}
    />
  );
}
