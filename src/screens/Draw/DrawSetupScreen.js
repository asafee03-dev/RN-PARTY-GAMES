import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';
import BannerAd from '../../components/shared/BannerAd';

export default function DrawSetupScreen({ navigation }) {
  const handleContinue = () => {
    navigation.navigate('DrawGame');
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
    <GradientBackground variant="draw">
      <ScrollView contentContainerStyle={styles.container}>
        <GradientButton
          title="← חזרה למשחקים"
          onPress={goBack}
          variant="draw"
          style={styles.backButton}
        />
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
          variant="draw"
          style={styles.continueButton}
        />
      </ScrollView>
      <BannerAd />
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
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
});
