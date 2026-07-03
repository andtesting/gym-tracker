import { describe, it, expect } from 'vitest';
import { createTimer, startRest, startSet, stopTimer, getElapsed, formatRest, restCountdown } from '../../src/lib/timer';

describe('restCountdown', () => {
  it('counts down while under target', () => {
    expect(restCountdown(0, 90)).toEqual({ text: '1:30 left', over: false });
    expect(restCountdown(45, 90)).toEqual({ text: '0:45 left', over: false });
  });

  it('reads 0:00 left at exactly the target', () => {
    expect(restCountdown(90, 90)).toEqual({ text: '0:00 left', over: false });
  });

  it('counts the overshoot instead of clamping', () => {
    expect(restCountdown(105, 90)).toEqual({ text: '0:15 over', over: true });
    expect(restCountdown(210, 90)).toEqual({ text: '2:00 over', over: true });
  });
});

describe('timer', () => {
  it('starts in idle mode with no elapsed time', () => {
    const timer = createTimer();
    expect(timer.mode).toBe('idle');
    expect(getElapsed(timer, Date.now())).toBe(0);
  });

  it('transitions to rest mode', () => {
    const now = 1000000;
    const timer = startRest(now);
    expect(timer.mode).toBe('rest');
    expect(timer.startTime).toBe(now);
  });

  it('transitions to set mode', () => {
    const now = 1000000;
    const timer = startSet(now);
    expect(timer.mode).toBe('set');
    expect(timer.startTime).toBe(now);
  });

  it('calculates elapsed seconds', () => {
    const start = 1000000;
    const timer = startRest(start);
    const now = start + 90000; // 90 seconds later
    expect(getElapsed(timer, now)).toBe(90);
  });

  it('rounds elapsed to nearest second', () => {
    const start = 1000000;
    const timer = startRest(start);
    const now = start + 45600; // 45.6 seconds
    expect(getElapsed(timer, now)).toBe(46);
  });

  it('returns elapsed and resets on stop', () => {
    const start = 1000000;
    const timer = startRest(start);
    const now = start + 60000; // 60 seconds
    const result = stopTimer(timer, now);
    expect(result.elapsed).toBe(60);
    expect(result.state.mode).toBe('idle');
    expect(result.state.startTime).toBeNull();
  });

  it('returns 0 elapsed when stopping idle timer', () => {
    const timer = createTimer();
    const result = stopTimer(timer, Date.now());
    expect(result.elapsed).toBe(0);
  });

  it('getElapsed returns 0 for idle timer', () => {
    const timer = createTimer();
    expect(getElapsed(timer, Date.now())).toBe(0);
  });
});

describe('formatRest', () => {
  it('returns empty string for null, undefined, or zero', () => {
    expect(formatRest(null)).toBe('');
    expect(formatRest(undefined)).toBe('');
    expect(formatRest(0)).toBe('');
    expect(formatRest(-5)).toBe('');
  });

  it('formats sub-minute rests with zero-padded seconds', () => {
    expect(formatRest(5)).toBe('0:05');
    expect(formatRest(45)).toBe('0:45');
  });

  it('formats minute-plus rests as m:ss', () => {
    expect(formatRest(60)).toBe('1:00');
    expect(formatRest(84)).toBe('1:24');
    expect(formatRest(90)).toBe('1:30');
    expect(formatRest(125)).toBe('2:05');
    expect(formatRest(605)).toBe('10:05');
  });
});
