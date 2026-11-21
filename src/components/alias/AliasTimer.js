import React, { useState, useEffect } from 'react';
import { S } from '../../strings';
import { TimerDisplay } from '../../ui';
import { serverNow } from '../../utils/serverClock';

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
      const elapsed = Math.floor((serverNow() - startTime) / 1000);
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
