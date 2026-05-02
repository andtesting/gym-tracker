import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveActiveWorkout,
  loadActiveWorkout,
  clearActiveWorkout,
} from '../../src/lib/sessionPersistence';
import type { PersistedWorkout } from '../../src/lib/sessionPersistence';

vi.mock('../../src/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
  },
}));

const workout: PersistedWorkout = {
  sessionId: 'sess-123',
  routineId: 'routine-456',
  routineName: 'Push Day',
};

describe('sessionPersistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when nothing is persisted', () => {
    expect(loadActiveWorkout()).toBeNull();
  });

  it('saves and loads a workout', () => {
    saveActiveWorkout(workout);
    expect(loadActiveWorkout()).toEqual(workout);
  });

  it('clears a persisted workout', () => {
    saveActiveWorkout(workout);
    clearActiveWorkout();
    expect(loadActiveWorkout()).toBeNull();
  });

  it('returns null for corrupted JSON', () => {
    localStorage.setItem('gym-tracker-active-workout', '{invalid json');
    expect(loadActiveWorkout()).toBeNull();
  });

  it('returns null for JSON missing required fields', () => {
    localStorage.setItem('gym-tracker-active-workout', JSON.stringify({ sessionId: 'abc' }));
    expect(loadActiveWorkout()).toBeNull();
  });

  it('overwrites previous workout on save', () => {
    saveActiveWorkout(workout);
    const updated = { ...workout, routineName: 'Pull Day' };
    saveActiveWorkout(updated);
    expect(loadActiveWorkout()).toEqual(updated);
  });
});
