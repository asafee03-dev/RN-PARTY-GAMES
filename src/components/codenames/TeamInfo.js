import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export default function TeamInfo({ 
  redTeam, 
  blueTeam, 
  currentTurn, 
  redWordsLeft, 
  blueWordsLeft,
  currentPlayerName,
  compact = false
}) {
  const getPlayerRole = (team) => {
    if (team.spymaster === currentPlayerName) return 'spymaster';
    if (team.guessers.includes(currentPlayerName)) return 'guesser';
    return null;
  };

  const TeamCard = ({ team, color, wordsLeft, isCurrentTurn }) => {
    const role = getPlayerRole(team);
    const isMyTeam = role !== null;
    
    return (
      <View style={[
        styles.teamCard,
        isCurrentTurn && styles.currentTurnCard,
        color === 'red' ? styles.redCard : styles.blueCard
      ]}>
        <View style={styles.teamHeader}>
          <View style={styles.teamInfo}>
            <View style={[styles.colorDot, color === 'red' ? styles.redDot : styles.blueDot]} />
            <View style={styles.teamNameContainer}>
              <Text style={[styles.teamName, compact && styles.compactTeamName]}>
                {color === 'red' ? 'אדומה 🔴' : 'כחולה 🔵'}
              </Text>
              {isMyTeam && (
                <View style={styles.youBadge}>
                  <Text style={styles.youBadgeText}>אתה כאן</Text>
                </View>
              )}
            </View>
          </View>
          {role && (
            <View style={[styles.roleBadge, role === 'spymaster' ? styles.spymasterBadge : styles.guesserBadge]}>
              <Text style={styles.roleBadgeText}>
                {role === 'spymaster' ? '👁️ מרגל' : '👥 מנחש'}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.wordsContainer}>
          <Text style={[styles.wordsNumber, compact && styles.compactWordsNumber, { color: color === 'red' ? '#EF4444' : '#3B82F6' }]}>
            {wordsLeft}
          </Text>
          <Text style={[styles.wordsLabel, compact && styles.compactWordsLabel]}>מילים</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, compact && styles.compactContainer]}>
      <TeamCard 
        team={redTeam} 
        color="red" 
        wordsLeft={redWordsLeft}
        isCurrentTurn={currentTurn === 'red'}
      />
      <TeamCard 
        team={blueTeam} 
        color="blue" 
        wordsLeft={blueWordsLeft}
        isCurrentTurn={currentTurn === 'blue'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  compactContainer: {
    gap: 8,
    marginBottom: 8,
  },
  teamCard: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#FFFFFF',
  },
  compactTeamCard: {
    padding: 8,
  },
  currentTurnCard: {
    borderWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  redCard: {
    borderColor: '#EF4444',
  },
  blueCard: {
    borderColor: '#3B82F6',
  },
  teamHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  teamInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  colorDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  redDot: {
    backgroundColor: '#EF4444',
  },
  blueDot: {
    backgroundColor: '#3B82F6',
  },
  teamNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  teamName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#374151',
  },
  compactTeamName: {
    fontSize: 14,
  },
  youBadge: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  youBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  roleBadge: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  spymasterBadge: {
    backgroundColor: '#A78BFA',
  },
  guesserBadge: {
    backgroundColor: '#10B981',
  },
  roleBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  wordsContainer: {
    alignItems: 'center',
  },
  wordsNumber: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  compactWordsNumber: {
    fontSize: 24,
  },
  wordsLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  compactWordsLabel: {
    fontSize: 12,
  },
});

