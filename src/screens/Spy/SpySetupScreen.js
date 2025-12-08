import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';

export default function SpySetupScreen({ navigation }) {
  const [selectedLocation, setSelectedLocation] = useState(null);
  const locations = ['בית קפה', 'ספינה', 'בית ספר', 'שדה תעופה'];

  const handleContinue = () => {
    if (selectedLocation) {
      navigation.navigate('SpyGame');
    }
  };

  return (
    <GradientBackground variant="purple">
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>בחר מיקום</Text>
          <Text style={styles.subtitle}>איזה מיקום תרצה?</Text>
        </View>

        <View style={styles.locationsGrid}>
          {locations.map((location, index) => (
            <Pressable
              key={index}
              style={[
                styles.locationCard,
                selectedLocation === location && styles.locationCardSelected
              ]}
              onPress={() => setSelectedLocation(location)}
            >
              <Text style={[
                styles.locationText,
                selectedLocation === location && styles.locationTextSelected
              ]}>
                {location}
              </Text>
            </Pressable>
          ))}
        </View>

        <GradientButton
          title="המשך"
          onPress={handleContinue}
          variant="primary"
          style={styles.continueButton}
          disabled={!selectedLocation}
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
  locationsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 32,
  },
  locationCard: {
    width: '48%',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  locationCardSelected: {
    backgroundColor: '#FFFFFF',
    borderColor: '#9C27B0',
  },
  locationText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  locationTextSelected: {
    color: '#9C27B0',
  },
  continueButton: {
    width: '100%',
    marginBottom: 24,
  },
});
