import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * Timer component for Alias game
 * Uses startTime from Firestore to calculate remaining time
 * Matches the old version's timer behavior
 */
export default function AliasTimer({ 
  duration = 60, 
  startTime, 
  onTimeUp,
  compact = false
}) {
  const [timeLeft, setTimeLeft] = useState(duration);

  useEffect(() => {
    if (!startTime) {
      setTimeLeft(duration);
      return;
    }

    const updateTimer = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.max(0, duration - elapsed);
      
      setTimeLeft(remaining);
      
      if (remaining === 0) {
        onTimeUp?.();
      }
    };

    // Update immediately
    updateTimer();

    // Update every second
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [startTime, duration, onTimeUp]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getColor = () => {
    if (timeLeft <= 10) return '#EF4444'; // Red
    if (timeLeft <= 30) return '#F59E0B'; // Orange
    return '#10B981'; // Green
  };

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <Text style={[styles.compactTime, { color: getColor() }]}>
          {formatTime(timeLeft)}
        </Text>
      </View>
    );
  }

  const progress = duration > 0 ? (timeLeft / duration) : 0;

  return (
    <View style={styles.container}>
      {/* Progress Bar */}
      <View style={styles.progressBarContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: getColor() }]} />
        </View>
      </View>
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
    padding: 20,
  },
  progressBarContainer: {
    width: '100%',
    marginBottom: 12,
  },
  progressBar: {
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  timeText: {
    fontSize: 48,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  compactContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactTime: {
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
});

