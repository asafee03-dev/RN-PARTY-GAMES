import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';
import { db, waitForFirestoreReady } from '../../firebase';
import storage from '../../utils/storage';

const PLAYER_COLORS = ["#F59E0B", "#EF4444", "#8B5CF6", "#10B981", "#3B82F6", "#EC4899", "#F97316", "#14B8A6"];

const waveIcons = ["📻", "📡", "📊", "🎚️", "🎛️", "📈", "📉", "〰️", "🔊", "🎵"];

export default function FrequencyHomeScreen({ navigation }) {
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
  }, []);

  const generateRoomCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const createRoom = async () => {
    // Prevent multiple simultaneous calls
    if (isCreatingRoomRef.current) {
      console.log('⚠️ [FREQUENCY] Room creation already in progress, ignoring duplicate call');
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
      console.warn('⚠️ [FREQUENCY] Could not save player name:', e);
    }

    let newRoomCode = generateRoomCode().trim().toUpperCase();
    const MAX_RETRIES = 5;
    let retryCount = 0;

    try {
      if (!db) {
        throw new Error('Firestore database is not initialized');
      }

      // Check if room code already exists, retry if it does
      while (retryCount < MAX_RETRIES) {
        // Try to get by room_code as document ID first
        const roomRef = doc(db, 'FrequencyRoom', newRoomCode);
        const snapshot = await getDoc(roomRef);

        // If room doesn't exist, we can use this code
        if (!snapshot.exists()) {
          // Also check by room_code field as fallback
          const q = query(collection(db, 'FrequencyRoom'), where('room_code', '==', newRoomCode));
          const querySnapshot = await getDocs(q);
          if (querySnapshot.empty) {
            break;
          }
        }

        // Room exists, generate a new code
        retryCount++;
        newRoomCode = generateRoomCode().trim().toUpperCase();
        console.log(`⚠️ Room code ${newRoomCode} already exists, generating new code (attempt ${retryCount}/${MAX_RETRIES})`);
      }

      if (retryCount >= MAX_RETRIES) {
        console.error('❌ Failed to generate unique room code after retries');
        setError('שגיאה ביצירת קוד חדר ייחודי. נסה שוב.');
        isCreatingRoomRef.current = false;
        setIsCreating(false);
        return;
      }

      console.log('🔵 [FREQUENCY] Creating Frequency room with code:', newRoomCode);

      // Create room document with room_code as document ID
      const roomData = {
        room_code: newRoomCode,
        host_name: playerName,
        players: [{ name: playerName, score: 0, has_guessed: false, color: PLAYER_COLORS[0] }],
        game_status: 'lobby',
        current_turn_index: 0,
        needle_positions: {}
      };

      console.log('🔵 [FREQUENCY] Ensuring Firestore is ready and online...');
      await waitForFirestoreReady();
      console.log('✅ [FREQUENCY] Firestore confirmed online, proceeding with write');

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
      
      // Save player name BEFORE navigation (like Alias does)
      try {
        await storage.setItem('playerName', playerName);
        console.log('✅ [FREQUENCY] Player name saved to storage');
      } catch (e) {
        console.warn('⚠️ [FREQUENCY] Could not save player name:', e);
      }
      
      // Navigate immediately after successful write
      console.log('🔵 [FREQUENCY] Navigating to room...');
      navigation.navigate('FrequencyRoom', { roomCode: newRoomCode });
    } catch (error) {
      console.error('❌ [FREQUENCY] Error creating room:', error);
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
      isCreatingRoomRef.current = false;
      setIsCreating(false);
    }
  };

  const joinRoom = async () => {
    if (!playerName.trim()) {
      setError('אנא הכנס שם שחקן');
      return;
    }
    if (!roomCode.trim()) {
      setError('אנא הכנס קוד חדר');
      return;
    }

    try {
      await storage.setItem('playerName', playerName);
      navigation.navigate('FrequencyRoom', { roomCode: roomCode.toUpperCase() });
    } catch (e) {
      console.warn('Could not save player name:', e);
      navigation.navigate('FrequencyRoom', { roomCode: roomCode.toUpperCase() });
    }
  };

  const goBack = () => {
    navigation.navigate('Home');
  };

  return (
    <GradientBackground variant="red">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Back Button */}
          <TouchableOpacity onPress={goBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>← חזרה למשחקים</Text>
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Text style={styles.icon}>📻</Text>
            </View>
            <Text style={styles.title}>התדר</Text>
            <Text style={styles.subtitle}>משחק הגלים והתדירויות!</Text>
          </View>

          {/* Error Message */}
          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Player Name Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>👤 השם שלך</Text>
            <TextInput
              style={styles.input}
              value={playerName}
              onChangeText={(text) => {
                setPlayerName(text);
                setError('');
              }}
              placeholder="הכנס שם..."
              placeholderTextColor="#999"
              autoCapitalize="none"
            />
          </View>

          {/* Create Room Button */}
          <GradientButton
            title="➕ צור משחק חדש"
            onPress={createRoom}
            variant="red"
            style={styles.button}
            disabled={isCreating}
          />
          {isCreating && <ActivityIndicator style={styles.loader} />}

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>או</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Room Code Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}># קוד חדר</Text>
            <TextInput
              style={styles.input}
              value={roomCode}
              onChangeText={(text) => {
                setRoomCode(text.toUpperCase());
                setError('');
              }}
              placeholder="הכנס קוד..."
              placeholderTextColor="#999"
              autoCapitalize="characters"
              maxLength={6}
            />
          </View>

          {/* Join Room Button */}
          <GradientButton
            title="🔑 הצטרף למשחק"
            onPress={joinRoom}
            variant="outline"
            style={styles.button}
          />
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
    paddingBottom: 40,
  },
  backButton: {
    alignSelf: 'flex-start',
    padding: 12,
    marginBottom: 16,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 20,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  icon: {
    fontSize: 64,
  },
  title: {
    fontSize: 48,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
  },
  errorContainer: {
    backgroundColor: '#FEE2E2',
    borderWidth: 2,
    borderColor: '#FCA5A5',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  errorText: {
    color: '#991B1B',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'right',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    fontSize: 18,
    borderWidth: 3,
    borderColor: '#A78BFA',
    textAlign: 'right',
    minHeight: 56,
  },
  button: {
    marginBottom: 16,
    borderRadius: 16,
    paddingVertical: 18,
  },
  loader: {
    marginTop: 8,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#FFFFFF',
    opacity: 0.3,
  },
  dividerText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    paddingHorizontal: 16,
  },
});
