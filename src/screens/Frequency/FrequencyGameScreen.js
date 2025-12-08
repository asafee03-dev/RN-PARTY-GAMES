import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TouchableOpacity } from 'react-native';
import GradientBackground from '../../components/codenames/GradientBackground';
import SemiCircleGauge from '../../components/frequency/SemiCircleGauge';

export default function FrequencyGameScreen({ navigation }) {
  // Mock game state - will be replaced with real state management
  const [gameState] = useState({
    players: [
      { name: 'יוסי', score: 0, hasGuessed: false },
      { name: 'שרה', score: 0, hasGuessed: false },
      { name: 'דני', score: 0, hasGuessed: false },
    ],
    currentTurnIndex: 0,
    currentTopic: {
      leftSide: 'מקום לסיטול גדול',
      rightSide: 'מקום טובול ידול גדול'
    },
    currentRoundSectors: [
      { id: 'left', start: 0, end: 60, points: 1 },
      { id: 'center', start: 60, end: 120, points: 2 },
      { id: 'right', start: 120, end: 180, points: 1 }
    ],
    turnPhase: 'guessing',
    needlePositions: {},
    guessSubmittedNames: {},
  });

  const [pointerAngle, setPointerAngle] = useState(90);
  const [guessedPlayers, setGuessedPlayers] = useState(0);
  const totalPlayers = gameState.players.length - 1; // Exclude clue giver

  const currentPlayer = gameState.players[gameState.currentTurnIndex];
  const isMyTurn = true; // TODO: Replace with actual check

  const handlePointerDrag = (angle) => {
    setPointerAngle(Math.max(0, Math.min(180, angle)));
  };

  const handleSubmitGuess = () => {
    // TODO: Implement guess submission
    setGuessedPlayers(prev => prev + 1);
  };

  return (
    <GradientBackground variant="teal">
      <ScrollView 
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Buttons */}
        <View style={styles.header}>
          <Pressable style={styles.headerButton}>
            <Text style={styles.headerIcon}>🔗</Text>
          </Pressable>
          
          <Pressable style={[styles.headerButton, styles.activeButton]}>
            <Text style={styles.headerIcon}>🎮</Text>
            <Text style={styles.activeButtonText}>התור שלך</Text>
          </Pressable>
          
          <Pressable style={styles.headerButton}>
            <Text style={styles.headerIcon}>⚡</Text>
          </Pressable>
        </View>

        {/* Turn Indicator */}
        <View style={styles.turnIndicator}>
          <Text style={styles.turnText}>תן התור שלך</Text>
        </View>

        {/* Hint Text */}
        <Text style={styles.hintText}>
          תן רמז לשחקנים האחרים – השחקנים מנחשים...
        </Text>

        {/* Semi-Circle Gauge */}
        <View style={styles.gaugeContainer}>
          <SemiCircleGauge
            sectors={gameState.currentRoundSectors}
            pointerAngle={pointerAngle}
            onAngleChange={handlePointerDrag}
            leftLabel={gameState.currentTopic.leftSide}
            rightLabel={gameState.currentTopic.rightSide}
            disabled={gameState.turnPhase !== 'guessing'}
          />
        </View>

        {/* Angle Display */}
        <View style={styles.angleDisplay}>
          <Text style={styles.angleText}>{Math.round(pointerAngle)}°</Text>
        </View>

        {/* Submit Guess Button */}
        {gameState.turnPhase === 'guessing' && !guessedPlayers && (
          <Pressable
            style={styles.submitButton}
            onPress={handleSubmitGuess}
          >
            <Text style={styles.submitButtonText}>שלח ניחוש</Text>
          </Pressable>
        )}

        {/* Player Status */}
        <View style={styles.playerStatusContainer}>
          <Text style={styles.playerStatusText}>
            {guessedPlayers} מתוך {totalPlayers} שחקנים נרשמו
          </Text>
          <Text style={styles.playerStatusText}>
            שחקנים שנרשמו:
          </Text>
          {guessedPlayers === 0 && (
            <Text style={styles.noPlayersText}>
              אין עדיין שחקנים שנרשמו
            </Text>
          )}
        </View>
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
  headerButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  activeButton: {
    backgroundColor: '#FF6B35',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
  },
  headerIcon: {
    fontSize: 20,
  },
  activeButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  turnIndicator: {
    backgroundColor: '#81C784',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  turnText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  hintText: {
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 32,
    opacity: 0.9,
  },
  gaugeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20,
  },
  angleDisplay: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    minWidth: 80,
    alignItems: 'center',
    alignSelf: 'center',
    marginVertical: 16,
  },
  angleText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2C3E50',
  },
  submitButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 25,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    marginVertical: 20,
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  playerStatusContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
  },
  playerStatusText: {
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'right',
  },
  noPlayersText: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.7,
    textAlign: 'center',
    marginTop: 8,
  },
});
