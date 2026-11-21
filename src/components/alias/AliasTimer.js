import React, { useState, useEffect } from 'react';
import { S } from '../../strings';
import { TimerDisplay } from '../../ui';
import { secondsLeft, startSecondTicker } from '../../utils/serverClock';

/**
 * Timer component for Alias
 * Uses startTime from Firestore to calculate remaining time (on the shared
 * server clock). Display-only restyle: the timing logic is unchanged.
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
      const remaining = secondsLeft(startTime, duration);

      setTimeLeft(remaining);

      if (remaining === 0) {
        onTimeUp?.();
      }
    };

    // Ticks on the server clock's second boundaries, so every phone shows the
    // same number at the same moment
    return startSecondTicker(startTime, updateTimer);
  }, [startTime, duration, onTimeUp]);

  return (
    <TimerDisplay
      remaining={timeLeft}
      total={duration}
      warnAt={10}
      compact={compact}
      label={S.common.timeLeft}
      warningLabel={S.common.hurry}
    />
  );
}
