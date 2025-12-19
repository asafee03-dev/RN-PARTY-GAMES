import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';
import BannerAd from '../../components/shared/BannerAd';
import { db, waitForFirestoreReady } from '../../firebase';
import { doc, getDoc, setDoc, query, collection, where, getDocs, onSnapshot, Timestamp } from 'firebase/firestore';
import storage from '../../utils/storage';
import { generateUniqueRoomCode } from '../../utils/roomManagement';
import { showInterstitialIfAvailable } from '../../utils/interstitialAd';

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
        players: [{ name: playerName, score: 0, active: true }],
        game_status: 'lobby',
        current_turn_index: 0,
        created_at: Timestamp.now() // Store as Firestore Timestamp for age calculation
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
      
      // No need to verify - if setDoc succeeds, document exists
      console.log('✅ [DRAW] Room created successfully with code:', code);
      
      // Save player name before navigation
      try {
        await storage.setItem('playerName', playerName);
      } catch (e) {
        console.warn('⚠️ [DRAW] Could not save player name:', e);
      }
      
      // Show interstitial ad if available, then navigate
      console.log('🔵 [DRAW] Navigating to room...');
      showInterstitialIfAvailable(() => {
        navigation.navigate('DrawRoom', { roomCode: code });
      });
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
      
      // Show interstitial ad if available, then navigate
      showInterstitialIfAvailable(() => {
        navigation.navigate('DrawRoom', { roomCode: joinedRoomCode });
      });
      
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

          <View style={styles.cardContainer}>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.iconContainer}>
                  <Text style={styles.iconText}>✏️</Text>
                </View>
                <Text style={styles.cardTitle}>צייר משהו</Text>
                <Text style={styles.cardSubtitle}>צייר ונחש - משחק יצירתי ומהנה!</Text>
              </View>

              <View style={styles.cardContent}>
                {error ? (
                  <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>השם שלך</Text>
                  <TextInput
                    value={playerName}
                    onChangeText={(text) => {
                      setPlayerName(text);
                      setError('');
                    }}
                    placeholder="הכנס שם..."
                    placeholderTextColor="#999"
                    style={styles.input}
                    autoCapitalize="none"
                  />
                </View>

                <GradientButton
                  title={isCreating ? 'יוצר חדר...' : 'צור משחק חדש'}
                  onPress={handleCreateRoom}
                  variant="draw"
                  style={styles.createButton}
                  disabled={isCreating}
                >
                  {isCreating && <ActivityIndicator color="#FFFFFF" style={{ marginLeft: 8 }} />}
                </GradientButton>

                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>או</Text>
                  <View style={styles.dividerLine} />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>קוד חדר</Text>
                  <TextInput
                    value={roomCode}
                    onChangeText={(text) => {
                      setRoomCode(text.toUpperCase());
                      setError('');
                    }}
                    placeholder="הכנס קוד..."
                    placeholderTextColor="#999"
                    style={styles.input}
                    autoCapitalize="characters"
                    maxLength={6}
                  />
                </View>

                <GradientButton
                  title="הצטרף למשחק"
                  onPress={handleJoinRoom}
                  variant="draw"
                  style={styles.joinButton}
                />

                <View style={styles.instructionsContainer}>
                  <Text style={styles.instructionsTitle}>📋 איך משחקים?</Text>
                  <View style={styles.instructionsList}>
                    <Text style={styles.instructionItem}>
                      <Text style={styles.instructionNumber}>1. </Text>
                      שחקן אחד מצייר מילה שנבחרה אקראית
                    </Text>
                    <Text style={styles.instructionItem}>
                      <Text style={styles.instructionNumber}>2. </Text>
                      השאר מנסים לנחש מה זה
                    </Text>
                    <Text style={styles.instructionItem}>
                      <Text style={styles.instructionNumber}>3. </Text>
                      המנחשים שולחים ניחוש ומקבלים נקודות
                    </Text>
                    <Text style={styles.instructionItem}>
                      <Text style={styles.instructionNumber}>4. </Text>
                      הציירים מתחלפים בתורות
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
        <BannerAd />
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
    padding: 20,
    paddingTop: 50,
    paddingBottom: 20,
  },
  header: {
    marginBottom: 20,
  },
  backButton: {
    alignSelf: 'flex-start',
  },
  cardContainer: {
    width: '100%',
    alignItems: 'center',
    marginTop: 20,
  },
  card: {
    width: '100%',
    maxWidth: 500,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  cardHeader: {
    backgroundColor: '#C48CFF', // Draw theme color - סגול בהיר
    padding: 24,
    paddingBottom: 60,
    alignItems: 'center',
    position: 'relative',
  },
  iconContainer: {
    position: 'absolute',
    bottom: -30,
    backgroundColor: '#FFFFFF',
    borderRadius: 50,
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  iconText: {
    fontSize: 48,
  },
  cardTitle: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  cardSubtitle: {
    fontSize: 18,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  cardContent: {
    padding: 24,
    paddingTop: 32,
    gap: 16,
  },
  errorContainer: {
    backgroundColor: '#FFEBEE',
    borderWidth: 2,
    borderColor: '#F44336',
    borderRadius: 16,
    padding: 16,
  },
  errorText: {
    color: '#C62828',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2C3E50',
    textAlign: 'right',
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 16,
    padding: 16,
    fontSize: 18,
    textAlign: 'right',
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  createButton: {
    width: '100%',
    marginTop: 8,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E0E0E0',
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
  joinButton: {
    width: '100%',
  },
  instructionsContainer: {
    backgroundColor: '#F3E5F5',
    borderRadius: 16,
    padding: 20,
    marginTop: 8,
    borderWidth: 2,
    borderColor: '#E1BEE7',
  },
  instructionsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2C3E50',
    marginBottom: 12,
    textAlign: 'right',
  },
  instructionsList: {
    gap: 8,
  },
  instructionItem: {
    fontSize: 16,
    color: '#424242',
    textAlign: 'right',
    lineHeight: 24,
  },
  instructionNumber: {
    fontWeight: '700',
    color: '#9C27B0',
  },
});
