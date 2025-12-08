import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';

export default function AliasSetupScreen({ navigation }) {
  const [selectedTeams, setSelectedTeams] = useState([]);
  const [goldenRoundsEnabled, setGoldenRoundsEnabled] = useState(false);

  const handleContinue = () => {
    navigation.navigate('AliasRoom');
  };

  return (
    <GradientBackground variant="purple">
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>הגדרת משחק Alias</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>בחר מספר קבוצות</Text>
          <View style={styles.teamsSelector}>
            {[2, 3, 4].map(num => (
              <Pressable
                key={num}
                style={[
                  styles.teamOption,
                  selectedTeams.length === num && styles.teamOptionSelected
                ]}
                onPress={() => setSelectedTeams(Array(num).fill(null))}
              >
                <Text style={[
                  styles.teamOptionText,
                  selectedTeams.length === num && styles.teamOptionTextSelected
                ]}>
                  {num} קבוצות
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>אפשרויות נוספות</Text>
          <Pressable
            style={[
              styles.optionToggle,
              goldenRoundsEnabled && styles.optionToggleActive
            ]}
            onPress={() => setGoldenRoundsEnabled(!goldenRoundsEnabled)}
          >
            <Text style={[
              styles.optionToggleText,
              goldenRoundsEnabled && styles.optionToggleTextActive
            ]}>
              {goldenRoundsEnabled ? '✓' : ''} סבבי זהב
            </Text>
          </Pressable>
        </View>

        <GradientButton
          title="המשך"
          onPress={handleContinue}
          variant="primary"
          style={styles.continueButton}
          disabled={selectedTeams.length === 0}
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
    textAlign: 'center',
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 16,
    textAlign: 'right',
  },
  teamsSelector: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 12,
  },
  teamOption: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  teamOptionSelected: {
    backgroundColor: '#FFFFFF',
    borderColor: '#9C27B0',
  },
  teamOptionText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  teamOptionTextSelected: {
    color: '#9C27B0',
  },
  optionToggle: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionToggleActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFD700',
  },
  optionToggleText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  optionToggleTextActive: {
    color: '#2C3E50',
  },
  continueButton: {
    width: '100%',
    marginBottom: 24,
  },
});
