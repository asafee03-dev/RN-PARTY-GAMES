import { doc, setDoc, Timestamp } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Defs, Path, Stop, LinearGradient as SvgLinearGradient } from 'react-native-svg';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';
import BannerAd from '../../components/shared/BannerAd';
import { db } from '../../firebase';
import { generateUniqueRoomCode } from '../../utils/roomManagement';
import storage from '../../utils/storage';

const PLAYER_COLORS = ["#F59E0B", "#EF4444", "#8B5CF6", "#10B981", "#3B82F6", "#EC4899", "#F97316", "#14B8A6"];

const waveIcons = ["📻", "📡", "📊", "🎚️", "🎛️", "📈", "📉", "〰️", "🔊", "🎵"];

// Custom icon component for frequency waves
const FrequencyWaves = () => {
  const size = 80;
  const centerY = size / 2;
  
  // Blue wave - lower frequency, broader waves (sinusoidal)
  const blueWavePath = `M 0 ${centerY} 
    C ${size * 0.1} ${centerY - 16} ${size * 0.2} ${centerY - 16} ${size * 0.3} ${centerY}
    C ${size * 0.4} ${centerY + 16} ${size * 0.5} ${centerY + 16} ${size * 0.6} ${centerY}
    C ${size * 0.7} ${centerY - 16} ${size * 0.8} ${centerY - 16} ${size * 0.9} ${centerY}
    C ${size * 0.95} ${centerY + 8} ${size} ${centerY + 8} ${size} ${centerY}`;
  
  // Orange wave - higher frequency, tighter waves (offset for visual interest)
  const orangeWavePath = `M 0 ${centerY + 3} 
    C ${size * 0.08} ${centerY - 12} ${size * 0.16} ${centerY - 12} ${size * 0.24} ${centerY + 3}
    C ${size * 0.32} ${centerY + 18} ${size * 0.4} ${centerY + 18} ${size * 0.48} ${centerY + 3}
    C ${size * 0.56} ${centerY - 12} ${size * 0.64} ${centerY - 12} ${size * 0.72} ${centerY + 3}
    C ${size * 0.8} ${centerY + 18} ${size * 0.88} ${centerY + 18} ${size * 0.96} ${centerY + 3}
    C ${size * 0.98} ${centerY - 5} ${size} ${centerY - 5} ${size} ${centerY + 3}`;
  
  return (
    <View style={customIconStyles.frequencyContainer}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <SvgLinearGradient id="blueWaveGradientHome" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#3B82F6" stopOpacity="0.85" />
            <Stop offset="50%" stopColor="#2563EB" stopOpacity="0.75" />
            <Stop offset="100%" stopColor="#1E40AF" stopOpacity="0.65" />
          </SvgLinearGradient>
          <SvgLinearGradient id="orangeWaveGradientHome" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#F59E0B" stopOpacity="0.85" />
            <Stop offset="50%" stopColor="#F97316" stopOpacity="0.75" />
            <Stop offset="100%" stopColor="#EA580C" stopOpacity="0.65" />
          </SvgLinearGradient>
        </Defs>
        
        {/* Blue wave - broader, lower frequency */}
        <Path
          d={blueWavePath}
          fill="none"
          stroke="url(#blueWaveGradientHome)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.75}
        />
        
        {/* Orange wave - tighter, higher frequency */}
        <Path
          d={orangeWavePath}
          fill="none"
          stroke="url(#orangeWaveGradientHome)"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.8}
        />
      </Svg>
    </View>
  );
};

const customIconStyles = StyleSheet.create({
  frequencyContainer: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default function FrequencyHomeScreen({ navigation, route }) {
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

    try {
      if (!db) {
        throw new Error('Firestore database is not initialized');
      }

      // Generate unique room code using utility
      const newRoomCode = await generateUniqueRoomCode('FrequencyRoom', generateRoomCode);
      
      if (!newRoomCode) {
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
        players: [{ name: playerName, score: 0, has_guessed: false, color: PLAYER_COLORS[0], active: true }],
        game_status: 'lobby',
        current_turn_index: 0,
        needle_positions: {},
        created_at: Date.now(), // Store as timestamp for age calculation
        expires_at: Timestamp.fromMillis(Date.now() + (2 * 60 * 60 * 1000)) // 2 hours from now
      };

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
      
      // Log analytics event
      const { logCreateRoom } = await import('../../utils/analytics');
      logCreateRoom('frequency', newRoomCode);
      
      // Save player name BEFORE navigation (like Alias does)
      try {
        await storage.setItem('playerName', playerName);
        console.log('✅ [FREQUENCY] Player name saved to storage');
      } catch (e) {
        console.warn('⚠️ [FREQUENCY] Could not save player name:', e);
      }
      
      // Navigate to room
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
      
      // Log analytics event
      const { logJoinRoom } = await import('../../utils/analytics');
      logJoinRoom('frequency', roomCode.toUpperCase());
      
      // Navigate to room
      navigation.navigate('FrequencyRoom', { roomCode: roomCode.toUpperCase() });
    } catch (e) {
      console.warn('Could not save player name:', e);
      
      // Log analytics event
      const { logJoinRoom } = await import('../../utils/analytics');
      logJoinRoom('frequency', roomCode.toUpperCase());
      
      // Navigate to room
      navigation.navigate('FrequencyRoom', { roomCode: roomCode.toUpperCase() });
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
    <GradientBackground variant="frequency">
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
            variant="frequency"
            style={styles.backButton}
          />

          <View style={styles.cardContainer}>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.iconContainer}>
                  <FrequencyWaves />
                </View>
                <Text style={styles.cardTitle}>התדר</Text>
                <Text style={styles.cardSubtitle}>משחק הגלים והתדירויות!</Text>
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
                  variant="frequency"
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
                  variant="frequency"
                  style={styles.joinButton}
                />

                <View style={styles.instructionsContainer}>
                  <Text style={styles.instructionsTitle}>📋 איך משחקים?</Text>
                  <View style={styles.instructionsList}>
                    <Text style={styles.instructionItem}>
                      <Text style={styles.instructionNumber}>1. </Text>
                      כולם רואים את המסך עם הנושאים.
                    </Text>
                    <Text style={styles.instructionItem}>
                      <Text style={styles.instructionNumber}>2. </Text>
                      בכל תור יש שחקן שרואה את הסקאלה אליה צריך לדייק והוא נותן הרמז
                    </Text>
                    <Text style={styles.instructionItem}>
                      <Text style={styles.instructionNumber}>3. </Text>
                      שאר השחקנים מנסים לכוון את המחוג שלהם לאותו אזור.
                    </Text>
                    <Text style={styles.instructionItem}>
                      <Text style={styles.instructionNumber}>4. </Text>
                      ככל שהניחוש קרוב יותר — מקבלים יותר נקודות.
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
    backgroundColor: '#0A1A3A', // Frequency theme color - כחול כהה
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
