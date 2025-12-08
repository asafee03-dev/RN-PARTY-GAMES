import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * Timer component for React Native
 * Uses useEffect + setTimeout (no browser APIs)
 * 
 * @param {number} initialTime - Initial time in seconds
 * @param {function} onFinish - Callback when timer reaches 0
 * @param {boolean} paused - Whether timer is paused
 * @param {function} onTick - Optional callback on each tick (receives timeLeft)
 * @param {Object} style - Optional custom styles
 */
export default function Timer({ 
  initialTime, 
  onFinish, 
  paused = false,
  onTick,
  style 
}) {
  const [timeLeft, setTimeLeft] = useState(initialTime);

  useEffect(() => {
    if (paused || timeLeft === 0) {
      if (timeLeft === 0) {
        onFinish?.();
      }
      return;
    }

    const id = setTimeout(() => {
      const newTime = timeLeft - 1;
      setTimeLeft(newTime);
      onTick?.(newTime);
    }, 1000);

    return () => clearTimeout(id);
  }, [timeLeft, paused, onFinish, onTick]);

  // Reset timer when initialTime changes
  useEffect(() => {
    setTimeLeft(initialTime);
  }, [initialTime]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getColor = () => {
    if (timeLeft <= 10) return '#F44336'; // Red
    if (timeLeft <= 30) return '#FF9800'; // Orange
    return '#4CAF50'; // Green
  };

  return (
    <View style={[styles.container, style]}>
      <Text style={[styles.timeText, { color: getColor() }]}>
        {formatTime(timeLeft)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeText: {
    fontSize: 32,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
});

