import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Switch, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// Storage helper - can be replaced with AsyncStorage later
const storage = {
  async getItem(key) {
    // In a real app, use AsyncStorage
    return null;
  },
  async setItem(key, value) {
    // In a real app, use AsyncStorage
  }
};

export default function SettingsScreen({ navigation }) {
  const [nickname, setNickname] = useState('');
  const [theme, setTheme] = useState('auto');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const [hapticEnabled, setHapticEnabled] = useState(false);
  const [difficulty, setDifficulty] = useState('medium');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const storedNickname = await storage.getItem('playerName') || '';
        const storedTheme = await storage.getItem('theme') || 'auto';
        const storedSound = await storage.getItem('soundEnabled');
        const storedAnimations = await storage.getItem('animationsEnabled');
        const storedHaptic = await storage.getItem('hapticEnabled');
        const storedDifficulty = await storage.getItem('difficulty') || 'medium';

        setNickname(storedNickname);
        setTheme(storedTheme);
        setSoundEnabled(storedSound !== 'false');
        setAnimationsEnabled(storedAnimations !== 'false');
        setHapticEnabled(storedHaptic === 'true');
        setDifficulty(storedDifficulty);
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    };

    loadSettings();
  }, []);

  const handleSave = async () => {
    try {
      await storage.setItem('playerName', nickname);
      await storage.setItem('theme', theme);
      await storage.setItem('soundEnabled', soundEnabled.toString());
      await storage.setItem('animationsEnabled', animationsEnabled.toString());
      await storage.setItem('hapticEnabled', hapticEnabled.toString());
      await storage.setItem('difficulty', difficulty);

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error('Error saving settings:', error);
      Alert.alert('שגיאה', 'לא הצלחנו לשמור את ההגדרות');
    }
  };

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
  };

  const goBack = () => {
    navigation.goBack();
  };

  return (
    <LinearGradient
      colors={['#A855F7', '#EC4899', '#F43F5E']} // from-purple-500 via-pink-500 to-rose-500
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>← חזרה</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>הגדרות</Text>
          <Text style={styles.subtitle}>התאם את החוויה שלך</Text>
        </View>

        {/* Nickname Section */}
        <View style={styles.card}>
          <LinearGradient
            colors={['#A855F7', '#EC4899']}
            style={styles.cardHeader}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <View style={styles.cardHeaderContent}>
              <Text style={styles.cardHeaderIcon}>👤</Text>
              <Text style={styles.cardTitle}>כינוי שחקן</Text>
            </View>
          </LinearGradient>
          <View style={styles.cardBody}>
            <Text style={styles.label}>השם שיוצג במשחקים</Text>
            <TextInput
              style={styles.input}
              value={nickname}
              onChangeText={setNickname}
              placeholder="הכנס את הכינוי שלך..."
              placeholderTextColor="#9CA3AF"
              textAlign="right"
            />
          </View>
        </View>

        {/* Theme Section */}
        <View style={styles.card}>
          <LinearGradient
            colors={['#6366F1', '#A855F7']}
            style={styles.cardHeader}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <View style={styles.cardHeaderContent}>
              <Text style={styles.cardHeaderIcon}>🎨</Text>
              <Text style={styles.cardTitle}>ערכת נושא</Text>
            </View>
          </LinearGradient>
          <View style={styles.cardBody}>
            <View style={styles.themeGrid}>
              {[
                { value: 'light', label: 'בהיר', icon: '☀️' },
                { value: 'dark', label: 'כהה', icon: '🌙' },
                { value: 'auto', label: 'אוטומטי', icon: '✨' }
              ].map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.themeOption,
                    theme === option.value && styles.themeOptionActive
                  ]}
                  onPress={() => handleThemeChange(option.value)}
                >
                  <Text style={styles.themeIcon}>{option.icon}</Text>
                  <Text style={[
                    styles.themeLabel,
                    theme === option.value && styles.themeLabelActive
                  ]}>
                    {option.label}
                  </Text>
                  {theme === option.value && (
                    <Text style={styles.checkIcon}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Sound Section */}
        <View style={styles.card}>
          <LinearGradient
            colors={['#EC4899', '#F43F5E']}
            style={styles.cardHeader}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <View style={styles.cardHeaderContent}>
              <Text style={styles.cardHeaderIcon}>
                {soundEnabled ? '🔊' : '🔇'}
              </Text>
              <Text style={styles.cardTitle}>צלילים</Text>
            </View>
          </LinearGradient>
          <View style={styles.cardBody}>
            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <Text style={styles.switchTitle}>הפעל צלילי משחק</Text>
                <Text style={styles.switchSubtitle}>אפקטים קוליים במהלך המשחק</Text>
              </View>
              <Switch
                value={soundEnabled}
                onValueChange={setSoundEnabled}
                trackColor={{ false: '#D1D5DB', true: '#EC4899' }}
                thumbColor={soundEnabled ? '#FFFFFF' : '#F3F4F6'}
              />
            </View>
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, saved && styles.saveButtonSuccess]}
          onPress={handleSave}
        >
          <Text style={styles.saveButtonIcon}>
            {saved ? '✓' : '💾'}
          </Text>
          <Text style={styles.saveButtonText}>
            {saved ? 'נשמר בהצלחה!' : 'שמור הגדרות'}
          </Text>
        </TouchableOpacity>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            💡 ההגדרות נשמרות באופן אוטומטי על המכשיר שלך
          </Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
  },
  header: {
    marginBottom: 16,
  },
  backButton: {
    alignSelf: 'flex-start',
    padding: 12,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  titleContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 48,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  subtitle: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  cardHeader: {
    padding: 16,
  },
  cardHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardHeaderIcon: {
    fontSize: 20,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  cardBody: {
    padding: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
    textAlign: 'right',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#D1D5DB',
    borderRadius: 16,
    padding: 16,
    fontSize: 18,
    textAlign: 'right',
  },
  themeGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  themeOption: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    gap: 8,
  },
  themeOptionActive: {
    backgroundColor: '#F3E8FF',
    borderColor: '#A855F7',
  },
  themeIcon: {
    fontSize: 32,
  },
  themeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  themeLabelActive: {
    color: '#9333EA',
  },
  checkIcon: {
    fontSize: 16,
    color: '#9333EA',
    fontWeight: 'bold',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchInfo: {
    flex: 1,
    marginRight: 16,
  },
  switchTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  switchSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  saveButton: {
    backgroundColor: '#A855F7',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  saveButtonSuccess: {
    backgroundColor: '#10B981',
  },
  saveButtonIcon: {
    fontSize: 24,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  infoCard: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  infoText: {
    fontSize: 14,
    color: '#1E40AF',
    textAlign: 'center',
  },
});

