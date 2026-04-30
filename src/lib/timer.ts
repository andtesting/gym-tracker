export type TimerMode = 'idle' | 'rest' | 'set';

export interface TimerState {
  mode: TimerMode;
  startTime: number | null;
}

export function createTimer(): TimerState {
  return { mode: 'idle', startTime: null };
}

export function startRest(now: number): TimerState {
  return { mode: 'rest', startTime: now };
}

export function startSet(now: number): TimerState {
  return { mode: 'set', startTime: now };
}

export function stopTimer(state: TimerState, now: number): { elapsed: number; state: TimerState } {
  const elapsed = state.startTime !== null ? Math.round((now - state.startTime) / 1000) : 0;
  return { elapsed, state: createTimer() };
}

export function getElapsed(state: TimerState, now: number): number {
  if (state.startTime === null) return 0;
  return Math.round((now - state.startTime) / 1000);
}
