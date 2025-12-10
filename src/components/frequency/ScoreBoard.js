import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import GradientBackground from '../codenames/GradientBackground';

export default function ScoreBoard({ players, currentTurnIndex }) {
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerIcon}>🏆</Text>
        <Text style={styles.headerTitle}>לוח תוצאות</Text>
      </View>
      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {sortedPlayers.map((player, idx) => {
          const isCurrentTurn = players[currentTurnIndex]?.name === player.name;
          
          return (
            <View
              key={player.name}
              style={[
                styles.playerCard,
                isCurrentTurn && styles.playerCardActive
              ]}
            >
              <View style={styles.playerCardContent}>
                <View style={styles.rankRow}>
                  <Text style={styles.rankText}>#{idx + 1}</Text>
                  {idx === 0 && player.score > 0 && (
                    <Text style={styles.trophyIcon}>🏆</Text>
                  )}
                </View>
                <View style={styles.nameRow}>
                  <Text style={styles.playerName}>{player.name}</Text>
                  {isCurrentTurn && (
                    <View style={styles.turnBadge}>
                      <Text style={styles.turnBadgeText}>🎮 תורו</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.scoreText}>{player.score}</Text>
                
                {/* Progress bar to 10 */}
                <View style={styles.progressBarContainer}>
                  <View
                    style={[
                      styles.progressBar,
                      { width: `${Math.min((player.score / 10) * 100, 100)}%` }
                    ]}
                  />
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>
      <Text style={styles.footerText}>🏆 ראשון ל-10 נקודות מנצח!</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    maxHeight: 200,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerIcon: {
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },
  scrollContent: {
    gap: 8,
    paddingVertical: 4,
  },
  playerCard: {
    width: '100%',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 10,
    marginBottom: 6,
  },
  playerCardActive: {
    backgroundColor: '#F3E8FF',
    borderColor: '#A78BFA',
  },
  playerCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 40,
  },
  rankText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  trophyIcon: {
    fontSize: 14,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  playerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  turnBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  turnBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  scoreText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#7C3AED',
    minWidth: 50,
    textAlign: 'right',
  },
  progressBarContainer: {
    display: 'none', // Hide progress bar in compact vertical layout
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#7C3AED',
    borderRadius: 4,
  },
  footerText: {
    fontSize: 11,
    textAlign: 'center',
    color: '#6B7280',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
});

