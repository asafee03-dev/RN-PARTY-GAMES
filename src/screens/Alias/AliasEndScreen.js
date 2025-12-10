import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';

export default function AliasEndScreen({ navigation, route }) {
  const winnerTeam = route?.params?.winner || 'קבוצה 1';

  const handlePlayAgain = () => {
    navigation.navigate('AliasRoom');
  };

  const handleBackToLobby = () => {
    navigation.navigate('AliasHome');
  };

  return (
    <GradientBackground variant="brightBlue">
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.celebration}>
            <Text style={styles.celebrationEmoji}>🎉</Text>
            <Text style={styles.celebrationEmoji}>🏆</Text>
          </View>

          <View style={styles.winnerCard}>
            <Text style={styles.winnerText}>
              {winnerTeam} ניצחה!
            </Text>
            <Text style={styles.winnerSubtext}>
              מזל טוב!
            </Text>
          </View>

          <View style={styles.actionsContainer}>
            <GradientButton
              title="שחק שוב"
              onPress={handlePlayAgain}
              variant="alias"
              style={styles.actionButton}
            />
            <GradientButton
              title="חזור ללובי"
              onPress={handleBackToLobby}
              variant="alias"
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
  actionsContainer: {
    width: '100%',
    gap: 16,
  },
  actionButton: {
    width: '100%',
  },
});
