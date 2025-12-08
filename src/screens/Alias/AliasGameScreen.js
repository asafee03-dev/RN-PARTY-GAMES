import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';
import Timer from '../../components/shared/Timer';

export default function AliasGameScreen({ navigation }) {
  // Mock game state - will be replaced with real state management
  const [gameState] = useState({
    teams: [
      { name: 'קבוצה 1', position: 15, players: ['יוסי', 'שרה'] },
      { name: 'קבוצה 2', position: 12, players: ['דני', 'מיכל'] },
    ],
    currentTurn: 0,
    roundActive: true,
    currentRoundScore: 5,
    roundStartTime: Date.now() - 30000, // 30 seconds ago
    roundDuration: 60,
    currentCardIndex: 5,
    currentWord: 'כלב',
    currentWordIsGolden: false,
    showRoundSummary: false,
    usedCards: [],
  });

  const [timeLeft, setTimeLeft] = useState(30);
  const currentTeam = gameState.teams[gameState.currentTurn];
  const isMyTeam = true; // TODO: Replace with actual check

  const handleCorrect = () => {
    // TODO: Implement correct logic
    console.log('Correct guess');
  };

  const handleSkip = () => {
    // TODO: Implement skip logic
    console.log('Skip word');
  };

  const handleNextRound = () => {
    // TODO: Implement next round logic
    navigation.navigate('AliasEnd');
  };

  if (gameState.showRoundSummary) {
    return (
      <GradientBackground variant="purple">
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.summaryContainer}>
            <Text style={styles.summaryTitle}>סיכום סיבוב</Text>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTeamName}>{currentTeam.name}</Text>
              <Text style={styles.summaryScore}>
                {gameState.currentRoundScore} מילים נמצאו
              </Text>
              <Text style={styles.summaryPosition}>
                מיקום: {currentTeam.position}/59
              </Text>
            </View>
            <GradientButton
              title="הבא →"
              onPress={handleNextRound}
              variant="green"
              style={styles.nextButton}
            />
          </View>
        </ScrollView>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground variant="purple">
      <ScrollView 
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>←</Text>
          </Pressable>
          <View style={styles.timerContainer}>
            <Timer
              initialTime={timeLeft}
              onFinish={() => {
                // TODO: Handle timer finish
                console.log('Timer finished');
              }}
              onTick={setTimeLeft}
            />
          </View>
          <View style={styles.teamScoreBadge}>
            <Text style={styles.teamScoreText}>{gameState.currentRoundScore}</Text>
          </View>
        </View>

        {/* Team Info */}
        <View style={styles.teamInfo}>
          <Text style={styles.teamName}>{currentTeam.name}</Text>
          <View style={styles.progressBar}>
            <View 
              style={[
                styles.progressFill, 
                { width: `${(currentTeam.position / 59) * 100}%` }
              ]} 
            />
          </View>
          <Text style={styles.progressText}>
            {currentTeam.position} / 59
          </Text>
        </View>

        {/* Word Card */}
        <View style={[
          styles.wordCard,
          gameState.currentWordIsGolden && styles.wordCardGolden
        ]}>
          {gameState.currentWordIsGolden && (
            <View style={styles.goldenBadge}>
              <Text style={styles.goldenText}>✨ זהב ✨</Text>
            </View>
          )}
          <Text style={[
            styles.wordText,
            gameState.currentWordIsGolden && styles.wordTextGolden
          ]}>
            {gameState.currentWord}
          </Text>
          <Text style={styles.cardNumber}>
            כרטיס {gameState.currentCardIndex + 1}
          </Text>
        </View>

        {/* Action Buttons */}
        {isMyTeam && gameState.roundActive && (
          <View style={styles.actionsContainer}>
            <GradientButton
              title="נכון ✓"
              onPress={handleCorrect}
              variant="green"
              style={styles.actionButton}
            />
            <GradientButton
              title="דלג"
              onPress={handleSkip}
              variant="red"
              style={styles.actionButton}
            />
          </View>
        )}

        {/* Instructions */}
        {!isMyTeam && (
          <View style={styles.waitingContainer}>
            <Text style={styles.waitingText}>
              ממתין ל{currentTeam.name}...
            </Text>
          </View>
        )}
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 50,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
  },
  timerContainer: {
    flex: 1,
    alignItems: 'center',
  },
  teamScoreBadge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  teamScoreText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#9C27B0',
  },
  teamInfo: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  teamName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
    textAlign: 'center',
  },
  progressBar: {
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 10,
  },
  progressText: {
    fontSize: 14,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  wordCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 300,
    marginVertical: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    position: 'relative',
  },
  wordCardGolden: {
    backgroundColor: '#FFD700',
  },
  goldenBadge: {
    position: 'absolute',
    top: 16,
    backgroundColor: '#FFA000',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  goldenText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  wordText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#2C3E50',
    textAlign: 'center',
  },
  wordTextGolden: {
    color: '#FFFFFF',
  },
  cardNumber: {
    position: 'absolute',
    bottom: 16,
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 20,
  },
  actionButton: {
    flex: 1,
    minWidth: 120,
  },
  waitingContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    padding: 20,
    marginTop: 20,
    alignItems: 'center',
  },
  waitingText: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  summaryContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  summaryTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 32,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    marginBottom: 32,
    minWidth: 300,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  summaryTeamName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 16,
  },
  summaryScore: {
    fontSize: 24,
    color: '#4CAF50',
    fontWeight: '700',
    marginBottom: 12,
  },
  summaryPosition: {
    fontSize: 18,
    color: '#666',
  },
  nextButton: {
    width: '100%',
    minWidth: 200,
  },
});
