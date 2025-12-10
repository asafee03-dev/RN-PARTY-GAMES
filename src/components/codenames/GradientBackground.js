import React from 'react';
import { View, StyleSheet } from 'react-native';

export default function GradientBackground({ children, variant = 'purple' }) {
  // All screens now use white background
  return (
    <View style={[styles.container, { backgroundColor: '#FFFFFF' }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

