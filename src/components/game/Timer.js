import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { S } from '../../strings';
import { TimerDisplay } from '../../ui';
import { serverNow } from '../../utils/serverClock';

/**
 * Timer component that uses startTime and duration
 * Matches Vite Timer.jsx API
 * 
 * @param {number} duration - Total duration in seconds
 * @param {number} startTime - Timestamp when timer started (serverNow() clock)
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
      const elapsed = Math.floor((serverNow() - startTime) / 1000);
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

  // Display only - the timing logic above is unchanged
  return (
    <TimerDisplay
      remaining={displayTime}
      total={duration}
      warnAt={10}
      compact={false}
      label={S.common.timeLeft}
      warningLabel={S.common.hurry}
      style={compact ? styles.compact : null}
    />
  );
}

const styles = StyleSheet.create({
  compact: {
    paddingVertical: 6,
  },
});
