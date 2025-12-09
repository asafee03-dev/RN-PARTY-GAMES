import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import GradientButton from '../codenames/GradientButton';

export default function RoundSummary({
  room,
  currentTeam,
  isMyTurn,
  onToggleCardStatus,
  onChangeLastWordTeam,
  onChangeGoldenRoundTeam,
  onFinishRound
}) {
  const progress = {
    startPos: room.round_start_position || currentTeam.position,
    currentPos: currentTeam.position,
    moved: currentTeam.position - (room.round_start_position || currentTeam.position)
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>סיכום סיבוב</Text>
      
      <View style={styles.summaryCard}>
        <Text style={styles.teamName}>{currentTeam.name}</Text>
        <Text style={styles.score}>
          {room.current_round_score} מילים נמצאו
        </Text>
        <Text style={styles.position}>
          מיקום: {currentTeam.position + 1}/60
        </Text>
        <Text style={styles.progress}>
          התקדמות: {progress.moved >= 0 ? '+' : ''}{progress.moved}
        </Text>
      </View>

      {/* Cards List */}
      <ScrollView style={styles.cardsList} showsVerticalScrollIndicator={false}>
        {room.used_cards && room.used_cards.map((card, index) => {
          const canToggle = !card.isLastWord && !card.isGoldenWord;
          const isLastWord = card.isLastWord;
          const isGoldenWord = card.isGoldenWord;
          
          return (
            <View key={index} style={styles.cardItem}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardNumber}>#{card.cardNumber}</Text>
                <View style={styles.cardStatus}>
                  {card.status === 'correct' ? (
                    <Text style={styles.correctBadge}>✓ נכון</Text>
                  ) : (
                    <Text style={styles.skippedBadge}>✗ דולג</Text>
                  )}
                </View>
              </View>
              
              <Text style={styles.cardWord}>
                {card.words || card.word || ''}
              </Text>
              
              {/* Last word - can change team */}
              {isLastWord && (
                <View style={styles.teamSelector}>
                  <Text style={styles.teamSelectorLabel}>מי ניחש:</Text>
                  <View style={styles.teamButtons}>
                    {room.teams.map((team, teamIndex) => (
                      <GradientButton
                        key={teamIndex}
                        title={team.name}
                        onPress={() => onChangeLastWordTeam(index, teamIndex)}
                        variant={card.teamThatGuessed === teamIndex ? 'primary' : 'ghost'}
                        style={styles.teamSelectButton}
                      />
                    ))}
                    <GradientButton
                      title="דלג"
                      onPress={() => onChangeLastWordTeam(index, null)}
                      variant={card.teamThatGuessed === null ? 'red' : 'ghost'}
                      style={styles.teamSelectButton}
                    />
                  </View>
                </View>
              )}
              
              {/* Golden word - can change team */}
              {isGoldenWord && (
                <View style={styles.teamSelector}>
                  <Text style={styles.teamSelectorLabel}>מי ניחש:</Text>
                  <View style={styles.teamButtons}>
                    {room.teams.map((team, teamIndex) => (
                      <GradientButton
                        key={teamIndex}
                        title={team.name}
                        onPress={() => onChangeGoldenRoundTeam(index, teamIndex)}
                        variant={card.teamThatGuessed === teamIndex ? 'primary' : 'ghost'}
                        style={styles.teamSelectButton}
                      />
                    ))}
                    <GradientButton
                      title="דלג"
                      onPress={() => onChangeGoldenRoundTeam(index, null)}
                      variant={card.teamThatGuessed === null ? 'red' : 'ghost'}
                      style={styles.teamSelectButton}
                    />
                  </View>
                </View>
              )}
              
              {/* Toggle button for regular cards */}
              {canToggle && (
                <Pressable
                  style={[
                    styles.toggleButton,
                    card.status === 'correct' ? styles.toggleButtonCorrect : styles.toggleButtonSkipped
                  ]}
                  onPress={() => onToggleCardStatus(index)}
                >
                  <Text style={styles.toggleButtonText}>
                    {card.status === 'correct' ? 'לשנות לדולג' : 'לשנות לנכון'}
                  </Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </ScrollView>

      {isMyTurn ? (
        <GradientButton
          title="הבא →"
          onPress={onFinishRound}
          variant="green"
          style={styles.nextButton}
        />
      ) : (
        <Text style={styles.waitingText}>
          ממתינים ל{currentTeam?.name} לסיים...
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 24,
    textAlign: 'center',
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  teamName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 12,
  },
  score: {
    fontSize: 20,
    color: '#10B981',
    fontWeight: '700',
    marginBottom: 8,
  },
  position: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  progress: {
    fontSize: 18,
    color: '#8B5CF6',
    fontWeight: '600',
  },
  cardsList: {
    maxHeight: 300,
    marginBottom: 20,
  },
  cardItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  cardStatus: {
    // Status badge styling handled by correctBadge/skippedBadge
  },
  correctBadge: {
    backgroundColor: '#10B981',
    color: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 12,
    fontWeight: '600',
  },
  skippedBadge: {
    backgroundColor: '#EF4444',
    color: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 12,
    fontWeight: '600',
  },
  cardWord: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 12,
    textAlign: 'right',
  },
  teamSelector: {
    marginTop: 12,
  },
  teamSelectorLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  teamButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  teamSelectButton: {
    flex: 1,
    minWidth: 100,
  },
  toggleButton: {
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  toggleButtonCorrect: {
    backgroundColor: '#FEE2E2',
  },
  toggleButtonSkipped: {
    backgroundColor: '#D1FAE5',
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2C3E50',
    textAlign: 'center',
  },
  nextButton: {
    width: '100%',
  },
  waitingText: {
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 16,
  },
});

