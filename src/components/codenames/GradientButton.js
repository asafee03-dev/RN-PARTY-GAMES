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
      case 'green':
        return styles.greenButton;
      case 'blue':
        return styles.blueButton;
      case 'red':
        return styles.redButton;
      case 'orange':
        return styles.orangeButton;
      case 'pink':
        return styles.pinkButton;
      default:
        return styles.primaryButton;
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
        variant === 'green' && styles.lightText
      ]}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 25,
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
  primaryButton: {
    backgroundColor: '#9C27B0',
    shadowColor: '#9C27B0',
  },
  greenButton: {
    backgroundColor: '#4CAF50',
    shadowColor: '#4CAF50',
  },
  blueButton: {
    backgroundColor: '#2196F3',
    shadowColor: '#2196F3',
  },
  redButton: {
    backgroundColor: '#F44336',
    shadowColor: '#F44336',
  },
  orangeButton: {
    backgroundColor: '#FF6B35',
    shadowColor: '#FF6B35',
  },
  pinkButton: {
    backgroundColor: '#FF69B4',
    shadowColor: '#FF69B4',
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
});

