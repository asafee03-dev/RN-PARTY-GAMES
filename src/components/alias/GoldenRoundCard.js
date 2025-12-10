import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import GradientButton from '../codenames/GradientButton';
import AliasTimer from './AliasTimer';

export default function GoldenRoundCard({ 
  word,
  teams,
  onTeamGuess,
  canInteract,
  timerComponent,
  showWord = true,
  startTime,
  onTimeUp
}) {
  return (
    <View style={styles.container}>
      <View style={styles.badgeContainer}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>⭐ תור זהב!</Text>
        </View>
        <Text style={styles.badgeSubtext}>כל הקבוצות יכולות לנחש - הראשונה שתלחץ מנצחת!</Text>
      </View>

      {timerComponent || (
        <View style={styles.timerContainer}>
          <AliasTimer
            duration={60}
            startTime={startTime}
            onTimeUp={onTimeUp}
            compact={false}
          />
        </View>
      )}

      {showWord && word && (
        <View style={styles.wordContainer}>
          <Text style={styles.wordText}>{word}</Text>
        </View>
      )}

      {canInteract && (
        <View style={styles.teamsGrid}>
          {teams.map((team, teamIdx) => (
            <Pressable
              key={teamIdx}
              style={[styles.teamButton, { backgroundColor: team.color }]}
              onPress={() => onTeamGuess(teamIdx)}
            >
              <Text style={styles.teamButtonText}>{team.name}</Text>
            </Pressable>
          ))}
          <Pressable
            style={[styles.teamButton, styles.skipButton]}
            onPress={() => onTeamGuess(null)}
          >
            <Text style={styles.teamButtonText}>דלג</Text>
          </Pressable>
        </View>
      )}

      {!canInteract && (
        <View style={styles.waitingContainer}>
          <Text style={styles.waitingText}>ממתין לניחוש...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FEF3C7',
    borderRadius: 24,
    padding: 24,
    marginBottom: 20,
    borderWidth: 3,
    borderColor: '#F59E0B',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  badgeContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  badge: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginBottom: 8,
  },
  badgeText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  badgeSubtext: {
    fontSize: 14,
    color: '#92400E',
    textAlign: 'center',
  },
  timerContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  wordContainer: {
    backgroundColor: '#FEF3C7',
    borderRadius: 20,
    padding: 32,
    marginBottom: 20,
    borderWidth: 4,
    borderColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
    width: 300,
    height: 300,
    alignSelf: 'center',
  },
  wordText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#92400E',
    textAlign: 'center',
  },
  teamsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  teamButton: {
    flex: 1,
    minWidth: 140,
    height: 60,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  skipButton: {
    backgroundColor: '#0A1A3A', // Dark blue/black
  },
  waitingContainer: {
    alignItems: 'center',
    padding: 16,
  },
  waitingText: {
    fontSize: 16,
    color: '#92400E',
    textAlign: 'center',
  },
});

