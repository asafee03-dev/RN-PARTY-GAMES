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
        <View style={[
          styles.teamHeader,
          color === 'red' ? styles.redTeamHeaderBg : styles.blueTeamHeaderBg
        ]}>
          <View style={styles.teamInfo}>
            <View style={styles.teamNameContainer}>
              <Text style={[styles.teamName, compact && styles.compactTeamName, styles.teamNameWhite]}>
                {color === 'red' ? 'אדומה' : 'כחולה'}
              </Text>
              <Text style={[styles.wordsRemainingHeader, compact && styles.compactWordsRemainingHeader]}>
                {wordsLeft} מילים
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
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  compactTeamCard: {
    padding: 0,
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
    alignItems: 'center',
    padding: 16,
  },
  redTeamHeaderBg: {
    backgroundColor: '#EF4444',
  },
  blueTeamHeaderBg: {
    backgroundColor: '#3B82F6',
  },
  teamInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  teamNameContainer: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
    flex: 1,
  },
  teamName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  teamNameWhite: {
    color: '#FFFFFF',
  },
  compactTeamName: {
    fontSize: 14,
  },
  wordsRemainingHeader: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  compactWordsRemainingHeader: {
    fontSize: 12,
  },
  youBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 4,
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
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  guesserBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  roleBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});

