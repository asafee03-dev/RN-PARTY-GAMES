import React from 'react';
import { View, StyleSheet } from 'react-native';

export default function GradientBackground({ children, variant = 'purple' }) {
  const getBackgroundColor = () => {
    switch (variant) {
      case 'purple':
        return '#9C27B0'; // Draw - צייר משהו
      case 'blue':
        return '#2196F3';
      case 'brightBlue':
        return '#1E90FF'; // Alias - אליאס (כחול בהיר)
      case 'beige':
        return '#F5F5DC'; // Codenames - שם קוד (בז')
      case 'cream':
        return '#FAF0E6'; // Codenames alternative
      case 'red':
        return '#F44336'; // Frequency - התדר (אדום)
      case 'teal':
        return '#00897B';
      case 'green':
        return '#10B981'; // Spy - המרגל (ירוק)
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

