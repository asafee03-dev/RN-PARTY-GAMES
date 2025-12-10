import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function PlayerCard({ playerName, isHost = false }) {
  return (
    <View style={styles.card}>
      <Text style={styles.playerName}>{playerName}</Text>
      {isHost && (
        <View style={styles.crownIcon}>
          <Text style={styles.crownText}>👑</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#9CA3AF', // Gray neutral
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 6,
    marginVertical: 6,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    flexDirection: 'row',
    gap: 8,
  },
  playerName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  crownIcon: {
    marginLeft: 4,
  },
  crownText: {
    fontSize: 16,
  },
});

