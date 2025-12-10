import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

export default function GradientButton({ 
  title, 
  onPress, 
  variant = 'primary',
  disabled = false,
  style 
}) {
  const getButtonStyle = () => {
    switch (variant) {
      // Game theme colors
      case 'alias':
        return styles.aliasButton; // כחול בהיר (#4FA8FF)
      case 'codenames':
        return styles.codenamesButton; // חום בהיר (#D9C3A5)
      case 'spy':
        return styles.spyButton; // ירוק בהיר (#7ED957)
      case 'frequency':
        return styles.frequencyButton; // כחול כהה (#0A1A3A)
      case 'draw':
        return styles.drawButton; // סגול בהיר (#C48CFF)
      // Legacy variants (mapped to new colors)
      case 'green':
        return styles.spyButton; // Map to Spy theme
      case 'blue':
        return styles.aliasButton; // Map to Alias theme
      case 'brightBlue':
        return styles.aliasButton; // Alias - כחול בהיר
      case 'beige':
        return styles.codenamesButton; // Codenames - בז'
      case 'red':
        return styles.frequencyButton; // Map to Frequency theme
      case 'orange':
        return styles.orangeButton;
      case 'pink':
        return styles.drawButton; // Map to Draw theme
      default:
        return styles.drawButton; // Default to Draw theme
    }
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        getButtonStyle(),
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
        style
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[
        styles.buttonText,
        // All theme colors use white text except codenames (light brown) which uses dark text
        variant === 'codenames' || variant === 'beige' ? styles.darkText : styles.lightText
      ]}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 27,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
    minWidth: 200,
  },
  // Game theme colors
  aliasButton: {
    backgroundColor: '#4FA8FF', // כחול בהיר
    shadowColor: '#4FA8FF',
  },
  codenamesButton: {
    backgroundColor: '#D9C3A5', // חום בהיר
    shadowColor: '#D9C3A5',
  },
  spyButton: {
    backgroundColor: '#7ED957', // ירוק בהיר
    shadowColor: '#7ED957',
  },
  frequencyButton: {
    backgroundColor: '#0A1A3A', // כחול כהה
    shadowColor: '#0A1A3A',
  },
  drawButton: {
    backgroundColor: '#C48CFF', // סגול בהיר
    shadowColor: '#C48CFF',
  },
  // Legacy variants (kept for backward compatibility)
  primaryButton: {
    backgroundColor: '#C48CFF', // Draw theme
    shadowColor: '#C48CFF',
  },
  greenButton: {
    backgroundColor: '#7ED957', // Spy theme
    shadowColor: '#7ED957',
  },
  blueButton: {
    backgroundColor: '#4FA8FF', // Alias theme
    shadowColor: '#4FA8FF',
  },
  redButton: {
    backgroundColor: '#0A1A3A', // Frequency theme
    shadowColor: '#0A1A3A',
  },
  orangeButton: {
    backgroundColor: '#FF6B35',
    shadowColor: '#FF6B35',
  },
  pinkButton: {
    backgroundColor: '#C48CFF', // Draw theme
    shadowColor: '#C48CFF',
  },
  brightBlueButton: {
    backgroundColor: '#4FA8FF', // Alias theme
    shadowColor: '#4FA8FF',
  },
  beigeButton: {
    backgroundColor: '#D9C3A5', // Codenames theme
    shadowColor: '#D9C3A5',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  lightText: {
    color: '#FFFFFF',
  },
  darkText: {
    color: '#2C3E50',
  },
});

