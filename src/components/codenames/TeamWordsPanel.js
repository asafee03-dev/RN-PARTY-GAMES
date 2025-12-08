import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export default function TeamWordsPanel({ 
  words, 
  keyMap, 
  revealedIndices, 
  teamColor, 
  compact = false 
}) {
  const teamWords = [];
  
  keyMap.forEach((color, index) => {
    if (color === teamColor) {
      teamWords.push({
        word: words[index],
        index: index,
        revealed: revealedIndices.includes(index)
      });
    }
  });

  const revealedCount = teamWords.filter(w => w.revealed).length;
  const totalCount = teamWords.length;

  return (
    <View style={[styles.container, teamColor === 'red' ? styles.redContainer : styles.blueContainer]}>
      <LinearGradient
        colors={teamColor === 'red' ? ['#EF4444', '#DC2626'] : ['#3B82F6', '#2563EB']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <Text style={[styles.title, compact && styles.compactTitle]}>
          מילות הקבוצה
        </Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {revealedCount}/{totalCount}
          </Text>
        </View>
      </LinearGradient>
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={[styles.grid, compact && styles.compactGrid]}>
          {teamWords.map((item, idx) => (
            <View
              key={idx}
              style={[
                styles.wordItem,
                compact && styles.compactWordItem,
                item.revealed ? styles.revealedItem : styles.unrevealedItem
              ]}
            >
              <Text style={[
                styles.wordText,
                compact && styles.compactWordText,
                item.revealed && styles.revealedText
              ]}>
                {item.word}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 2,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  redContainer: {
    borderColor: '#EF4444',
    backgroundColor: '#FEE2E2',
  },
  blueContainer: {
    borderColor: '#3B82F6',
    backgroundColor: '#DBEAFE',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  compactHeader: {
    padding: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  compactTitle: {
    fontSize: 14,
  },
  badge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  content: {
    maxHeight: 200,
  },
  contentContainer: {
    padding: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  compactGrid: {
    gap: 4,
  },
  wordItem: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: '30%',
  },
  compactWordItem: {
    padding: 6,
    minWidth: '45%',
  },
  revealedItem: {
    backgroundColor: '#D1FAE5',
    borderColor: '#10B981',
  },
  unrevealedItem: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D1D5DB',
  },
  wordText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  compactWordText: {
    fontSize: 12,
  },
  revealedText: {
    textDecorationLine: 'line-through',
    color: '#6B7280',
  },
});

