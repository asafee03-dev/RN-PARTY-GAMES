import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';
import { db, waitForFirestoreReady } from '../../firebase';
import { doc, getDoc, setDoc, query, collection, where, getDocs } from 'firebase/firestore';
import storage from '../../utils/storage';
import { generateUniqueRoomCode } from '../../utils/roomManagement';

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
        created_at: Date.now() // Store as timestamp for age calculation
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
      
      // Navigate immediately after successful write
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

          <View style={styles.header}>
            <Text style={styles.iconText}>👁️</Text>
            <Text style={styles.title}>המרגל</Text>
            <Text style={styles.subtitle}>מי המרגל ביניכם?</Text>
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
                onPress={createRoom}
                variant="spy"
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
                onPress={joinRoom}
                variant="spy"
                style={styles.joinButton}
              />
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
    paddingTop: 16,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 16,
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
    backgroundColor: '#7ED957', // Spy theme color - ירוק בהיר
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
});
