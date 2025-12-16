import React from 'react';
import { FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';
import BannerAd from '../../components/shared/BannerAd';
import HostStatusCard from '../../components/shared/HostStatusCard';
import PlayerCard from '../../components/shared/PlayerCard';

export default function AliasRoomScreen({ navigation }) {
  // Mock data - will be replaced with real game state
  const [isHost] = React.useState(true);
  const hostName = 'אתה';
  const teams = [
    { name: 'קבוצה 1', players: ['אתה', 'יוספן'] },
    { name: 'קבוצה 2', players: ['שרה', 'דני'] },
  ];
  
  const handleInvitePlayers = () => {
    // TODO: Implement invite logic
    console.log('Invite players');
  };

  const handleStartGame = () => {
    navigation.navigate('AliasGame');
  };

  const goBack = () => {
    const parent = navigation.getParent();
    if (parent) {
      parent.reset({
        index: 0,
        routes: [{ name: 'Home' }]
      });
    } else {
      navigation.navigate('Home');
    }
  };

  return (
    <GradientBackground variant="brightBlue">
      <ScrollView 
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <GradientButton
          title="← חזרה למשחקים"
          onPress={goBack}
          variant="alias"
          style={styles.backButton}
        />
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Alias</Text>
        </View>

        <GradientButton
          title="מזמין שחקנים"
          onPress={handleInvitePlayers}
          variant="alias"
          style={styles.inviteButton}
        />

        <HostStatusCard hostName={hostName} gameMode="normal" />

        <View style={styles.teamsSection}>
          {teams.map((team, index) => (
            <View key={index} style={styles.teamCard}>
              <Text style={styles.teamName}>{team.name}</Text>
              <View style={styles.playersList}>
                <FlatList
                  data={team.players}
                  renderItem={({ item }) => (
                    <PlayerCard
                      playerName={item}
                      isHost={item === hostName && index === 0}
                    />
                  )}
                  keyExtractor={(item, idx) => `team-${index}-player-${idx}`}
                  numColumns={2}
                  scrollEnabled={false}
                  contentContainerStyle={styles.playersGrid}
                />
              </View>
            </View>
          ))}
        </View>

        {isHost && (
          <View style={styles.startButtonContainer}>
            <GradientButton
              title="התחל המשחק →"
              onPress={handleStartGame}
              variant="alias"
              style={styles.startButton}
            />
          </View>
        )}
      </ScrollView>
      <BannerAd />
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    paddingBottom: 40,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#4FA8FF', // Alias theme color - כחול בהיר
    letterSpacing: 1,
  },
  inviteButton: {
    width: '100%',
    marginBottom: 16,
    borderRadius: 30,
    paddingVertical: 18,
  },
  teamsSection: {
    gap: 20,
    marginTop: 8,
    marginBottom: 24,
  },
  teamCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  teamName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2C3E50',
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
