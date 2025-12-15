import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
// Using emojis instead of lucide icons for React Native compatibility

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Custom icon components
const SpeechBubbleWithQuestion = () => (
  <View style={customIconStyles.speechBubbleContainer}>
    <Text style={customIconStyles.speechBubble}>💬</Text>
    <View style={customIconStyles.questionMarkContainer}>
      <Text style={customIconStyles.questionMark}>❓</Text>
    </View>
  </View>
);

const FrequencyWaves = () => {
  const size = 48;
  const centerY = size / 2;
  
  // Blue wave - lower frequency, broader waves (sinusoidal)
  const blueWavePath = `M 0 ${centerY} 
    C ${size * 0.1} ${centerY - 10} ${size * 0.2} ${centerY - 10} ${size * 0.3} ${centerY}
    C ${size * 0.4} ${centerY + 10} ${size * 0.5} ${centerY + 10} ${size * 0.6} ${centerY}
    C ${size * 0.7} ${centerY - 10} ${size * 0.8} ${centerY - 10} ${size * 0.9} ${centerY}
    C ${size * 0.95} ${centerY + 5} ${size} ${centerY + 5} ${size} ${centerY}`;
  
  // Orange wave - higher frequency, tighter waves (offset for visual interest)
  const orangeWavePath = `M 0 ${centerY + 2} 
    C ${size * 0.08} ${centerY - 8} ${size * 0.16} ${centerY - 8} ${size * 0.24} ${centerY + 2}
    C ${size * 0.32} ${centerY + 12} ${size * 0.4} ${centerY + 12} ${size * 0.48} ${centerY + 2}
    C ${size * 0.56} ${centerY - 8} ${size * 0.64} ${centerY - 8} ${size * 0.72} ${centerY + 2}
    C ${size * 0.8} ${centerY + 12} ${size * 0.88} ${centerY + 12} ${size * 0.96} ${centerY + 2}
    C ${size * 0.98} ${centerY - 3} ${size} ${centerY - 3} ${size} ${centerY + 2}`;
  
  return (
    <View style={customIconStyles.frequencyContainer}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <SvgLinearGradient id="blueWaveGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#3B82F6" stopOpacity="0.85" />
            <Stop offset="50%" stopColor="#2563EB" stopOpacity="0.75" />
            <Stop offset="100%" stopColor="#1E40AF" stopOpacity="0.65" />
          </SvgLinearGradient>
          <SvgLinearGradient id="orangeWaveGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#F59E0B" stopOpacity="0.85" />
            <Stop offset="50%" stopColor="#F97316" stopOpacity="0.75" />
            <Stop offset="100%" stopColor="#EA580C" stopOpacity="0.65" />
          </SvgLinearGradient>
        </Defs>
        
        {/* Blue wave - broader, lower frequency */}
        <Path
          d={blueWavePath}
          fill="none"
          stroke="url(#blueWaveGradient)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.75}
        />
        
        {/* Orange wave - tighter, higher frequency */}
        <Path
          d={orangeWavePath}
          fill="none"
          stroke="url(#orangeWaveGradient)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.8}
        />
      </Svg>
    </View>
  );
};

const BinaryCode = () => {
  const binaryRows = [
    ['0', '1', '0', '1', '1', '0'],
    ['1', '0', '1', '0', '0', '1'],
    ['0', '1', '1', '0', '1', '0'],
    ['1', '1', '0', '1', '0', '1'],
  ];
  
  return (
    <View style={customIconStyles.binaryContainer}>
      {binaryRows.map((row, rowIndex) => (
        <View key={rowIndex} style={customIconStyles.binaryRow}>
          {row.map((bit, bitIndex) => (
            <Text 
              key={`${rowIndex}-${bitIndex}`} 
              style={[
                customIconStyles.binaryBit,
                (rowIndex === 0 && (bitIndex === 0 || bitIndex === 3)) || 
                (rowIndex === 1 && (bitIndex === 2 || bitIndex === 5)) || 
                (rowIndex === 2 && bitIndex === 1) || 
                (rowIndex === 3 && bitIndex === 4) 
                  ? customIconStyles.binaryBitLarge 
                  : null
              ]}
            >
              {bit}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
};

const customIconStyles = StyleSheet.create({
  speechBubbleContainer: {
    width: 48,
    height: 48,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  speechBubble: {
    fontSize: 48,
    position: 'absolute',
  },
  questionMarkContainer: {
    position: 'absolute',
    top: 6,
    left: 12,
  },
  questionMark: {
    fontSize: 22,
  },
  frequencyContainer: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  binaryContainer: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
    borderRadius: 6,
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 255, 0.2)',
  },
  binaryRow: {
    flexDirection: 'row',
    gap: 2,
    marginBottom: 1,
  },
  binaryBit: {
    color: '#00FFFF',
    fontSize: 7,
    fontWeight: '600',
    textShadowColor: '#00FFFF',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
    opacity: 0.7,
  },
  binaryBitLarge: {
    fontSize: 9,
    fontWeight: '700',
    opacity: 1,
  },
});

const games = [
  {
    id: 'alias',
    name: 'אליאב',
    description: 'משחק ההסברות המהיר! 45 שניות להסביר כמה שיותר מילים',
    icon: 'custom-speech-bubble',
    color: ['#4FA8FF', '#3B82F6', '#2563EB'], // כחול בהיר
    bgColor: ['#EFF6FF', '#DBEAFE'], // from-blue-50 to-blue-100
    available: true,
    page: 'Alias'
  },
  {
    id: 'codenames',
    name: 'שם טוב',
    description: 'משחק קבוצתי של מילים וקשרים - נחשו את המילים הנכונות',
    icon: 'custom-binary',
    color: ['#D9C3A5', '#C4A574', '#B8956A'], // חום בהיר
    bgColor: ['#FDF4E8', '#FAF0E6'], // from-beige-50 to-beige-100
    available: true,
    page: 'Codenames'
  },
  {
    id: 'spy',
    name: 'המרגל',
    description: 'מי המרגל ביניכם? נסו לגלות מי לא באותו מקום',
    icon: '🕵️',
    color: ['#7ED957', '#4ADE80', '#22C55E'], // ירוק בהיר
    bgColor: ['#F0FDF4', '#D1FAE5'], // from-green-50 to-emerald-50
    available: true,
    page: 'Spy'
  },
  {
    id: 'frequency',
    name: 'התדר',
    description: 'משחק חיבור וסנכרון - כמה אתם על אותו גל?',
    icon: 'custom-frequency',
    color: ['#0A1A3A', '#1E3A5F', '#2D4A6B'], // כחול כהה
    bgColor: ['#E0E7FF', '#C7D2FE'], // from-indigo-50 to-indigo-100
    available: true,
    page: 'Frequency'
  },
  {
    id: 'draw',
    name: 'צייר משהו',
    description: 'צייר ונחש - משחק יצירתי ומהנה!',
    icon: '✏️',
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
                        {game.icon === 'custom-speech-bubble' ? (
                          <SpeechBubbleWithQuestion />
                        ) : game.icon === 'custom-frequency' ? (
                          <FrequencyWaves />
                        ) : game.icon === 'custom-binary' ? (
                          <BinaryCode />
                        ) : (
                          <Text style={styles.cardIcon}>{game.icon}</Text>
                        )}
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
    paddingHorizontal: 24,
    paddingVertical: 20,
    paddingTop: 52,
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
    marginBottom: 32,
  },
  title: {
    fontSize: 56,
    fontWeight: '900',
    color: '#9333EA',
    marginBottom: 12,
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
    paddingVertical: 24,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingTop: 32,
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
