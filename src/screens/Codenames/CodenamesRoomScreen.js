import React from 'react';
import { View, Text, StyleSheet, ScrollView, FlatList } from 'react-native';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';
import TeamScoreCard from '../../components/codenames/TeamScoreCard';

export default function CodenamesRoomScreen({ navigation }) {
  // Mock data - will be replaced with real data
  const bluePlayers = ['יוסי', 'שרה', 'דני'];
  const redPlayers = ['מיכל', 'אבי'];
  const blueSpymaster = 'יוסי';
  const redSpymaster = 'מיכל';

  const handleStartGame = () => {
    navigation.navigate('CodenamesGame');
  };

  const PlayerItem = ({ player, isSpymaster, team }) => (
    <View style={[
      styles.playerItem,
      team === 'blue' ? styles.bluePlayer : styles.redPlayer
    ]}>
      <Text style={styles.playerName}>{player}</Text>
      {isSpymaster && (
        <View style={styles.spymasterBadge}>
          <Text style={styles.spymasterText}>מנחה</Text>
        </View>
      )}
    </View>
  );

  return (
    <GradientBackground variant="beige">
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>חדר המשחק</Text>
          <View style={styles.roomCodeContainer}>
            <Text style={styles.roomCodeLabel}>קוד חדר:</Text>
            <Text style={styles.roomCode}>ABC123</Text>
          </View>
        </View>

        <View style={styles.teamsSection}>
          {/* Blue Team */}
          <View style={styles.teamSection}>
            <TeamScoreCard team="blue" score={bluePlayers.length} />
            <View style={styles.playersList}>
              <Text style={styles.teamSectionTitle}>צוות כחול</Text>
              <FlatList
                data={bluePlayers}
                renderItem={({ item }) => (
                  <PlayerItem
                    player={item}
                    isSpymaster={item === blueSpymaster}
                    team="blue"
                  />
                )}
                keyExtractor={(item, index) => `blue-${index}`}
                scrollEnabled={false}
              />
            </View>
            <GradientButton
              title="הצטרף לכחול"
              onPress={() => {}}
              variant="blue"
              style={styles.joinButton}
            />
          </View>

          {/* Red Team */}
          <View style={styles.teamSection}>
            <TeamScoreCard team="red" score={redPlayers.length} />
            <View style={styles.playersList}>
              <Text style={styles.teamSectionTitle}>צוות אדום</Text>
              <FlatList
                data={redPlayers}
                renderItem={({ item }) => (
                  <PlayerItem
                    player={item}
                    isSpymaster={item === redSpymaster}
                    team="red"
                  />
                )}
                keyExtractor={(item, index) => `red-${index}`}
                scrollEnabled={false}
              />
            </View>
            <GradientButton
              title="הצטרף לאדום"
              onPress={() => {}}
              variant="red"
              style={styles.joinButton}
            />
          </View>
        </View>

        <GradientButton
          title="התחל משחק"
          onPress={handleStartGame}
          variant="green"
          style={styles.startButton}
        />
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 16,
  },
  roomCodeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    gap: 8,
  },
  roomCodeLabel: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
  roomCode: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#D4A574',
    letterSpacing: 4,
  },
  teamsSection: {
    flex: 1,
    gap: 24,
    marginBottom: 32,
  },
  teamSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  playersList: {
    marginVertical: 16,
  },
  teamSectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    color: '#2C3E50',
  },
  playerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  bluePlayer: {
    backgroundColor: '#E3F2FD',
  },
  redPlayer: {
    backgroundColor: '#FFEBEE',
  },
  playerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C3E50',
  },
  spymasterBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  spymasterText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  joinButton: {
    width: '100%',
    marginTop: 8,
  },
  startButton: {
    width: '100%',
    marginBottom: 24,
  },
});
