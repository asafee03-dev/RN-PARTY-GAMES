import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Pressable, Image } from 'react-native';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';

export default function DrawEndScreen({ navigation, route }) {
  const [guess, setGuess] = useState('');
  
  // Mock data - will come from route params or game state
  const roundData = route?.params?.roundData || {
    drawer: 'יוסי',
    word: 'כלב',
    correctGuessers: ['שרה', 'דני'],
    drawingImage: null, // Would be the exported drawing
  };

  const handleSubmitGuess = () => {
    // TODO: Submit guess logic
    console.log('Guess submitted:', guess);
  };

  const handleNextRound = () => {
    navigation.navigate('DrawGame');
  };

  const handleBackToLobby = () => {
    navigation.navigate('DrawHome');
  };

  return (
    <GradientBackground variant="purple">
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>סיכום סיבוב</Text>
        </View>

        {/* Drawing Display */}
        {roundData.drawingImage && (
          <View style={styles.drawingContainer}>
            <Image 
              source={{ uri: roundData.drawingImage }} 
              style={styles.drawingImage}
              resizeMode="contain"
            />
          </View>
        )}

        {/* Word Reveal */}
        <View style={styles.wordRevealCard}>
          <Text style={styles.wordRevealLabel}>המילה הייתה:</Text>
          <Text style={styles.wordRevealText}>{roundData.word}</Text>
        </View>

        {/* Correct Guessers */}
        {roundData.correctGuessers.length > 0 && (
          <View style={styles.guessersCard}>
            <Text style={styles.guessersTitle}>מי ניחש נכון:</Text>
            {roundData.correctGuessers.map((guesser, index) => (
              <View key={index} style={styles.guesserItem}>
                <Text style={styles.guesserName}>{guesser}</Text>
                <Text style={styles.guesserPoints}>+1 נקודות</Text>
              </View>
            ))}
          </View>
        )}

        {/* Input guess (if still guessing) */}
        {!roundData.showResults && (
          <View style={styles.guessInputContainer}>
            <Text style={styles.guessLabel}>הכנס ניחוש:</Text>
            <TextInput
              style={styles.guessInput}
              value={guess}
              onChangeText={setGuess}
              placeholder="מה המילה?"
              placeholderTextColor="#999"
              autoCapitalize="none"
            />
            <GradientButton
              title="שלח ניחוש"
              onPress={handleSubmitGuess}
              variant="green"
              style={styles.submitGuessButton}
              disabled={!guess.trim()}
            />
          </View>
        )}

        {/* Action Buttons */}
        {roundData.showResults && (
          <View style={styles.actionsContainer}>
            <GradientButton
              title="סיבוב הבא →"
              onPress={handleNextRound}
              variant="primary"
              style={styles.actionButton}
            />
            <GradientButton
              title="חזור ללובי"
              onPress={handleBackToLobby}
              variant="blue"
              style={styles.actionButton}
            />
          </View>
        )}
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 50,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  drawingContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  drawingImage: {
    width: '100%',
    height: 300,
    borderRadius: 12,
  },
  wordRevealCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  wordRevealLabel: {
    fontSize: 18,
    color: '#666',
    marginBottom: 12,
  },
  wordRevealText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2C3E50',
  },
  guessersCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  guessersTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2C3E50',
    marginBottom: 16,
    textAlign: 'right',
  },
  guesserItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  guesserName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C3E50',
  },
  guesserPoints: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4CAF50',
  },
  guessInputContainer: {
    marginBottom: 20,
  },
  guessLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
    textAlign: 'right',
  },
  guessInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    fontSize: 18,
    textAlign: 'right',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  submitGuessButton: {
    width: '100%',
  },
  actionsContainer: {
    gap: 16,
    marginTop: 20,
  },
  actionButton: {
    width: '100%',
  },
});
