import React from 'react';
import { View, StyleSheet } from 'react-native';

export default function GradientBackground({ children, variant = 'purple' }) {
  const getBackgroundColor = () => {
    switch (variant) {
      case 'purple':
        return '#9C27B0';
      case 'blue':
        return '#2196F3';
      case 'red':
        return '#F44336';
      case 'teal':
        return '#00897B';
      default:
        return '#9C27B0';
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: getBackgroundColor() }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

