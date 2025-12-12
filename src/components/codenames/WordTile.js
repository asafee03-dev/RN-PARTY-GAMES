import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

export default function WordTile({ 
  word, 
  color, 
  isRevealed, 
  isSpymaster = false,
  onPress 
}) {
  // Determine tile appearance
  const getTileStyle = () => {
    if (isSpymaster && !isRevealed) {
      // Spymaster sees actual colors
      return {
        backgroundColor: color === 'blue' ? '#4A90E2' : 
                        color === 'red' ? '#E74C3C' : 
                        color === 'assassin' ? '#2C3E50' : '#F5D76E',
        borderColor: color === 'blue' ? '#2980B9' : 
                     color === 'red' ? '#C0392B' : 
                     color === 'assassin' ? '#1A252F' : '#E6B800',
      };
    } else if (isRevealed) {
      // Revealed tiles show their actual color
      return {
        backgroundColor: color === 'blue' ? '#4A90E2' : 
                        color === 'red' ? '#E74C3C' : 
                        color === 'assassin' ? '#2C3E50' : '#F5D76E',
        borderColor: color === 'blue' ? '#2980B9' : 
                     color === 'red' ? '#C0392B' : 
                     color === 'assassin' ? '#1A252F' : '#E6B800',
      };
    } else {
      // Unrevealed tiles for guessers are neutral
      return {
        backgroundColor: '#F5D76E',
        borderColor: '#E6B800',
      };
    }
  };

  const tileStyle = getTileStyle();

  return (
    <Pressable
      style={({ pressed }) => [
        styles.tile,
        tileStyle,
        pressed && styles.tilePressed
      ]}
      onPress={onPress}
      disabled={isRevealed}
    >
      <Text style={[
        styles.tileText,
        (color === 'assassin' || color === 'blue') && styles.lightText
      ]}>
        {word}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
    position: 'relative',
  },
  tilePressed: {
    opacity: 0.8,
    transform: [{ scale: 0.95 }],
  },
  tileText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2C3E50',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  lightText: {
    color: '#FFFFFF',
  },
});

