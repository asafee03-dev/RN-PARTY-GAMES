import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, TouchableOpacity, Dimensions } from 'react-native';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';
import BannerAd from '../../components/shared/BannerAd';
import { db, waitForFirestoreReady } from '../../firebase';
import { doc, getDoc, setDoc, query, collection, where, getDocs, Timestamp } from 'firebase/firestore';
import storage from '../../utils/storage';
import { generateUniqueRoomCode } from '../../utils/roomManagement';

const agentIcons = ["🕵️", "🔍", "🎯", "📋", "🗂️", "💼", "🕶️", "🎩", "🔐", "📡"];

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Custom icon component for binary code
const BinaryCode = () => {
  const binaryRows = [
    ['0', '1', '0', '1', '1', '0'],
    ['1', '0', '1', '0', '0', '1'],
    ['0', '1', '1', '0', '1', '0'],
    ['1', '1', '0', '1', '0', '1'],
    ['0', '0', '1', '1', '0', '0'],
  ];
  
  return (
    <View style={customIconStyles.binaryContainer}>
      {binaryRows.map((row, rowIndex) => (
        <View key={rowIndex} style={customIconStyles.binaryRow}>
          {row.map((bit, bitIndex) => (
            <Text 
              key={`${rowIndex}-${bitIndex}`} 
              style={[
                customIconStyles.binaryBit,
                (rowIndex === 0 && bitIndex === 0) || 
                (rowIndex === 1 && bitIndex === 2) || 
                (rowIndex === 2 && bitIndex === 4) || 
                (rowIndex === 3 && bitIndex === 1) || 
                (rowIndex === 4 && bitIndex === 3) 
                  ? customIconStyles.binaryBitLarge 
                  : null
              ]}
            >
              {bit}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
};

const customIconStyles = StyleSheet.create({
  binaryContainer: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
    borderRadius: 12,
    padding: 6,
    borderWidth: 2,
    borderColor: 'rgba(0, 255, 255, 0.3)',
  },
  binaryRow: {
    flexDirection: 'row',
    gap: 2,
    marginBottom: 2,
  },
  binaryBit: {
    color: '#00FFFF',
    fontSize: 10,
    fontWeight: '600',
    textShadowColor: '#00FFFF',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
    opacity: 0.7,
  },
  binaryBitLarge: {
    fontSize: 12,
    fontWeight: '700',
    opacity: 1,
  },
});

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

    try {
      if (!db) {
        throw new Error('Firestore database is not initialized');
      }

      // Generate unique room code using utility
      const newRoomCode = await generateUniqueRoomCode('CodenamesRoom', generateRoomCode);
      
      if (!newRoomCode) {
        setError('שגיאה ביצירת קוד חדר ייחודי. נסה שוב.');
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
      
      // Log analytics event
      const { logCreateRoom } = await import('../../utils/analytics');
      logCreateRoom('codenames', newRoomCode);
      
      // Navigate to setup screen
      navigation.navigate('CodenamesSetup', { roomCode: newRoomCode, gameMode: 'friends' });
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
      
      // Log analytics event
      const { logJoinRoom } = await import('../../utils/analytics');
      logJoinRoom('codenames', roomCode.toUpperCase());
      
      // Navigate to setup screen
      navigation.navigate('CodenamesSetup', { roomCode: roomCode.toUpperCase(), gameMode: 'friends' });
    } catch (error) {
      console.error('❌ Error joining room:', error);
      setError('שגיאה בהצטרפות לחדר. נסה שוב.');
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
    <GradientBackground variant="beige">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <GradientButton
            title="← חזרה למשחקים"
            onPress={goBack}
            variant="codenames"
            style={styles.backButton}
          />

          <View style={styles.cardContainer}>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.iconContainer}>
                  <BinaryCode />
                </View>
                <Text style={styles.cardTitle}>שם טוב</Text>
                <Text style={styles.cardSubtitle}>משחק המרגלים והרמזים!</Text>
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
                  variant="codenames"
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
                  variant="codenames"
                  style={styles.joinButton}
                />

                <View style={styles.instructionsContainer}>
                  <Text style={styles.instructionsTitle}>📋 איך משחקים?</Text>
                  <View style={styles.instructionsList}>
                    <Text style={styles.instructionItem}>
                      <Text style={styles.instructionNumber}>1. </Text>
                      השתבצו בתקפידים לשתי קבוצות.
                    </Text>
                    <Text style={styles.instructionItem}>
                      <Text style={styles.instructionNumber}>2. </Text>
                      בכל סבב קבוצה אחת משחקת.
                    </Text>
                    <Text style={styles.instructionItem}>
                      <Text style={styles.instructionNumber}>3. </Text>
                      שחקן נותן רמז אחד כדי לעזור לקבוצה לנחש כמה שיותר מילים.
                    </Text>
                    <Text style={styles.instructionItem}>
                      <Text style={styles.instructionNumber}>4. </Text>
                      הקבוצה שחושפת ראשונה את כלל המילים שלה— מנצחת.
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
  keyboardView: {
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
    backgroundColor: '#D9C3A5', // Codenames theme color - חום בהיר
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
