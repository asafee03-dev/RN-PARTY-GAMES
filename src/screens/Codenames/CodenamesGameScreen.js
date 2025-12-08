import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import GradientBackground from '../../components/codenames/GradientBackground';
import GradientButton from '../../components/codenames/GradientButton';
import TeamScoreCard from '../../components/codenames/TeamScoreCard';
import WordTile from '../../components/codenames/WordTile';

export default function CodenamesGameScreen({ navigation }) {
  // Mock data - will be replaced with real game state
  const [isSpymaster] = useState(false); // Toggle this to switch views
  const [currentTeam] = useState('blue'); // 'blue' or 'red'
  const [blueScore] = useState(7);
  const [redScore] = useState(8);
  const [revealedTiles] = useState(new Set([0, 5, 12])); // Indices of revealed tiles
  
  // Mock board - 5x5 grid of words
  const board = [
    ['ריריה', 'פבח', 'אוך', 'ריה', 'חוח'],
    ['תפופי', 'חוסה', 'מורסה', 'שיפוץ', 'רורויב'],
    ['חור', 'גונח', 'חמות', 'טיתן', 'מסוה'],
    ['תקיוח', 'גנח', 'מפר', 'פיופ', 'תופה'],
    ['רורויב', 'ריה', 'עוצר', 'טיפ', 'אוף']
  ];
  
  // Mock tile colors: 'blue', 'red', 'neutral', 'assassin'
  const tileColors = [
    'neutral', 'neutral', 'blue', 'red', 'neutral',
    'red', 'neutral', 'neutral', 'neutral', 'blue',
    'blue', 'neutral', 'blue', 'neutral', 'neutral',
    'neutral', 'blue', 'neutral', 'assassin', 'neutral',
    'red', 'blue', 'neutral', 'neutral', 'neutral'
  ];

  const handleTilePress = (index) => {
    // TODO: Implement tile reveal logic
    console.log('Tile pressed:', index);
  };

  const handleEndTurn = () => {
    // TODO: Implement end turn logic
    console.log('End turn');
  };

  return (
    <GradientBackground variant="purple">
      <ScrollView 
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Bar */}
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>←</Text>
          </Pressable>
          
          <View style={styles.headerCenter}>
            <View style={styles.roomCodeBadge}>
              <Text style={styles.roomCodeText}>ABC123</Text>
            </View>
            
            <View style={[
              styles.turnIndicator,
              currentTeam === 'blue' ? styles.blueTurn : styles.redTurn
            ]}>
              <Text style={styles.turnText}>
                תור {currentTeam === 'blue' ? 'כחול' : 'אדום'}
              </Text>
            </View>
          </View>
          
          <Pressable style={styles.modeButton}>
            <Text style={styles.modeButtonText}>🍺</Text>
          </Pressable>
        </View>

        {/* Score Cards */}
        <View style={styles.scoresContainer}>
          <TeamScoreCard 
            team="blue" 
            score={blueScore} 
            isActive={currentTeam === 'blue'}
          />
          <TeamScoreCard 
            team="red" 
            score={redScore} 
            isActive={currentTeam === 'red'}
          />
        </View>

        {/* Hint Area (only for guessers) */}
        {!isSpymaster && (
          <View style={styles.hintArea}>
            <View style={styles.hintNumber}>
              <Text style={styles.hintNumberText}>5</Text>
            </View>
            <Text style={styles.hintText}>אישרוון</Text>
            <View style={styles.hintIcons}>
              <Text style={styles.hintIcon}>👍</Text>
              <Text style={styles.hintIcon}>+</Text>
              <Text style={styles.hintIcon}>⚠️</Text>
            </View>
          </View>
        )}

        {/* Instruction Line */}
        <View style={styles.instructionBar}>
          <Text style={styles.instructionText}>
            {isSpymaster 
              ? 'בחר מילה וצבע להציע לצוות'
              : 'בחר מילה מהלוח'}
          </Text>
        </View>

        {/* Word Grid */}
        <View style={styles.gridContainer}>
          {board.flat().map((word, index) => {
            const color = tileColors[index];
            const isRevealed = revealedTiles.has(index);
            
            return (
              <View key={index} style={styles.tileWrapper}>
                <WordTile
                  word={word}
                  color={color}
                  isRevealed={isRevealed}
                  isSpymaster={isSpymaster}
                  onPress={() => handleTilePress(index)}
                />
              </View>
            );
          })}
        </View>

        {/* End Turn Button (only for guessers) */}
        {!isSpymaster && (
          <GradientButton
            title="סימיתי את התור"
            onPress={handleEndTurn}
            variant="green"
            style={styles.endTurnButton}
          />
        )}
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    marginTop: 40,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  roomCodeBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  roomCodeText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#9C27B0',
    letterSpacing: 2,
  },
  turnIndicator: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  blueTurn: {
    backgroundColor: '#2196F3',
  },
  redTurn: {
    backgroundColor: '#F44336',
  },
  turnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  modeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeButtonText: {
    fontSize: 20,
  },
  scoresContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
    gap: 16,
  },
  hintArea: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E3F2FD',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    gap: 12,
  },
  hintNumber: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#9C27B0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hintNumberText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  hintText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C3E50',
    flex: 1,
  },
  hintIcons: {
    flexDirection: 'row',
    gap: 8,
  },
  hintIcon: {
    fontSize: 20,
  },
  instructionBar: {
    backgroundColor: '#E3F2FD',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  instructionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C3E50',
    textAlign: 'center',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
    backgroundColor: '#E3F2FD',
    padding: 8,
    borderRadius: 16,
  },
  tileWrapper: {
    width: '18%',
    aspectRatio: 1,
    marginBottom: 8,
  },
  endTurnButton: {
    width: '100%',
    marginTop: 16,
  },
});
