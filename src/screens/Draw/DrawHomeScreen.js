import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';
import { db, waitForFirestoreReady } from '../../firebase';
import { doc, getDoc, setDoc, query, collection, where, getDocs, onSnapshot } from 'firebase/firestore';
import storage from '../../utils/storage';
import { generateUniqueRoomCode } from '../../utils/roomManagement';

const drawIcons = ["🎨", "✏️", "🖌️", "🖍️", "✨"];

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
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const handleCreateRoom = async () => {
    if (isCreatingRoomRef.current) {
      console.log('⚠️ [DRAW] Room creation already in progress, ignoring duplicate call');
      return;
    }

    if (!playerName.trim()) {
      setError('אנא הכנס שם שחקן');
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
        setError('שגיאה ביצירת קוד חדר ייחודי. נסה שוב.');
        isCreatingRoomRef.current = false;
        setIsCreating(false);
        return;
      }
      
      console.log('🔵 [DRAW] Creating Draw room with code:', code);
      
      const roomData = {
        room_code: code,
        host_name: playerName,
        players: [{ name: playerName, score: 0 }],
        game_status: 'lobby',
        current_turn_index: 0,
        created_at: Date.now() // Store as timestamp for age calculation
      };
      
      console.log('🔵 [DRAW] Ensuring Firestore is ready...');
      await waitForFirestoreReady();
      console.log('✅ [DRAW] Firestore confirmed online, proceeding with write');
      
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
      
      // Verify the document was actually created
      console.log('🔵 [DRAW] Verifying document exists...');
      try {
        const verifySnapshot = await getDoc(roomRef);
        console.log('🔵 [DRAW] Verification snapshot:', verifySnapshot.exists() ? 'EXISTS' : 'NOT FOUND');
        if (!verifySnapshot.exists()) {
          console.error('❌ [DRAW] Document not found after write!');
          console.error('❌ [DRAW] Room code:', code);
          console.error('❌ [DRAW] Collection: DrawRoom');
          throw new Error('Document was not created - check Firestore Rules');
        }
        console.log('✅ [DRAW] Document verified successfully');
      } catch (verifyError) {
        console.error('❌ [DRAW] Verification failed:', verifyError);
        throw verifyError;
      }
      
      console.log('✅ [DRAW] Room created and verified successfully with code:', code);
      
      // Save player name before navigation
      try {
        await storage.setItem('playerName', playerName);
      } catch (e) {
        console.warn('⚠️ [DRAW] Could not save player name:', e);
      }
      
      // Navigate immediately after successful write (like old project)
      console.log('🔵 [DRAW] Navigating to room...');
      navigation.navigate('DrawRoom', { roomCode: code });
    } catch (error) {
      console.error('❌ [DRAW] Error creating room:', error);
      let errorMessage = 'שגיאה ביצירת החדר. נסה שוב.';
      if (error.message?.includes('Firestore Rules')) {
        errorMessage = 'שגיאה: החדר לא נוצר. אנא בדוק את כללי Firestore.';
      } else if (error.code === 'permission-denied') {
        errorMessage = 'אין הרשאה ליצור חדר. אנא בדוק את כללי Firestore.';
      } else if (error.code === 'unavailable') {
        errorMessage = 'Firestore לא זמין. אנא בדוק את החיבור לאינטרנט.';
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
      setError('אנא הכנס שם שחקן');
      return;
    }
    if (!roomCode.trim()) {
      setError('אנא הכנס קוד חדר');
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
        setError('חדר לא נמצא. בדוק את הקוד.');
        return;
      }
      
      const joinedRoom = rooms[0];
      const joinedRoomCode = roomCode.toUpperCase();
      
      // Check if game is already playing and player is not in room
      const playerExists = joinedRoom.players && Array.isArray(joinedRoom.players) && 
        joinedRoom.players.some(p => p && p.name === playerName);
      
      if (!playerExists && joinedRoom.game_status === 'playing') {
        setError('המשחק כבר התחיל. לא ניתן להצטרף כעת.');
        return;
      }
      
      await storage.setItem('playerName', playerName);
      joinedRoomCodeRef.current = joinedRoomCode;
      
      // Set up listener to watch for game status changes
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      
      // Navigate immediately - DrawRoomScreen will handle the game state
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
      setError('שגיאה בחיפוש החדר. נסה שוב.');
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
    <GradientBackground variant="draw">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <GradientButton
            title="← חזרה למשחקים"
            onPress={goBack}
            variant="draw"
            style={styles.backButton}
          />

          <View style={styles.header}>
            <Text style={styles.iconText}>🎨</Text>
            <Text style={styles.title}>צייר משהו</Text>
            <Text style={styles.subtitle}>צייר ונחש - משחק יצירתי ומהנה!</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>הצטרף למשחק</Text>
            </View>
            <View style={styles.cardContent}>
              <View style={styles.inputSection}>
                <Text style={styles.label}>שם שחקן</Text>
                <TextInput
                  style={styles.input}
                  value={playerName}
                  onChangeText={(text) => {
                    setPlayerName(text);
                    setError('');
                  }}
                  placeholder="הכנס את שמך..."
                  placeholderTextColor="#999"
                  autoCapitalize="words"
                />
              </View>

              {error ? (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <GradientButton
                title="צור חדר חדש"
                onPress={handleCreateRoom}
                variant="draw"
                style={styles.createButton}
                disabled={isCreating}
              />

              {isCreating && (
                <ActivityIndicator size="small" color="#FFFFFF" style={styles.loader} />
              )}

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>או</Text>
                <View style={styles.dividerLine} />
              </View>

              <View style={styles.inputSection}>
                <Text style={styles.label}>קוד חדר</Text>
                <TextInput
                  style={styles.input}
                  value={roomCode}
                  onChangeText={(text) => {
                    setRoomCode(text.toUpperCase());
                    setError('');
                  }}
                  placeholder="הכנס קוד חדר..."
                  placeholderTextColor="#999"
                  autoCapitalize="characters"
                  maxLength={6}
                />
              </View>

              <GradientButton
                title="הצטרף לחדר"
                onPress={handleJoinRoom}
                variant="draw"
                style={styles.joinButton}
              />

              <View style={styles.rulesCard}>
                <Text style={styles.rulesTitle}>איך משחקים?</Text>
                <View style={styles.rulesList}>
                  <Text style={styles.rulesItem}>• שחקן אחד מצייר מילה שנבחרה אקראית</Text>
                  <Text style={styles.rulesItem}>• השאר מנסים לנחש מה זה</Text>
                  <Text style={styles.rulesItem}>• המנחשים שולחים ניחוש ומקבלים נקודות</Text>
                  <Text style={styles.rulesItem}>• הציירים מתחלפים בתורות</Text>
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 8,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 8,
    marginTop: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
  },
  iconText: {
    fontSize: 80,
    marginBottom: 0,
  },
  title: {
    fontSize: 48,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  cardHeader: {
    backgroundColor: '#C48CFF', // Draw theme color - סגול בהיר
    padding: 20,
    alignItems: 'center',
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  cardContent: {
    padding: 24,
    gap: 16,
  },
  inputSection: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 16,
    fontSize: 18,
    textAlign: 'right',
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  errorContainer: {
    backgroundColor: '#FEE2E2',
    borderWidth: 2,
    borderColor: '#EF4444',
    borderRadius: 16,
    padding: 12,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  createButton: {
    width: '100%',
    marginTop: 8,
  },
  loader: {
    marginTop: 8,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#D1D5DB',
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 14,
    color: '#6B7280',
  },
  joinButton: {
    width: '100%',
  },
  rulesCard: {
    backgroundColor: '#FDF2F8',
    borderWidth: 2,
    borderColor: '#F9A8D4',
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
  },
  rulesTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 12,
  },
  rulesList: {
    gap: 8,
  },
  rulesItem: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
});
