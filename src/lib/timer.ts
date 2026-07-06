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

// The rest timer restarts at every Log Set, so it is always anchored to the
// most-recently logged set's completion. When a set is deleted mid-rest, that
// anchor can point at the just-deleted set — leaving the next set's rest
// measured from the delete instead of from real work. This returns the latest
// completion time (ms) among the REMAINING sets, so rest can re-anchor there;
// null when none carry a usable timestamp (e.g. the last set was removed).
export function latestCompletedMs(completedAts: (string | null | undefined)[]): number | null {
  let max: number | null = null;
  for (const c of completedAts) {
    if (!c) continue;
    const ms = new Date(c).getTime();
    if (Number.isNaN(ms)) continue;
    if (max === null || ms > max) max = ms;
  }
  return max;
}

// Formats a rest duration as m:ss for display next to a set. Returns an empty
// string for null/undefined/zero so the first set (and untimed sets) show blank.
export function formatRest(seconds: number | null | undefined): string {
  if (seconds == null || seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatMmSs(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Countdown target when the rest-countdown setting is on but the active
// exercise has no target_rest_seconds of its own.
export const DEFAULT_REST_TARGET_SECONDS = 120;

// In count-up mode, rest past this reads as "you forgot the timer" and the
// display goes large/bold/red.
export const REST_ALARM_SECONDS = 180;

// Rest countdown against a per-exercise target (AND-6). `over` flips the
// display style once the target is exhausted; text keeps counting so the
// overshoot is visible rather than clamped away.
export function restCountdown(
  elapsed: number,
  targetSeconds: number,
): { text: string; over: boolean } {
  const remaining = targetSeconds - elapsed;
  if (remaining >= 0) return { text: `${formatMmSs(remaining)} left`, over: false };
  return { text: `${formatMmSs(-remaining)} over`, over: true };
}
