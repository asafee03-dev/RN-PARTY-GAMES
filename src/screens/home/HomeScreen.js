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
    color: ['#A855F7', '#EC4899', '#F97316'], // from-purple-400 via-pink-400 to-rose-400
    bgColor: ['#FDF4FF', '#FDF2F8'], // from-purple-50 to-pink-50
    available: true,
    page: 'Alias'
  },
  {
    id: 'codenames',
    name: 'שם טוב',
    description: 'משחק קבוצתי של מילים וקשרים - נחשו את המילים הנכונות',
    icon: '🔍',
    color: ['#60A5FA', '#06B6D4', '#14B8A6'], // from-blue-400 via-cyan-400 to-teal-400
    bgColor: ['#EFF6FF', '#ECFEFF'], // from-blue-50 to-cyan-50
    available: true,
    page: 'Codenames'
  },
  {
    id: 'spy',
    name: 'המרגל',
    description: 'מי המרגל ביניכם? נסו לגלות מי לא באותו מקום',
    icon: '👁️',
    color: ['#4ADE80', '#10B981', '#14B8A6'], // from-green-400 via-emerald-400 to-teal-400
    bgColor: ['#F0FDF4', '#ECFDF5'], // from-green-50 to-emerald-50
    available: true,
    page: 'Spy'
  },
  {
    id: 'frequency',
    name: 'התדר',
    description: 'משחק חיבור וסנכרון - כמה אתם על אותו גל?',
    icon: '🎮',
    color: ['#A78BFA', '#A855F7', '#D946EF'], // from-violet-400 via-purple-400 to-fuchsia-400
    bgColor: ['#F5F3FF', '#FAF5FF'], // from-violet-50 to-purple-50
    available: true,
    page: 'Frequency'
  },
  {
    id: 'draw',
    name: 'צייר משהו',
    description: 'צייר ונחש - משחק יצירתי ומהנה!',
    icon: '🎨',
    color: ['#F472B6', '#A855F7', '#6366F1'], // from-pink-400 via-purple-400 to-indigo-400
    bgColor: ['#FDF2F8', '#FAF5FF'], // from-pink-50 to-purple-50
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
