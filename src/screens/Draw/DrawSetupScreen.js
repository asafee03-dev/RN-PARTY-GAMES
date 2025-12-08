import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';

export default function DrawSetupScreen({ navigation }) {
  const handleContinue = () => {
    navigation.navigate('DrawGame');
  };

  return (
    <GradientBackground variant="purple">
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>מוכן להתחיל</Text>
          <Text style={styles.subtitle}>המשחק יתחיל בקרוב</Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            • כל שחקן יתבקש לצייר מילה
          </Text>
          <Text style={styles.infoText}>
            • השחקנים האחרים ינסו לנחש
          </Text>
          <Text style={styles.infoText}>
            • מי שניחש ראשון מקבל נקודות
          </Text>
        </View>

        <GradientButton
          title="המשך →"
          onPress={handleContinue}
          variant="primary"
          style={styles.continueButton}
        />
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#FFFFFF',
    opacity: 0.9,
    textAlign: 'center',
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    marginBottom: 32,
  },
  infoText: {
    fontSize: 18,
    color: '#2C3E50',
    marginBottom: 12,
    textAlign: 'right',
  },
  continueButton: {
    width: '100%',
  },
});
