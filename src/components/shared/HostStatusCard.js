import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function HostStatusCard({ hostName, gameMode = 'normal' }) {
  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <Text style={styles.crownIcon}>👑</Text>
        <Text style={styles.hostText}>{hostName}</Text>
      </View>
      <View style={styles.bottomRow}>
        <Text style={styles.gameModeIcon}>🍺</Text>
        <View style={styles.gameModeBox}>
          <Text style={styles.gameModeText}>מצב משחק</Text>
        </View>
        <View style={styles.pointsBadge}>
          <Text style={styles.pointsText}>00</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#6A1B9A',
    borderRadius: 20,
    padding: 20,
    marginVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  crownIcon: {
    fontSize: 20,
  },
  hostText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  gameModeIcon: {
    fontSize: 20,
  },
  gameModeBox: {
    flex: 1,
    backgroundColor: '#000000',
    borderRadius: 12,
    padding: 12,
    minHeight: 40,
    justifyContent: 'center',
  },
  gameModeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
  },
  pointsBadge: {
    backgroundColor: '#FF6B6B',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pointsText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

