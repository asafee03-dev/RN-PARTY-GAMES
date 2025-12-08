import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';

export default function CodenamesHomeScreen({ navigation }) {
  const [roomCode, setRoomCode] = useState('');

  const handleCreateRoom = () => {
    // TODO: Implement create room logic
    navigation.navigate('CodenamesSetup');
  };

  const handleJoinRoom = () => {
    // TODO: Implement join room logic
    if (roomCode.trim()) {
      navigation.navigate('CodenamesSetup');
    }
  };

  return (
    <GradientBackground variant="purple">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.logoText}>🎯</Text>
            <Text style={styles.title}>Party Games</Text>
            <Text style={styles.subtitle}>Codenames</Text>
          </View>

          <View style={styles.content}>
            <View style={styles.inputContainer}>
              <Text style={styles.label}>קוד חדר</Text>
              <TextInput
                style={styles.input}
                value={roomCode}
                onChangeText={setRoomCode}
                placeholder="הזן קוד חדר"
                placeholderTextColor="#999"
                autoCapitalize="characters"
                maxLength={6}
              />
              <GradientButton
                title="הצטרף לחדר"
                onPress={handleJoinRoom}
                variant="blue"
                style={styles.joinButton}
                disabled={!roomCode.trim()}
              />
            </View>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>או</Text>
              <View style={styles.dividerLine} />
            </View>

            <GradientButton
              title="צור חדר חדש"
              onPress={handleCreateRoom}
              variant="primary"
              style={styles.createButton}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoText: {
    fontSize: 80,
    marginBottom: 16,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 28,
    fontWeight: '600',
    color: '#FFFFFF',
    opacity: 0.9,
  },
  content: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 24,
  },
  label: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
    textAlign: 'right',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    fontSize: 18,
    textAlign: 'right',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  joinButton: {
    width: '100%',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#FFFFFF',
    opacity: 0.3,
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 0.8,
  },
  createButton: {
    width: '100%',
  },
});
