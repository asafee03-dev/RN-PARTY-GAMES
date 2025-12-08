import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';
import { db, waitForFirestoreReady } from '../../firebase';
import { doc, getDoc, setDoc, query, collection, where, getDocs } from 'firebase/firestore';

// Using a simple storage helper - can be replaced with AsyncStorage later
const storage = {
  async getItem(key) {
    // In a real app, use AsyncStorage or similar
    return null;
  },
  async setItem(key, value) {
    // In a real app, use AsyncStorage or similar
  }
};

const spyIcons = ["❓", "🕵️", "🔍", "🎭", "👁️", "🗝️", "🔐", "🎩", "💼", "📍"];

export default function SpyHomeScreen({ navigation }) {
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

    let newRoomCode = generateRoomCode().trim().toUpperCase();
    const MAX_RETRIES = 5;
    let retryCount = 0;

    try {
      if (!db) {
        throw new Error('Firestore database is not initialized');
      }

      // Check if room code already exists, retry if it does
      while (retryCount < MAX_RETRIES) {
        const roomRef = doc(db, 'SpyRoom', newRoomCode);
        const snapshot = await getDoc(roomRef);

        if (!snapshot.exists()) {
          const q = query(collection(db, 'SpyRoom'), where('room_code', '==', newRoomCode));
          const querySnapshot = await getDocs(q);
          if (querySnapshot.empty) {
            break;
          }
        }

        retryCount++;
        newRoomCode = generateRoomCode().trim().toUpperCase();
        console.log(`⚠️ Room code ${newRoomCode} already exists, generating new code (attempt ${retryCount}/${MAX_RETRIES})`);
      }

      if (retryCount >= MAX_RETRIES) {
        console.error('❌ Failed to generate unique room code after retries');
        setError('שגיאה ביצירת קוד חדר ייחודי. נסה שוב.');
        return;
      }

      console.log('🔵 [SPY] Creating Spy room with code:', newRoomCode);

      const roomData = {
        room_code: newRoomCode,
        host_name: playerName,
        players: [{ name: playerName }],
        game_status: 'lobby'
      };

      console.log('🔵 [SPY] Ensuring Firestore is ready...');
      await waitForFirestoreReady();
      console.log('✅ [SPY] Firestore confirmed online, proceeding with write');

      const roomRef = doc(db, 'SpyRoom', newRoomCode);
      await setDoc(roomRef, roomData);
      console.log('✅ [SPY] Room created successfully with code:', newRoomCode);

      navigation.navigate('SpyRoom', { roomCode: newRoomCode });
    } catch (error) {
      console.error('❌ [SPY] Error creating room:', error);
      setError('שגיאה ביצירת החדר. נסה שוב.');
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
    navigation.navigate('SpyRoom', { roomCode: roomCode.toUpperCase() });
  };

  const goBack = () => {
    navigation.navigate('Home');
  };

  return (
    <GradientBackground variant="green">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity onPress={goBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>← חזרה למשחקים</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Text style={styles.iconText}>👁️</Text>
            </View>
            <Text style={styles.title}>המרגל</Text>
            <Text style={styles.subtitle}>מי המרגל ביניכם?</Text>
          </View>

          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.content}>
            <View style={styles.inputSection}>
              <View style={styles.labelRow}>
                <Text style={styles.labelIcon}>👤</Text>
                <Text style={styles.label}>השם שלך</Text>
              </View>
              <TextInput
                style={styles.input}
                value={playerName}
                onChangeText={(text) => {
                  setPlayerName(text);
                  setError('');
                }}
                placeholder="הכנס שם..."
                placeholderTextColor="#999"
                autoCapitalize="words"
              />
            </View>

            <GradientButton
              title="➕ צור משחק חדש"
              onPress={createRoom}
              variant="green"
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
              <View style={styles.labelRow}>
                <Text style={styles.labelIcon}>#</Text>
                <Text style={styles.label}>קוד חדר</Text>
              </View>
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

            <GradientButton
              title="🔐 הצטרף למשחק"
              onPress={joinRoom}
              variant="outline"
              style={styles.joinButton}
            />
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
    paddingTop: 16,
  },
  backButton: {
    alignSelf: 'flex-start',
    padding: 8,
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
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  iconText: {
    fontSize: 64,
  },
  title: {
    fontSize: 48,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 20,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  errorContainer: {
    backgroundColor: '#FEE2E2',
    borderWidth: 2,
    borderColor: '#EF4444',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  content: {
    width: '100%',
  },
  inputSection: {
    marginBottom: 24,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  labelIcon: {
    fontSize: 24,
  },
  label: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    fontSize: 18,
    textAlign: 'right',
    borderWidth: 3,
    borderColor: '#10B981',
  },
  createButton: {
    width: '100%',
    marginBottom: 16,
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
    marginHorizontal: 16,
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    opacity: 0.8,
  },
  joinButton: {
    width: '100%',
  },
});
