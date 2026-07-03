import { describe, it, expect } from 'vitest';
import { weekStartKey, weeklyStreak, compareWeeks, nextUpRoutine } from '../../src/lib/stats';

describe('weekStartKey', () => {
  it('maps any local date to its Monday', () => {
    expect(weekStartKey('2026-07-03')).toBe('2026-06-29'); // Friday -> Monday
    expect(weekStartKey('2026-06-29')).toBe('2026-06-29'); // Monday stays
    expect(weekStartKey('2026-07-05')).toBe('2026-06-29'); // Sunday belongs to prior Monday
  });
});

describe('weeklyStreak', () => {
  const today = '2026-07-03';

  it('is 0 with no sessions', () => {
    expect(weeklyStreak([], today)).toBe(0);
  });

  it('counts consecutive weeks back from the current week', () => {
    expect(weeklyStreak(['2026-07-01', '2026-06-24', '2026-06-17'], today)).toBe(3);
  });

  it('does not break on an empty current week (it is not over yet)', () => {
    expect(weeklyStreak(['2026-06-24', '2026-06-17'], today)).toBe(2);
  });

  it('stops at a gap week', () => {
    expect(weeklyStreak(['2026-07-01', '2026-06-10'], today)).toBe(1);
  });
});

describe('compareWeeks', () => {
  it('buckets sets into this week and last week only', () => {
    const rows = [
      { reps: 8, weight_kg: 60, dateKey: '2026-07-01' }, // this week
      { reps: 5, weight_kg: 100, dateKey: '2026-07-02' }, // this week
      { reps: 10, weight_kg: 40, dateKey: '2026-06-25' }, // last week
      { reps: 10, weight_kg: 40, dateKey: '2026-06-10' }, // older: ignored
    ];
    const cmp = compareWeeks(rows, '2026-07-03');
    expect(cmp.thisWeek).toEqual({ sets: 2, tonnageKg: 980 });
    expect(cmp.lastWeek).toEqual({ sets: 1, tonnageKg: 400 });
  });
});

describe('nextUpRoutine', () => {
  const routines = [
    { id: 'a', name: 'push A' },
    { id: 'b', name: 'pull A' },
    { id: 'c', name: 'legs A' },
  ];

  it('suggests the least recently trained routine', () => {
    const sessions = [
      { routine_id: 'a', started_at: '2026-07-01T00:00:00Z' },
      { routine_id: 'b', started_at: '2026-06-20T00:00:00Z' },
      { routine_id: 'c', started_at: '2026-06-28T00:00:00Z' },
    ];
    expect(nextUpRoutine(routines, sessions)?.name).toBe('pull A');
  });

  it('prefers a never-trained routine', () => {
    const sessions = [
      { routine_id: 'a', started_at: '2026-07-01T00:00:00Z' },
      { routine_id: 'c', started_at: '2026-06-28T00:00:00Z' },
    ];
    expect(nextUpRoutine(routines, sessions)?.name).toBe('pull A');
  });

  it('returns null with fewer than two routines', () => {
    expect(nextUpRoutine([{ id: 'a', name: 'only' }], [])).toBeNull();
  });
});
