import React from 'react';
import { View, Text, StyleSheet, FlatList, Dimensions } from 'react-native';
import GameCard, { CARD_WIDTH_WITH_SPACING } from '../../components/home/GameCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const GAMES = [
  {
    id: 'alias',
    name: 'אליאב',
    description: 'משחק הסבר מילים! 45 אתגרים! מיישר המילים הגדול',
    icon: '💬',
    route: 'Alias',
    gradientTop: ['#9C27B0', '#E91E63'], // Purple to Pink
    gradientButton: ['#2196F3', '#FFEB3B'], // Blue to Yellow
  },
  {
    id: 'codenames',
    name: 'שם טוב',
    description: 'משחק מילים אסטרטגי! מצא את המילים של הצוות שלך',
    icon: '🎯',
    route: 'Codenames',
    gradientTop: ['#9C27B0', '#E91E63'],
    gradientButton: ['#2196F3', '#FFEB3B'],
  },
  {
    id: 'spy',
    name: 'המרגל',
    description: 'משחק תפקידים! מי המרגל? גלה או הישאר נסתר',
    icon: '🕵️',
    route: 'Spy',
    gradientTop: ['#9C27B0', '#E91E63'],
    gradientButton: ['#2196F3', '#FFEB3B'],
  },
  {
    id: 'frequency',
    name: 'התדר',
    description: 'משחק ניחושים! מצא את התדר הנכון וזכה בנקודות',
    icon: '📊',
    route: 'Frequency',
    gradientTop: ['#9C27B0', '#E91E63'],
    gradientButton: ['#2196F3', '#FFEB3B'],
  },
  {
    id: 'draw',
    name: 'צייר משהו',
    description: 'משחק יצירתיות! צייר ונחש מה השחקנים האחרים מציירים',
    icon: '🎨',
    route: 'Draw',
    gradientTop: ['#9C27B0', '#E91E63'],
    gradientButton: ['#2196F3', '#FFEB3B'],
  },
];

export default function HomeScreen({ navigation }) {
  const handleGamePress = (game) => {
    // Navigate to parent navigator (AppNavigator)
    const parent = navigation.getParent();
    if (parent) {
      parent.navigate(game.route);
    } else {
      navigation.navigate(game.route);
    }
  };

  const renderGameCard = ({ item, index }) => {
    const isFirst = index === 0;
    const isLast = index === GAMES.length - 1;
    
    return (
      <View style={[
        styles.cardWrapper,
        isFirst && styles.cardWrapperFirst,
        isLast && styles.cardWrapperLast
      ]}>
        <GameCard
          game={item}
          icon={item.icon}
          onPress={() => handleGamePress(item)}
        />
      </View>
    );
  };

  const getItemLayout = (data, index) => ({
    length: CARD_WIDTH_WITH_SPACING,
    offset: CARD_WIDTH_WITH_SPACING * index,
    index,
  });

  return (
    <View style={styles.container}>
      {/* Header Section */}
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Text style={[styles.title, styles.titlePart1]}>PARTY</Text>
          <Text style={[styles.title, styles.titlePart2]}>GAMES</Text>
        </View>
        
        <Text style={styles.subtitle}>
          בחרו את המשחק שלכם ותהנו במסיבה!
        </Text>

        {/* Dice Icon */}
        <View style={styles.diceContainer}>
          <View style={styles.dice}>
            <Text style={styles.diceText}>⚃</Text>
          </View>
        </View>
      </View>

      {/* Games Carousel */}
      <FlatList
        data={GAMES}
        renderItem={renderGameCard}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_WIDTH_WITH_SPACING}
        snapToAlignment="center"
        decelerationRate="fast"
        contentContainerStyle={styles.carouselContent}
        getItemLayout={getItemLayout}
        pagingEnabled={false}
        style={styles.carousel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5DC', // Beige background
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 32,
    alignItems: 'center',
    position: 'relative',
  },
  titleContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 64,
    fontWeight: '900',
    letterSpacing: 2,
    lineHeight: 72,
  },
  titlePart1: {
    color: '#9C27B0', // Purple
  },
  titlePart2: {
    color: '#FF6B35', // Reddish-orange
  },
  subtitle: {
    fontSize: 18,
    color: '#2C3E50',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 8,
  },
  diceContainer: {
    position: 'absolute',
    top: 80,
    right: 24,
  },
  dice: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    transform: [{ rotate: '15deg' }],
  },
  diceText: {
    fontSize: 32,
  },
  carousel: {
    flex: 1,
  },
  carouselContent: {
    paddingHorizontal: (SCREEN_WIDTH - CARD_WIDTH_WITH_SPACING) / 2,
    alignItems: 'center',
    paddingVertical: 20,
  },
  cardWrapper: {
    width: CARD_WIDTH_WITH_SPACING,
    alignItems: 'center',
  },
  cardWrapperFirst: {
    paddingLeft: 0,
  },
  cardWrapperLast: {
    paddingRight: 0,
  },
});
