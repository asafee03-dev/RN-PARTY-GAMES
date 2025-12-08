import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';
import { db, waitForFirestoreReady } from '../../firebase';
import { doc, getDoc, setDoc, collection } from 'firebase/firestore';
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

const TEAM_COLORS = ["#EF4444", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316"];

const BASE_TEAMS = [
  { name: "קבוצה אדומה", position: 0, color: TEAM_COLORS[0], players: [] },
  { name: "קבוצה כחולה", position: 0, color: TEAM_COLORS[1], players: [] }
];

export default function AliasHomeScreen({ navigation }) {
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
    if (isCreatingRoomRef.current) {
      console.log('⚠️ Room creation already in progress, ignoring duplicate call');
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
      console.warn('⚠️ Could not save player name:', e);
    }

    let newRoomCode = generateRoomCode().trim().toUpperCase();
    const MAX_RETRIES = 5;
    let retryCount = 0;

    try {
      if (!db) {
        throw new Error('Firestore database is not initialized');
      }

      console.log('🔵 Starting room creation process...');

      const roomData = {
        room_code: newRoomCode,
        host_name: playerName,
        teams: BASE_TEAMS,
        game_status: 'setup',
        current_turn: 0,
        round_active: false,
        current_round_score: 0,
        golden_rounds_enabled: false,
        created_at: new Date().toISOString()
      };

      console.log('🔵 Creating room with code:', newRoomCode);

      const gameRoomCollection = collection(db, 'GameRoom');
      const roomRef = doc(gameRoomCollection, newRoomCode);

      console.log('🔵 [ALIAS] Ensuring Firestore is ready and online...');
      await waitForFirestoreReady();
      console.log('✅ [ALIAS] Firestore confirmed online, proceeding with write');

      let writeCompleted = false;
      try {
        console.log('🔵 [ALIAS] setDoc() call initiated');
        await setDoc(roomRef, roomData);
        writeCompleted = true;
        console.log('✅ [ALIAS] setDoc() write completed successfully!');

        const verifySnapshot = await getDoc(roomRef);
        if (verifySnapshot.exists()) {
          console.log('✅ [ALIAS] Document verified in Firestore!');
        } else {
          console.error('❌ [ALIAS] Document not found after write!');
          throw new Error('Document was not created - check Firestore Rules');
        }
      } catch (writeError) {
        console.error('❌ [ALIAS] Error during setDoc:', writeError);
        isCreatingRoomRef.current = false;
        setIsCreating(false);
        throw writeError;
      }

      if (!writeCompleted) {
        console.error('❌ [ALIAS] Write did not complete, aborting navigation');
        isCreatingRoomRef.current = false;
        setIsCreating(false);
        throw new Error('Firestore write did not complete');
      }

      console.log('✅ [ALIAS] Room created successfully with code:', newRoomCode);
      navigation.navigate('AliasSetup', { roomCode: newRoomCode });
    } catch (error) {
      console.error('❌ [ALIAS] Error creating room:', error);
      isCreatingRoomRef.current = false;
      setIsCreating(false);

      let errorMessage = 'שגיאה ביצירת החדר. נסה שוב.';
      if (error.code === 'unavailable' || error.code === 'failed-precondition' || error.message?.includes('offline')) {
        errorMessage = 'Firestore לא מחובר. אנא ודא ש:\n1. Firestore מופעל ב-Firebase Console\n2. Firestore Rules מאפשרים כתיבה\n3. יש חיבור לאינטרנט';
      } else if (error.code === 'permission-denied') {
        errorMessage = 'אין הרשאה לכתוב ל-Firestore. אנא בדוק את ה-Rules ב-Firebase Console.';
      } else if (error.code === 'not-found') {
        errorMessage = 'Firestore לא נמצא. אנא ודא ש-Firestore מופעל בפרויקט.';
      }

      setError(errorMessage);
      Alert.alert('שגיאה', errorMessage + '\n\nפרטי השגיאה:\n' + error.message);
    } finally {
      setTimeout(() => {
        isCreatingRoomRef.current = false;
        setIsCreating(false);
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
      await AsyncStorage.setItem('playerName', playerName);
      navigation.navigate('AliasSetup', { roomCode: roomCode.toUpperCase() });
    } catch (e) {
      console.warn('Could not save player name:', e);
      navigation.navigate('AliasSetup', { roomCode: roomCode.toUpperCase() });
    }
  };

  const goBack = () => {
    navigation.goBack();
  };

  return (
    <GradientBackground variant="purple">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <GradientButton
              title="← חזרה"
              onPress={goBack}
              variant="ghost"
              style={styles.backButton}
            />
          </View>

          <View style={styles.cardContainer}>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>אליאב</Text>
                <Text style={styles.cardSubtitle}>משחק ההסברות המהיר!</Text>
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
                  variant="primary"
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
                  onPress={joinRoom}
                  variant="outline"
                  style={styles.joinButton}
                />

                <View style={styles.instructionsContainer}>
                  <Text style={styles.instructionsTitle}>📋 איך משחקים?</Text>
                  <View style={styles.instructionsList}>
                    <Text style={styles.instructionItem}>
                      <Text style={styles.instructionNumber}>1. </Text>
                      חלקו לקבוצות והתחילו סבב
                    </Text>
                    <Text style={styles.instructionItem}>
                      <Text style={styles.instructionNumber}>2. </Text>
                      הסבירו מילים בלי להשתמש במילה עצמה
                    </Text>
                    <Text style={styles.instructionItem}>
                      <Text style={styles.instructionNumber}>3. </Text>
                      יש לכם 45 שניות לכל סבב!
                    </Text>
                    <Text style={styles.instructionItem}>
                      <Text style={styles.instructionNumber}>4. </Text>
                      הקבוצה הראשונה שמגיעה לסוף הלוח מנצחת!
                    </Text>
                  </View>
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
    padding: 20,
    paddingTop: 50,
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
    backgroundColor: '#9C27B0',
    padding: 24,
    paddingBottom: 40,
    alignItems: 'center',
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
