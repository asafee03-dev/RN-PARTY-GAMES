import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';

export default function SpyEndScreen({ navigation, route }) {
  const winner = route?.params?.winner || 'spy'; // 'spy' or 'civilians'

  const handlePlayAgain = () => {
    navigation.navigate('SpyRoomScreen');
  };

  const handleBackToLobby = () => {
    navigation.navigate('SpyHome');
  };

  return (
    <GradientBackground variant="spy">
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.celebration}>
            <Text style={styles.celebrationEmoji}>
              {winner === 'spy' ? '🕵️' : '🎉'}
            </Text>
          </View>

          <View style={styles.winnerCard}>
            <Text style={styles.winnerText}>
              {winner === 'spy' ? 'המרגל ניצח!' : 'האזרחים ניצחו!'}
            </Text>
          </View>

          <View style={styles.actionsContainer}>
            <GradientButton
              title="שחק שוב"
              onPress={handlePlayAgain}
              variant="spy"
              style={styles.actionButton}
            />
            <GradientButton
              title="חזור ללובי"
              onPress={handleBackToLobby}
              variant="spy"
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
    marginBottom: 32,
  },
  celebrationEmoji: {
    fontSize: 80,
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
  winnerText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2C3E50',
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
