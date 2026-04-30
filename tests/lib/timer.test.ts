import { describe, it, expect } from 'vitest';
import { createTimer, startRest, startSet, stopTimer, getElapsed } from '../../src/lib/timer';

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
