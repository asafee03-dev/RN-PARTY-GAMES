import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';

export default function CodenamesSetupScreen({ navigation }) {
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [selectedRole, setSelectedRole] = useState(null);

  const handleContinue = () => {
    if (selectedTeam && selectedRole) {
      navigation.navigate('CodenamesRoom');
    }
  };

  return (
    <GradientBackground variant="purple">
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>בחר צוות ותפקיד</Text>
          <Text style={styles.subtitle}>איזה צוות אתה רוצה להצטרף?</Text>
        </View>

        <View style={styles.teamsContainer}>
          {/* Blue Team Card */}
          <View
            style={[
              styles.teamCard,
              styles.blueTeamCard,
              selectedTeam === 'blue' && styles.selectedCard
            ]}
          >
            <Pressable
              style={styles.cardPressable}
              onPress={() => setSelectedTeam('blue')}
            >
              <View style={styles.teamHeader}>
                <View style={[styles.teamCircle, styles.blueCircle]} />
                <Text style={[styles.teamName, styles.blueText]}>כחולה</Text>
              </View>
              
              {selectedTeam === 'blue' && (
                <View style={styles.rolesContainer}>
                  <GradientButton
                    title="מנחה"
                    onPress={() => setSelectedRole('spymaster')}
                    variant={selectedRole === 'spymaster' ? 'blue' : 'default'}
                    style={styles.roleButton}
                  />
                  <GradientButton
                    title="מנחש"
                    onPress={() => setSelectedRole('guesser')}
                    variant={selectedRole === 'guesser' ? 'blue' : 'default'}
                    style={styles.roleButton}
                  />
                </View>
              )}
            </Pressable>
          </View>

          {/* Red Team Card */}
          <View
            style={[
              styles.teamCard,
              styles.redTeamCard,
              selectedTeam === 'red' && styles.selectedCard
            ]}
          >
            <Pressable
              style={styles.cardPressable}
              onPress={() => setSelectedTeam('red')}
            >
              <View style={styles.teamHeader}>
                <View style={[styles.teamCircle, styles.redCircle]} />
                <Text style={[styles.teamName, styles.redText]}>אדומה</Text>
              </View>
              
              {selectedTeam === 'red' && (
                <View style={styles.rolesContainer}>
                  <GradientButton
                    title="מנחה"
                    onPress={() => setSelectedRole('spymaster')}
                    variant={selectedRole === 'spymaster' ? 'red' : 'default'}
                    style={styles.roleButton}
                  />
                  <GradientButton
                    title="מנחש"
                    onPress={() => setSelectedRole('guesser')}
                    variant={selectedRole === 'guesser' ? 'red' : 'default'}
                    style={styles.roleButton}
                  />
                </View>
              )}
            </Pressable>
          </View>
        </View>

        <GradientButton
          title="המשך"
          onPress={handleContinue}
          variant="primary"
          style={styles.continueButton}
          disabled={!selectedTeam || !selectedRole}
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
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#FFFFFF',
    opacity: 0.9,
    textAlign: 'center',
  },
  teamsContainer: {
    flex: 1,
    gap: 20,
    marginBottom: 32,
  },
  teamCard: {
    borderRadius: 20,
    padding: 24,
    minHeight: 150,
    borderWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  blueTeamCard: {
    backgroundColor: '#E3F2FD',
    borderColor: '#2196F3',
  },
  redTeamCard: {
    backgroundColor: '#FFEBEE',
    borderColor: '#F44336',
  },
  selectedCard: {
    borderWidth: 5,
    transform: [{ scale: 1.02 }],
  },
  cardPressable: {
    flex: 1,
  },
  teamHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  teamCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 12,
  },
  blueCircle: {
    backgroundColor: '#2196F3',
  },
  redCircle: {
    backgroundColor: '#F44336',
  },
  teamName: {
    fontSize: 28,
    fontWeight: '700',
  },
  blueText: {
    color: '#1976D2',
  },
  redText: {
    color: '#C62828',
  },
  rolesContainer: {
    gap: 12,
    marginTop: 8,
  },
  roleButton: {
    minWidth: 150,
    alignSelf: 'center',
  },
  continueButton: {
    width: '100%',
    marginBottom: 24,
  },
});
