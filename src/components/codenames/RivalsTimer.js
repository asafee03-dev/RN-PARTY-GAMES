import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export default function RivalsTimer({ 
  startTime, 
  duration, 
  onTimeUp,
  phase 
}) {
  const [timeLeft, setTimeLeft] = useState(duration);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!startTime) {
      setTimeLeft(duration);
      return;
    }

    const updateTimer = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const remaining = Math.max(0, duration - elapsed);
      
      setTimeLeft(remaining);
      
      if (remaining <= 0) {
        if (onTimeUp) {
          onTimeUp();
        }
        return;
      }
    };

    updateTimer();
    intervalRef.current = setInterval(updateTimer, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [startTime, duration, onTimeUp]);

  const isLowTime = timeLeft <= 10;
  const percentage = (timeLeft / duration) * 100;

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <View style={[styles.container, isLowTime && styles.lowTimeContainer]}>
      <LinearGradient
        colors={isLowTime ? ['#FEE2E2', '#FECACA'] : ['#FEF3C7', '#FDE68A']}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={[styles.icon, isLowTime && styles.lowTimeIcon]}>
              {isLowTime ? '⚠️' : '⏰'}
            </Text>
            <Text style={[styles.label, isLowTime && styles.lowTimeLabel]}>
              {phase === 'clue' ? 'זמן למרגל' : 'זמן למנחשים'}
            </Text>
            <Text style={[styles.time, isLowTime && styles.lowTimeText]}>
              {formatTime(timeLeft)}
            </Text>
          </View>
          <View style={styles.progressBarContainer}>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill,
                  { width: `${percentage}%` },
                  isLowTime && styles.progressFillLow
                ]} 
              />
            </View>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  lowTimeContainer: {
    // Additional styling for low time if needed
  },
  gradient: {
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  content: {
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  icon: {
    fontSize: 20,
  },
  lowTimeIcon: {
    // Additional styling if needed
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
    flex: 1,
    marginLeft: 8,
  },
  lowTimeLabel: {
    color: '#991B1B',
  },
  time: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#F59E0B',
  },
  lowTimeText: {
    color: '#DC2626',
  },
  progressBarContainer: {
    marginTop: 4,
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#F59E0B',
    borderRadius: 4,
  },
  progressFillLow: {
    backgroundColor: '#DC2626',
  },
});

