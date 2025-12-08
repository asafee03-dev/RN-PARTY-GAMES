import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * Timer component that uses startTime and duration
 * Matches Vite Timer.jsx API
 * 
 * @param {number} duration - Total duration in seconds
 * @param {number} startTime - Timestamp when timer started (Date.now())
 * @param {function} onTimeUp - Callback when timer reaches 0
 * @param {boolean} compact - Whether to show compact display
 */
export default function Timer({ duration, startTime, onTimeUp, compact = false }) {
  const [displayTime, setDisplayTime] = useState(duration);
  const hasCalledTimeUpRef = useRef(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!startTime) {
      setDisplayTime(duration);
      hasCalledTimeUpRef.current = false;
      return;
    }

    hasCalledTimeUpRef.current = false;

    const updateTimer = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.max(0, duration - elapsed);
      setDisplayTime(remaining);

      if (remaining === 0 && !hasCalledTimeUpRef.current) {
        hasCalledTimeUpRef.current = true;
        if (onTimeUp) {
          onTimeUp();
        }
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    };

    updateTimer();
    intervalRef.current = setInterval(updateTimer, 100);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [startTime, duration, onTimeUp]);

  const isLowTime = displayTime <= 10;
  const progress = duration > 0 ? (displayTime / duration) * 100 : 0;

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <Text style={[styles.compactTime, isLowTime && styles.compactTimeUrgent]}>
          {displayTime}
        </Text>
        <View style={styles.compactProgressBar}>
          <View
            style={[
              styles.compactProgressFill,
              { width: `${progress}%` },
              isLowTime && styles.compactProgressFillUrgent
            ]}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, isLowTime && styles.containerUrgent]}>
      <View style={styles.content}>
        <Text style={[styles.timeText, isLowTime && styles.timeTextUrgent]}>
          {displayTime}
        </Text>
        <Text style={styles.secondsLabel}>שניות</Text>
      </View>
      <View style={styles.progressBar}>
        <View
          style={[
            styles.progressFill,
            { width: `${progress}%` },
            isLowTime && styles.progressFillUrgent
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  containerUrgent: {
    backgroundColor: '#FEE2E2',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  timeText: {
    fontSize: 48,
    fontWeight: '700',
    color: '#7C3AED',
  },
  timeTextUrgent: {
    color: '#DC2626',
  },
  secondsLabel: {
    fontSize: 18,
    color: '#6B7280',
  },
  progressBar: {
    width: '100%',
    height: 12,
    backgroundColor: '#E5E7EB',
    borderRadius: 6,
    marginTop: 16,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#7C3AED',
    borderRadius: 6,
  },
  progressFillUrgent: {
    backgroundColor: '#DC2626',
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compactTime: {
    fontSize: 18,
    fontWeight: '700',
    color: '#7C3AED',
    minWidth: 40,
    textAlign: 'center',
  },
  compactTimeUrgent: {
    color: '#DC2626',
  },
  compactProgressBar: {
    width: 96,
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  compactProgressFill: {
    height: '100%',
    backgroundColor: '#7C3AED',
    borderRadius: 4,
  },
  compactProgressFillUrgent: {
    backgroundColor: '#DC2626',
  },
});

