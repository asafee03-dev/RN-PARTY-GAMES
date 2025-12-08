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
        horizontal
        showsHorizontalScrollIndicator={false}
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
    borderRadius: 24,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerIcon: {
    fontSize: 20,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  scrollContent: {
    gap: 12,
    paddingHorizontal: 4,
  },
  playerCard: {
    minWidth: 140,
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    padding: 12,
  },
  playerCardActive: {
    backgroundColor: '#F3E8FF',
    borderColor: '#A78BFA',
  },
  playerCardContent: {
    alignItems: 'center',
    gap: 8,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  rankText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#9CA3AF',
  },
  trophyIcon: {
    fontSize: 20,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  playerName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
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
    fontSize: 32,
    fontWeight: '900',
    color: '#7C3AED',
  },
  progressBarContainer: {
    width: '100%',
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    marginTop: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#7C3AED',
    borderRadius: 4,
  },
  footerText: {
    textAlign: 'center',
    fontSize: 12,
    color: '#6B7280',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
});

