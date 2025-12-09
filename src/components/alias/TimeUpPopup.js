import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import GradientButton from '../codenames/GradientButton';

export default function TimeUpPopup({ 
  isMyTurn, 
  room, 
  onCorrect, 
  onSkip 
}) {
  if (!isMyTurn) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>הזמן נגמר!</Text>
      <Text style={styles.subtitle}>בחר מי ניחש את המילה האחרונה:</Text>
      
      <View style={styles.buttonsContainer}>
        {room.teams.map((team, index) => (
          <GradientButton
            key={index}
            title={team.name}
            onPress={() => onCorrect(index)}
            variant={index === room.current_turn ? 'primary' : 'blue'}
            style={styles.teamButton}
          />
        ))}
        <GradientButton
          title="דלג"
          onPress={onSkip}
          variant="red"
          style={styles.teamButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  buttonsContainer: {
    gap: 12,
  },
  teamButton: {
    width: '100%',
  },
});

