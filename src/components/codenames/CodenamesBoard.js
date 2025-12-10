import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// Fixed size for 5x5 grid - same on all devices
const CARD_SIZE = 60; // Fixed card size in pixels
const GAP = 4; // Gap between cards
const GRID_SIZE = 5; // 5x5 grid
const GRID_WIDTH = GRID_SIZE * CARD_SIZE + (GRID_SIZE - 1) * GAP; // 5 * 60 + 4 * 4 = 300 + 16 = 316
const GRID_HEIGHT = GRID_SIZE * CARD_SIZE + (GRID_SIZE - 1) * GAP; // Same as width for square grid

export default function CodenamesBoard({ 
  words, 
  keyMap, 
  revealedIndices, 
  isSpymaster, 
  onWordClick,
  canGuess,
  currentTeam
}) {
  const getCardColor = (index) => {
    const color = keyMap[index];
    const isRevealed = revealedIndices.includes(index);

    // If word is revealed - show with thick border and shadow
    if (isRevealed) {
      if (color === 'red') return { bg: '#EF4444', text: '#FFFFFF', border: '#B91C1C' };
      if (color === 'blue') return { bg: '#3B82F6', text: '#FFFFFF', border: '#1E40AF' };
      if (color === 'neutral') return { bg: '#9CA3AF', text: '#FFFFFF', border: '#6B7280' };
      if (color === 'black') return { bg: '#000000', text: '#FFFFFF', border: '#DC2626' };
    }

    // If word is not revealed and you're spymaster - show color lightly
    if (isSpymaster && !isRevealed) {
      if (color === 'red') return { bg: '#FEE2E2', text: '#991B1B', border: '#EF4444' };
      if (color === 'blue') return { bg: '#DBEAFE', text: '#1E40AF', border: '#3B82F6' };
      if (color === 'neutral') return { bg: '#F3F4F6', text: '#374151', border: '#D1D5DB' };
      if (color === 'black') return { bg: '#374151', text: '#FFFFFF', border: '#1F2937' };
    }

    // If you're a guesser and word is not revealed - show neutral color
    return { bg: '#FEF3C7', text: '#92400E', border: '#FCD34D' };
  };

  const getCardIcon = (index) => {
    const color = keyMap[index];
    const isRevealed = revealedIndices.includes(index);

    // Icons only for spymaster or revealed black words
    if (isRevealed) {
      if (color === 'black') return '💀';
      return null;
    } else if (isSpymaster) {
      if (color === 'black') return '💀';
      if (color === 'red' || color === 'blue') return '👁️';
    }
    
    return null;
  };

  const isClickable = (index) => {
    return canGuess && !revealedIndices.includes(index) && !isSpymaster;
  };

  // Calculate row and column for each card (0-24 index in 5x5 grid)
  const getCardPosition = (index) => {
    const row = Math.floor(index / GRID_SIZE);
    const col = index % GRID_SIZE;
    return { row, col };
  };

  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        {words.map((word, index) => {
          const isRevealed = revealedIndices.includes(index);
          const colors = getCardColor(index);
          const icon = getCardIcon(index);
          const clickable = isClickable(index);
          const { row, col } = getCardPosition(index);
          
          // Calculate absolute position
          const left = col * (CARD_SIZE + GAP);
          const top = row * (CARD_SIZE + GAP);
          
          return (
            <TouchableOpacity
              key={index}
              style={[
                styles.card,
                {
                  backgroundColor: colors.bg,
                  borderColor: colors.border,
                  borderWidth: isRevealed ? 4 : 2,
                  position: 'absolute',
                  left: left,
                  top: top,
                },
                clickable && styles.clickableCard,
              ]}
              onPress={() => clickable && onWordClick(index)}
              disabled={!clickable}
              activeOpacity={clickable ? 0.7 : 1}
            >
              {/* Icon for spymaster or revealed black word */}
              {icon && (
                <View style={styles.iconContainer}>
                  <Text style={styles.icon}>{icon}</Text>
                </View>
              )}

              {/* Word text */}
              <View style={styles.wordContainer}>
                <Text style={[styles.wordText, { color: colors.text }]} numberOfLines={2}>
                  {word}
                </Text>
              </View>

              {/* Revealed effect - blinking border */}
              {isRevealed && (
                <View style={[styles.revealedBorder, { borderColor: '#FFFFFF' }]} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 8,
    alignItems: 'center',
  },
  grid: {
    width: GRID_WIDTH,
    height: GRID_HEIGHT,
    position: 'relative',
  },
  card: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  clickableCard: {
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  iconContainer: {
    position: 'absolute',
    top: 4,
    right: 4,
    zIndex: 10,
  },
  icon: {
    fontSize: 16,
  },
  wordContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 4,
  },
  wordText: {
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 14,
  },
  revealedBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 8,
    borderWidth: 4,
    opacity: 0.5,
  },
});

