import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, TouchableOpacity, Dimensions } from 'react-native';
import GradientBackground from '../../components/codenames/GradientBackground';
import { db, waitForFirestoreReady } from '../../firebase';
import { doc, getDoc, setDoc, query, collection, where, getDocs } from 'firebase/firestore';

import storage from '../../utils/storage';

const agentIcons = ["🕵️", "🔍", "🎯", "📋", "🗂️", "💼", "🕶️", "🎩", "🔐", "📡"];

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function CodenamesHomeScreen({ navigation }) {
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [gameMode, setGameMode] = useState('friends');
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
    if (isCreatingRoomRef.current) {
      console.log('⚠️ [CODENAMES] Room creation already in progress, ignoring duplicate call');
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
      console.warn('⚠️ [CODENAMES] Could not save player name:', e);
    }

    let newRoomCode = generateRoomCode().trim().toUpperCase();
    const MAX_RETRIES = 5;
    let retryCount = 0;
    
    try {
      if (!db) {
        throw new Error('Firestore database is not initialized');
      }

      while (retryCount < MAX_RETRIES) {
        const roomRef = doc(db, 'CodenamesRoom', newRoomCode);
        const snapshot = await getDoc(roomRef);
        
        if (!snapshot.exists()) {
          const q = query(collection(db, 'CodenamesRoom'), where('room_code', '==', newRoomCode));
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
      
      console.log('🔵 [CODENAMES] Creating Codenames room with code:', newRoomCode);
      
      const roomData = {
        room_code: newRoomCode,
        host_name: playerName,
        game_mode: gameMode,
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
        turn_phase: 'clue'
      };
      
      console.log('🔵 [CODENAMES] About to call setDoc() - execution checkpoint 1');
      const roomRef = doc(db, 'CodenamesRoom', newRoomCode);
      
      console.log('🔵 [CODENAMES] Ensuring Firestore is ready and online...');
      await waitForFirestoreReady();
      console.log('✅ [CODENAMES] Firestore confirmed online, proceeding with write');
      
      let writeCompleted = false;
      try {
        console.log('🔵 [CODENAMES] setDoc() call initiated - execution checkpoint 2');
        console.log('🔵 [CODENAMES] Room code:', newRoomCode);
        console.log('🔵 [CODENAMES] Room data:', JSON.stringify(roomData, null, 2));
        await setDoc(roomRef, roomData);
        writeCompleted = true;
        console.log('✅ [CODENAMES] setDoc() write completed successfully! - execution checkpoint 3');
        
        // Verify the document was actually created
        console.log('🔵 [CODENAMES] Verifying document exists...');
        const verifySnapshot = await getDoc(roomRef);
        console.log('🔵 [CODENAMES] Verification snapshot:', verifySnapshot.exists() ? 'EXISTS' : 'NOT FOUND');
        if (!verifySnapshot.exists()) {
          console.error('❌ [CODENAMES] Document not found after write!');
          console.error('❌ [CODENAMES] Room code:', newRoomCode);
          console.error('❌ [CODENAMES] Collection: CodenamesRoom');
          throw new Error('Document was not created - check Firestore Rules');
        }
        console.log('✅ [CODENAMES] Document verified in Firestore!');
      } catch (writeError) {
        console.error('❌ [CODENAMES] Error during setDoc:', writeError);
        console.error('❌ [CODENAMES] Error code:', writeError.code);
        console.error('❌ [CODENAMES] Error message:', writeError.message);
        isCreatingRoomRef.current = false;
        throw writeError;
      }
      
      if (!writeCompleted) {
        console.error('❌ [CODENAMES] Write did not complete, aborting navigation');
        isCreatingRoomRef.current = false;
        throw new Error('Firestore write did not complete');
      }
      
      console.log('✅ [CODENAMES] Room created and verified successfully with code:', newRoomCode);
      console.log('🔵 [CODENAMES] About to navigate - execution checkpoint 4');
      navigation.navigate('CodenamesSetup', { roomCode: newRoomCode, gameMode });
      console.log('✅ [CODENAMES] Navigation initiated - execution checkpoint 5');
    } catch (error) {
      console.error('❌ [CODENAMES] Error creating room:', error);
      isCreatingRoomRef.current = false;
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
      navigation.navigate('CodenamesSetup', { roomCode: roomCode.toUpperCase(), gameMode });
    } catch (error) {
      console.error('❌ Error joining room:', error);
      setError('שגיאה בהצטרפות לחדר. נסה שוב.');
    }
  };

  const goBack = () => {
    navigation.navigate('Home');
  };

  return (
    <GradientBackground variant="beige">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
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
              <Text style={styles.icon}>🔍</Text>
            </View>
            <Text style={styles.title}>שם טוב</Text>
            <Text style={styles.subtitle}>משחק המרגלים והרמזים!</Text>
          </View>

          <View style={styles.card}>
            {error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>👤 השם שלך</Text>
              <TextInput
                style={styles.input}
                value={playerName}
                onChangeText={(text) => {
                  setPlayerName(text);
                  setError('');
                }}
                placeholder="הכנס שם סוכן..."
                placeholderTextColor="#999"
                autoCapitalize="words"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>👁️ מצב משחק</Text>
              <View style={styles.modeContainer}>
                <TouchableOpacity
                  style={[styles.modeButton, gameMode === 'friends' && styles.modeButtonActive]}
                  onPress={() => setGameMode('friends')}
                >
                  <Text style={styles.modeIcon}>👥</Text>
                  <Text style={[styles.modeText, gameMode === 'friends' && styles.modeTextActive]}>
                    חברים
                  </Text>
                  <Text style={[styles.modeSubtext, gameMode === 'friends' && styles.modeSubtextActive]}>
                    בלי טיימר
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeButton, gameMode === 'rivals' && styles.modeButtonActive]}
                  onPress={() => setGameMode('rivals')}
                >
                  <Text style={styles.modeIcon}>⚔️</Text>
                  <Text style={[styles.modeText, gameMode === 'rivals' && styles.modeTextActive]}>
                    יריבים
                  </Text>
                  <Text style={[styles.modeSubtext, gameMode === 'rivals' && styles.modeSubtextActive]}>
                    עם טיימר
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.createButton, isCreating && styles.createButtonDisabled]}
              onPress={createRoom}
              disabled={isCreating}
            >
              {isCreating ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.createButtonIcon}>➕</Text>
                  <Text style={styles.createButtonText}>צור משחק חדש</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>או</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}># קוד חדר</Text>
              <TextInput
                style={styles.input}
                value={roomCode}
                onChangeText={(text) => {
                  setRoomCode(text.toUpperCase());
                  setError('');
                }}
                placeholder="הכנס קוד סודי..."
                placeholderTextColor="#999"
                autoCapitalize="characters"
                maxLength={6}
              />
            </View>

            <TouchableOpacity
              style={styles.joinButton}
              onPress={joinRoom}
            >
              <Text style={styles.joinButtonIcon}>🚪</Text>
              <Text style={styles.joinButtonText}>הצטרף למשחק</Text>
            </TouchableOpacity>
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
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
  },
  backButton: {
    alignSelf: 'flex-start',
    padding: 12,
    marginBottom: 16,
  },
  backButtonText: {
    color: '#2C3E50',
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
    color: '#2C3E50',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 20,
    color: '#2C3E50',
    opacity: 0.8,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  errorContainer: {
    backgroundColor: '#FEE2E2',
    borderWidth: 2,
    borderColor: '#FCA5A5',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  errorText: {
    color: '#991B1B',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 12,
    textAlign: 'right',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#DBEAFE',
    borderRadius: 16,
    padding: 16,
    fontSize: 18,
    textAlign: 'right',
  },
  modeContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  modeButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#D1D5DB',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#D4A574',
    borderColor: '#B8956A',
  },
  modeIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  modeText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 4,
  },
  modeTextActive: {
    color: '#2C3E50',
  },
  modeSubtext: {
    fontSize: 14,
    color: '#6B7280',
    opacity: 0.9,
  },
  modeSubtextActive: {
    color: '#2C3E50',
    opacity: 0.9,
  },
  createButton: {
    backgroundColor: '#D4A574',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  createButtonText: {
    color: '#2C3E50',
    fontSize: 20,
    fontWeight: 'bold',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#D1D5DB',
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '600',
  },
  joinButton: {
    backgroundColor: 'transparent',
    borderWidth: 3,
    borderColor: '#D4A574',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinButtonIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  joinButtonText: {
    color: '#D4A574',
    fontSize: 20,
    fontWeight: 'bold',
  },
});
