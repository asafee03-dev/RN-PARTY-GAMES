import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';
import BannerAd from '../../components/shared/BannerAd';
import { db, waitForFirestoreReady } from '../../firebase';
import { doc, getDoc, setDoc, query, collection, where, getDocs, Timestamp } from 'firebase/firestore';
import storage from '../../utils/storage';
import { generateUniqueRoomCode } from '../../utils/roomManagement';

const spyIcons = ["❓", "🕵️", "🔍", "🎭", "👁️", "🗝️", "🔐", "🎩", "💼", "📍"];

export default function SpyHomeScreen({ navigation, route }) {
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
      console.log('⚠️ [SPY] Room creation already in progress, ignoring duplicate call');
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
      console.warn('⚠️ [SPY] Could not save player name:', e);
    }

    try {
      if (!db) {
        throw new Error('Firestore database is not initialized');
      }

      // Generate unique room code using utility
      const newRoomCode = await generateUniqueRoomCode('SpyRoom', generateRoomCode);
      
      if (!newRoomCode) {
        setError('שגיאה ביצירת קוד חדר ייחודי. נסה שוב.');
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
        created_at: Date.now(), // Store as timestamp for age calculation
        expires_at: Timestamp.fromMillis(Date.now() + (2 * 60 * 60 * 1000)) // 2 hours from now
      };

      console.log('🔵 [SPY] Ensuring Firestore is ready...');
      await waitForFirestoreReady();
      console.log('✅ [SPY] Firestore confirmed online, proceeding with write');

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

  const joinRoom = () => {
    if (!playerName.trim()) {
      setError('אנא הכנס שם שחקן');
      return;
    }
    if (!roomCode.trim()) {
      setError('אנא הכנס קוד חדר');
      return;
    }

    storage.setItem('playerName', playerName);
    
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
    <GradientBackground variant="spy">
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
            variant="spy"
            style={styles.backButton}
          />

          <View style={styles.cardContainer}>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.iconContainer}>
                  <Text style={styles.iconText}>🕵️</Text>
                </View>
                <Text style={styles.cardTitle}>המרגל</Text>
                <Text style={styles.cardSubtitle}>מי המרגל ביניכם?</Text>
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
                  onPress={createRoom}
                  variant="spy"
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
                    maxLength={4}
                  />
                </View>

                <GradientButton
                  title="הצטרף למשחק"
                  onPress={joinRoom}
                  variant="spy"
                  style={styles.joinButton}
                />

                <View style={styles.instructionsContainer}>
                  <Text style={styles.instructionsTitle}>📋 איך משחקים?</Text>
                  <View style={styles.instructionsList}>
                    <Text style={styles.instructionItem}>
                      <Text style={styles.instructionNumber}>1. </Text>
                      כל השחקנים מקבלים מיקום זהה/מילה — חוץ מהמרגל.
                    </Text>
                    <Text style={styles.instructionItem}>
                      <Text style={styles.instructionNumber}>2. </Text>
                      המרגל לא יודע מה המיקום/מילה.
                    </Text>
                    <Text style={styles.instructionItem}>
                      <Text style={styles.instructionNumber}>3. </Text>
                      השחקנים שואלים אחד את השני שאלות בתור.
                    </Text>
                    <Text style={styles.instructionItem}>
                      <Text style={styles.instructionNumber}>4. </Text>
                      המרגל מנסה לגלות את המיקום/מילה בלי להיחשף.
                    </Text>
                    <Text style={styles.instructionItem}>
                      <Text style={styles.instructionNumber}>5. </Text>
                      אם המרגל מנחש נכון — הוא מנצח. אם חושפים אותו — הקבוצה מנצחת.
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
    backgroundColor: '#7ED957', // Spy theme color - ירוק בהיר
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
