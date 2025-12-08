import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';

const COLORS = [
  '#000000', // Black
  '#FFFFFF', // White
  '#EF4444', // Red
  '#F59E0B', // Orange
  '#FCD34D', // Yellow
  '#10B981', // Green
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#6B7280', // Gray
];

export default function ColorPicker({ selectedColor, onColorChange }) {
  return (
    <View style={styles.container}>
      <View style={styles.colorGrid}>
        {COLORS.map((color) => (
          <Pressable
            key={color}
            onPress={() => onColorChange(color)}
            style={[
              styles.colorButton,
              { backgroundColor: color },
              color === '#FFFFFF' && styles.whiteButton,
              selectedColor === color && styles.selectedButton
            ]}
          >
            {selectedColor === color && (
              <View style={styles.checkmark}>
                <View style={styles.checkmarkInner} />
              </View>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  colorButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  whiteButton: {
    borderWidth: 2,
    borderColor: '#D1D5DB',
  },
  selectedButton: {
    borderWidth: 3,
    borderColor: '#7C3AED',
    transform: [{ scale: 1.1 }],
  },
  checkmark: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmarkInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
});

