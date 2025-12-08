import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';

export default function CodenamesEndScreen({ navigation, route }) {
  // Mock winner - will come from route params or game state
  const winner = route?.params?.winner || 'blue'; // 'blue' or 'red'
  const isBlueWinner = winner === 'blue';

  const handlePlayAgain = () => {
    navigation.navigate('CodenamesRoom');
  };

  const handleBackToLobby = () => {
    navigation.navigate('CodenamesHome');
  };

  return (
    <GradientBackground variant={isBlueWinner ? 'blue' : 'red'}>
      <View style={styles.container}>
        <View style={styles.content}>
          {/* Winner Celebration */}
          <View style={styles.celebration}>
            <Text style={styles.celebrationEmoji}>🎉</Text>
            <Text style={styles.celebrationEmoji}>🏆</Text>
            <Text style={styles.celebrationEmoji}>🎊</Text>
          </View>

          {/* Winner Message */}
          <View style={styles.winnerCard}>
            <View style={[
              styles.winnerCircle,
              isBlueWinner ? styles.blueCircle : styles.redCircle
            ]} />
            <Text style={styles.winnerText}>
              {isBlueWinner ? 'כחולה' : 'אדומה'} ניצחה!
            </Text>
            <Text style={styles.winnerSubtext}>
              הצוות {isBlueWinner ? 'הכחול' : 'האדום'} ניצח במשחק!
            </Text>
          </View>

          {/* Stats (optional - can be expanded) */}
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>15</Text>
              <Text style={styles.statLabel}>מילים נמצאו</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>8</Text>
              <Text style={styles.statLabel}>תורות</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>12:34</Text>
              <Text style={styles.statLabel}>זמן משחק</Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionsContainer}>
            <GradientButton
              title="שחק שוב"
              onPress={handlePlayAgain}
              variant="primary"
              style={styles.actionButton}
            />
            <GradientButton
              title="חזור ללובי"
              onPress={handleBackToLobby}
              variant={isBlueWinner ? 'blue' : 'red'}
              style={styles.actionButton}
            />
          </View>
        </View>
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  celebration: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 32,
  },
  celebrationEmoji: {
    fontSize: 60,
  },
  winnerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  winnerCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 16,
  },
  blueCircle: {
    backgroundColor: '#2196F3',
  },
  redCircle: {
    backgroundColor: '#F44336',
  },
  winnerText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 8,
    textAlign: 'center',
  },
  winnerSubtext: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 32,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  actionsContainer: {
    width: '100%',
    gap: 16,
  },
  actionButton: {
    width: '100%',
  },
});
