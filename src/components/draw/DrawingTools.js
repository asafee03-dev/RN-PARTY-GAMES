import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

const BRUSH_SIZES = [3, 6, 9, 12, 15];

export default function DrawingTools({ toolType, onToolChange, brushSize, onBrushSizeChange }) {
  return (
    <View style={styles.container}>
      {/* Tool Selection */}
      <View style={styles.toolSection}>
        <Text style={styles.sectionTitle}>כלי:</Text>
        <View style={styles.toolButtons}>
          <Pressable
            onPress={() => onToolChange('pencil')}
            style={[
              styles.toolButton,
              toolType === 'pencil' && styles.toolButtonActive
            ]}
          >
            <Text style={[
              styles.toolButtonText,
              toolType === 'pencil' && styles.toolButtonTextActive
            ]}>
              ✏️ עיפרון
            </Text>
          </Pressable>
          <Pressable
            onPress={() => onToolChange('eraser')}
            style={[
              styles.toolButton,
              toolType === 'eraser' && styles.toolButtonActive
            ]}
          >
            <Text style={[
              styles.toolButtonText,
              toolType === 'eraser' && styles.toolButtonTextActive
            ]}>
              🧹 מחק
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Brush Size - Only show for pencil */}
      {toolType === 'pencil' && (
        <View style={styles.sizeSection}>
          <Text style={styles.sectionTitle}>גודל מברשת:</Text>
          <View style={styles.sizeButtons}>
            {BRUSH_SIZES.map((size) => (
              <Pressable
                key={size}
                onPress={() => onBrushSizeChange(size)}
                style={[
                  styles.sizeButton,
                  brushSize === size && styles.sizeButtonActive
                ]}
              >
                <View
                  style={[
                    styles.sizeIndicator,
                    { width: size, height: size, borderRadius: size / 2 },
                    brushSize === size && styles.sizeIndicatorActive
                  ]}
                />
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  toolSection: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  toolButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  toolButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
  },
  toolButtonActive: {
    borderColor: '#7C3AED',
    backgroundColor: '#F3E8FF',
  },
  toolButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  toolButtonTextActive: {
    color: '#7C3AED',
  },
  sizeSection: {
    gap: 8,
  },
  sizeButtons: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
  },
  sizeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sizeButtonActive: {
    borderColor: '#7C3AED',
    backgroundColor: '#F3E8FF',
  },
  sizeIndicator: {
    backgroundColor: '#6B7280',
  },
  sizeIndicatorActive: {
    backgroundColor: '#7C3AED',
  },
});

