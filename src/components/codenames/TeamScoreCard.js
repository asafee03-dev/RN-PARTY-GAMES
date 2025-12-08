import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function TeamScoreCard({ team, score, isActive = false }) {
  const isBlue = team === 'blue';
  
  return (
    <View style={[
      styles.card,
      isBlue ? styles.blueCard : styles.redCard,
      isActive && styles.activeCard
    ]}>
      <View style={styles.scoreContainer}>
        <Text style={[
          styles.scoreNumber,
          isBlue ? styles.blueText : styles.redText
        ]}>
          {score}
        </Text>
      </View>
      <Text style={[
        styles.teamName,
        isBlue ? styles.blueText : styles.redText
      ]}>
        {isBlue ? 'כחולה' : 'אדומה'}
      </Text>
      <Text style={styles.playersLabel}>חברים</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    minWidth: 120,
    alignItems: 'center',
    borderWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  blueCard: {
    backgroundColor: '#E3F2FD',
    borderColor: '#2196F3',
  },
  redCard: {
    backgroundColor: '#FFEBEE',
    borderColor: '#F44336',
  },
  activeCard: {
    borderWidth: 4,
    transform: [{ scale: 1.05 }],
  },
  scoreContainer: {
    marginBottom: 8,
  },
  scoreNumber: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  blueText: {
    color: '#1976D2',
  },
  redText: {
    color: '#C62828',
  },
  teamName: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  playersLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
});

