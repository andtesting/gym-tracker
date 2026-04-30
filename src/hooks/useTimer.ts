import { useState, useRef, useCallback, useEffect } from 'react';
import { createTimer, startRest as pureStartRest, startSet as pureStartSet, stopTimer, getElapsed } from '../lib/timer';
import type { TimerState } from '../lib/timer';

export function useTimer() {
  const [timerState, setTimerState] = useState<TimerState>(createTimer);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<number | null>(null);

  const clearTick = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startTick = useCallback((state: TimerState) => {
    clearTick();
    setTimerState(state);
    setElapsed(0);
    intervalRef.current = window.setInterval(() => {
      setElapsed(getElapsed(state, Date.now()));
    }, 1000);
  }, [clearTick]);

  const startRest = useCallback((): number => {
    const now = Date.now();
    const { elapsed: setDuration } = stopTimer(timerState, now);
    const next = pureStartRest(now);
    startTick(next);
    return setDuration;
  }, [timerState, startTick]);

  const startSet = useCallback((): number => {
    const now = Date.now();
    const { elapsed: restDuration } = stopTimer(timerState, now);
    const next = pureStartSet(now);
    startTick(next);
    return restDuration;
  }, [timerState, startTick]);

  const stop = useCallback((): number => {
    const now = Date.now();
    const { elapsed: duration } = stopTimer(timerState, now);
    clearTick();
    setTimerState(createTimer());
    setElapsed(0);
    return duration;
  }, [timerState, clearTick]);

  useEffect(() => clearTick, [clearTick]);

  return { mode: timerState.mode, elapsed, startRest, startSet, stop };
}
