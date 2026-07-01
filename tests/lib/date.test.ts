import { describe, it, expect } from 'vitest';
import { localDateKey } from '../../src/lib/date';

describe('localDateKey', () => {
  it('returns the LOCAL calendar date for a UTC timestamp', () => {
    // Build a Date at a known local wall-clock time. Its .toISOString() is UTC,
    // which in any timezone east of UTC (e.g. Sydney, UTC+10) falls on the
    // previous calendar day. localDateKey must report the local day so it lines
    // up with the locally-built heatmap grid (AND-38).
    const localMorning = new Date(2026, 6, 2, 6, 0, 0); // 2 Jul 2026, 06:00 local
    expect(localDateKey(localMorning.toISOString())).toBe('2026-07-02');
  });

  it('pads month and day to two digits', () => {
    const d = new Date(2026, 0, 5, 12, 0, 0); // 5 Jan 2026, 12:00 local
    expect(localDateKey(d.toISOString())).toBe('2026-01-05');
  });

  it('matches the local date components of the parsed timestamp', () => {
    const iso = '2026-07-01T20:00:00Z';
    const d = new Date(iso);
    const expected =
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(localDateKey(iso)).toBe(expected);
  });
});
