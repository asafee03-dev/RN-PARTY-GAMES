import React from 'react';
import { View, Text, StyleSheet, ScrollView, FlatList } from 'react-native';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';
import PlayerCard from '../../components/shared/PlayerCard';
import HostStatusCard from '../../components/shared/HostStatusCard';

export default function DrawRoomScreen({ navigation }) {
  // Mock data - will be replaced with real game state
  const [isHost] = React.useState(true);
  const hostName = 'אתה';
  const players = ['אתה', 'יוספן', 'מיכל', 'אבי', 'שרה'];
  
  const handleInvitePlayers = () => {
    // TODO: Implement invite logic
    console.log('Invite players');
  };

  const handleStartGame = () => {
    navigation.navigate('DrawGame');
  };

  return (
    <GradientBackground variant="purple">
      <ScrollView 
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Draw Something</Text>
        </View>

        {/* Invite Button */}
        <GradientButton
          title="מזמין שחקנים"
          onPress={handleInvitePlayers}
          variant="orange"
          style={styles.inviteButton}
        />

        {/* Host Status Card */}
        <HostStatusCard hostName={hostName} gameMode="normal" />

        {/* Players List */}
        <View style={styles.playersSection}>
          <Text style={styles.sectionTitle}>
            שחקנים בחדר ({players.length}):
          </Text>
          <View style={styles.playersList}>
            <FlatList
              data={players}
              renderItem={({ item, index }) => (
                <PlayerCard
                  playerName={item}
                  isHost={index === 0}
                />
              )}
              keyExtractor={(item, index) => `player-${index}`}
              numColumns={2}
              scrollEnabled={false}
              contentContainerStyle={styles.playersGrid}
            />
          </View>
        </View>

        {/* Start Game Button */}
        {isHost && (
          <View style={styles.startButtonContainer}>
            <GradientButton
              title="התחל המשחק →"
              onPress={handleStartGame}
              variant="pink"
              style={styles.startButton}
            />
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
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  inviteButton: {
    width: '100%',
    marginBottom: 16,
    borderRadius: 30,
    paddingVertical: 18,
  },
  playersSection: {
    marginTop: 8,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 16,
    textAlign: 'right',
  },
  playersList: {
    width: '100%',
  },
  playersGrid: {
    justifyContent: 'space-between',
  },
  startButtonContainer: {
    width: '100%',
    marginTop: 'auto',
  },
  startButton: {
    width: '100%',
    borderRadius: 30,
    paddingVertical: 18,
  },
});
