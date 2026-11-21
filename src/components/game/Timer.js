import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { S } from '../../strings';
import { TimerDisplay } from '../../ui';
import { secondsLeft, startSecondTicker } from '../../utils/serverClock';

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

  useEffect(() => {
    if (!startTime) {
      setDisplayTime(duration);
      hasCalledTimeUpRef.current = false;
      return;
    }

    hasCalledTimeUpRef.current = false;

    let stop = () => {};
    const updateTimer = () => {
      const remaining = secondsLeft(startTime, duration);
      setDisplayTime(remaining);

      if (remaining === 0 && !hasCalledTimeUpRef.current) {
        hasCalledTimeUpRef.current = true;
        if (onTimeUp) {
          onTimeUp();
        }
        stop();
      }
    };

    // Ticks on the server clock's second boundaries, so every phone shows the
    // same number at the same moment
    stop = startSecondTicker(startTime, updateTimer);
    return () => stop();
  }, [startTime, duration, onTimeUp]);

  // Display only
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
