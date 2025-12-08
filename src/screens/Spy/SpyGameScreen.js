import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, FlatList } from 'react-native';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';

export default function SpyGameScreen({ navigation }) {
  // Mock game state
  const [gameState] = useState({
    location: 'בית קפה',
    players: [
      { name: 'יוסי', role: 'civilian', hasVoted: false },
      { name: 'שרה', role: 'spy', hasVoted: false },
      { name: 'דני', role: 'civilian', hasVoted: false },
      { name: 'מיכל', role: 'civilian', hasVoted: false },
    ],
    currentPhase: 'voting', // 'roleAssignment' | 'voting' | 'reveal' | 'summary'
    myRole: 'civilian',
    votes: {},
    showSummary: false,
  });

  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [hasVoted, setHasVoted] = useState(false);

  const handleVote = () => {
    if (selectedPlayer) {
      setHasVoted(true);
      // TODO: Submit vote
    }
  };

  const handleContinue = () => {
    navigation.navigate('SpyEnd');
  };

  if (gameState.currentPhase === 'roleAssignment') {
    return (
      <GradientBackground variant="purple">
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.roleContainer}>
            <Text style={styles.roleTitle}>התפקיד שלך</Text>
            <View style={[
              styles.roleCard,
              gameState.myRole === 'spy' ? styles.roleCardSpy : styles.roleCardCivilian
            ]}>
              <Text style={styles.roleEmoji}>
                {gameState.myRole === 'spy' ? '🕵️' : '👤'}
              </Text>
              <Text style={styles.roleText}>
                {gameState.myRole === 'spy' ? 'אתה המרגל!' : 'אתה אזרח'}
              </Text>
              {gameState.myRole === 'civilian' && (
                <Text style={styles.locationText}>
                  המיקום הוא: {gameState.location}
                </Text>
              )}
              {gameState.myRole === 'spy' && (
                <Text style={styles.spyHintText}>
                  אתה לא יודע מה המיקום!
                </Text>
              )}
            </View>
            <GradientButton
              title="הבא →"
              onPress={() => {
                // TODO: Continue to voting phase
              }}
              variant="primary"
              style={styles.continueButton}
            />
          </View>
        </ScrollView>
      </GradientBackground>
    );
  }

  if (gameState.showSummary || gameState.currentPhase === 'summary') {
    return (
      <GradientBackground variant="purple">
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.summaryContainer}>
            <Text style={styles.summaryTitle}>סיכום המשחק</Text>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLocation}>המיקום היה: {gameState.location}</Text>
              <Text style={styles.summarySpy}>
                המרגל היה: {gameState.players.find(p => p.role === 'spy')?.name}
              </Text>
            </View>
            <GradientButton
              title="חזור ללובי"
              onPress={handleContinue}
              variant="primary"
              style={styles.continueButton}
            />
          </View>
        </ScrollView>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground variant="purple">
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Spy</Text>
          {gameState.myRole === 'civilian' && (
            <Text style={styles.locationBadge}>{gameState.location}</Text>
          )}
        </View>

        <Text style={styles.votingTitle}>הצבע על המרגל</Text>

        <View style={styles.playersList}>
          <FlatList
            data={gameState.players}
            renderItem={({ item }) => (
              <Pressable
                style={[
                  styles.playerVoteCard,
                  selectedPlayer === item.name && styles.playerVoteCardSelected,
                  hasVoted && !selectedPlayer && styles.playerVoteCardDisabled
                ]}
                onPress={() => !hasVoted && setSelectedPlayer(item.name)}
                disabled={hasVoted}
              >
                <Text style={[
                  styles.playerVoteName,
                  selectedPlayer === item.name && styles.playerVoteNameSelected
                ]}>
                  {item.name}
                </Text>
                {item.hasVoted && (
                  <Text style={styles.votedIndicator}>✓</Text>
                )}
              </Pressable>
            )}
            keyExtractor={(item, index) => `player-${index}`}
            scrollEnabled={false}
          />
        </View>

        {!hasVoted && (
          <GradientButton
            title="שלח הצבעה"
            onPress={handleVote}
            variant="green"
            style={styles.voteButton}
            disabled={!selectedPlayer}
          />
        )}

        {hasVoted && (
          <View style={styles.waitingContainer}>
            <Text style={styles.waitingText}>ממתין לשחקנים אחרים...</Text>
          </View>
        )}
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 50,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  locationBadge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    fontSize: 18,
    fontWeight: '700',
    color: '#9C27B0',
  },
  roleContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  roleTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 32,
  },
  roleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 40,
    alignItems: 'center',
    minWidth: 300,
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  roleCardSpy: {
    backgroundColor: '#F44336',
  },
  roleCardCivilian: {
    backgroundColor: '#4CAF50',
  },
  roleEmoji: {
    fontSize: 80,
    marginBottom: 16,
  },
  roleText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
    textAlign: 'center',
  },
  locationText: {
    fontSize: 20,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  spyHintText: {
    fontSize: 18,
    color: '#FFFFFF',
    textAlign: 'center',
    opacity: 0.9,
  },
  votingTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 24,
  },
  playersList: {
    marginBottom: 24,
  },
  playerVoteCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  playerVoteCardSelected: {
    borderColor: '#9C27B0',
    backgroundColor: '#F3E5F5',
  },
  playerVoteCardDisabled: {
    opacity: 0.5,
  },
  playerVoteName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2C3E50',
  },
  playerVoteNameSelected: {
    color: '#9C27B0',
  },
  votedIndicator: {
    fontSize: 24,
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  voteButton: {
    width: '100%',
    marginBottom: 16,
  },
  waitingContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  waitingText: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  summaryContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  summaryTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 32,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    marginBottom: 32,
    minWidth: 300,
  },
  summaryLocation: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 16,
  },
  summarySpy: {
    fontSize: 20,
    color: '#F44336',
    fontWeight: '700',
  },
  continueButton: {
    width: '100%',
    minWidth: 200,
  },
});
