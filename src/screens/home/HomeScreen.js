import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
// Using emojis instead of lucide icons for React Native compatibility

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const games = [
  {
    id: 'alias',
    name: 'אליאב',
    description: 'משחק ההסברות המהיר! 45 שניות להסביר כמה שיותר מילים',
    icon: '💬',
    color: ['#4FA8FF', '#3B82F6', '#2563EB'], // כחול בהיר
    bgColor: ['#EFF6FF', '#DBEAFE'], // from-blue-50 to-blue-100
    available: true,
    page: 'Alias'
  },
  {
    id: 'codenames',
    name: 'שם טוב',
    description: 'משחק קבוצתי של מילים וקשרים - נחשו את המילים הנכונות',
    icon: '🔍',
    color: ['#D9C3A5', '#C4A574', '#B8956A'], // חום בהיר
    bgColor: ['#FDF4E8', '#FAF0E6'], // from-beige-50 to-beige-100
    available: true,
    page: 'Codenames'
  },
  {
    id: 'spy',
    name: 'המרגל',
    description: 'מי המרגל ביניכם? נסו לגלות מי לא באותו מקום',
    icon: '👁️',
    color: ['#7ED957', '#4ADE80', '#22C55E'], // ירוק בהיר
    bgColor: ['#F0FDF4', '#D1FAE5'], // from-green-50 to-emerald-50
    available: true,
    page: 'Spy'
  },
  {
    id: 'frequency',
    name: 'התדר',
    description: 'משחק חיבור וסנכרון - כמה אתם על אותו גל?',
    icon: '🎮',
    color: ['#0A1A3A', '#1E3A5F', '#2D4A6B'], // כחול כהה
    bgColor: ['#E0E7FF', '#C7D2FE'], // from-indigo-50 to-indigo-100
    available: true,
    page: 'Frequency'
  },
  {
    id: 'draw',
    name: 'צייר משהו',
    description: 'צייר ונחש - משחק יצירתי ומהנה!',
    icon: '🎨',
    color: ['#C48CFF', '#A855F7', '#9333EA'], // סגול בהיר
    bgColor: ['#F3E8FF', '#E9D5FF'], // from-purple-50 to-purple-100
    available: true,
    page: 'Draw'
  },
];

export default function HomeScreen({ navigation }) {
  const handleGameClick = (game) => {
    if (game.available) {
      // Navigate to parent navigator (AppNavigator)
      const parent = navigation.getParent();
      if (parent) {
        parent.navigate(game.page);
      } else {
        navigation.navigate(game.page);
      }
    }
  };

  const handleSettingsClick = () => {
    navigation.navigate('Settings');
  };

  return (
    <LinearGradient
      colors={['#FEF3C7', '#FED7AA', '#FECACA']} // from-amber-50 via-orange-50 to-rose-50
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Settings Button */}
        <View style={styles.settingsContainer}>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={handleSettingsClick}
          >
            <Text style={styles.settingsIcon}>⚙️</Text>
            <Text style={styles.settingsText}>הגדרות</Text>
          </TouchableOpacity>
        </View>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Text style={styles.headerIcon}>🎮</Text>
          </View>
          <Text style={styles.title}>PARTY GAMES</Text>
          <Text style={styles.subtitle}>בחרו את המשחק שלכם ותתחילו את המסיבה!</Text>
        </View>

        {/* Games Grid */}
        <View style={styles.gamesGrid}>
          {games.map((game, index) => {
            return (
              <TouchableOpacity
                key={game.id}
                style={styles.gameCard}
                onPress={() => handleGameClick(game)}
                activeOpacity={0.8}
              >
                <View style={[styles.cardContent, { backgroundColor: game.bgColor[0] }]}>
                  {/* Card Header with Gradient */}
                  <LinearGradient
                    colors={game.color}
                    style={styles.cardHeader}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <View style={styles.cardIconContainer}>
                      <View style={styles.cardIconBackground}>
                        <Text style={styles.cardIcon}>{game.icon}</Text>
                      </View>
                    </View>
                  </LinearGradient>

                  {/* Card Body */}
                  <View style={styles.cardBody}>
                    <Text style={styles.gameName}>{game.name}</Text>
                    <Text style={styles.gameDescription}>{game.description}</Text>
                    {game.available && (
                      <View style={styles.playNowContainer}>
                        <Text style={styles.playNowText}>שחק עכשיו</Text>
                        <Text style={styles.playNowArrow}>→</Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerContent}>
            <Text style={styles.footerIcon}>🎮</Text>
            <Text style={styles.footerText}>משחקים נוספים בדרך...</Text>
            <Text style={styles.footerIcon}>🎉</Text>
          </View>
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
  settingsContainer: {
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  settingsIcon: {
    fontSize: 20,
    marginLeft: 8,
  },
  settingsText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#374151',
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  iconContainer: {
    marginBottom: 16,
  },
  headerIcon: {
    fontSize: 80,
  },
  title: {
    fontSize: 56,
    fontWeight: '900',
    color: '#9333EA',
    marginBottom: 16,
    textAlign: 'center',
  },
  cardIcon: {
    fontSize: 48,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
  gamesGrid: {
    gap: 24,
    marginBottom: 32,
  },
  gameCard: {
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  cardContent: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  cardHeader: {
    paddingTop: 32,
    paddingBottom: 48,
    paddingHorizontal: 24,
    position: 'relative',
  },
  cardIconContainer: {
    alignItems: 'center',
    position: 'absolute',
    bottom: -24,
    left: '50%',
    marginLeft: -40,
  },
  cardIconBackground: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  cardBody: {
    padding: 32,
    paddingTop: 48,
    alignItems: 'center',
  },
  gameName: {
    fontSize: 28,
    fontWeight: '900',
    color: '#1F2937',
    marginBottom: 12,
    textAlign: 'center',
  },
  gameDescription: {
    fontSize: 18,
    color: '#4B5563',
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 24,
  },
  playNowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  playNowText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#9333EA',
  },
  playNowArrow: {
    fontSize: 24,
    color: '#9333EA',
  },
  footer: {
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 24,
  },
  footerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 24,
    paddingHorizontal: 32,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  footerIcon: {
    fontSize: 24,
  },
  footerText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
  },
});
