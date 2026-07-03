import { describe, it, expect } from 'vitest';
import { maxHistoricalWeight, isWeightPr, summariseWorkout } from '../../src/lib/summary';
import type { WorkoutSet, ExerciseHistoryEntry } from '../../src/types';

function makeSet(reps: number, weight: number, order = 1): WorkoutSet {
  return {
    id: `set-${order}-${weight}`,
    session_id: 's1',
    exercise_id: 'e1',
    set_order: order,
    set_type: 'working',
    reps,
    weight_kg: weight,
    set_duration_seconds: null,
    rest_seconds: null,
    rpe: null,
    notes: null,
    started_at: null,
    completed_at: null,
    created_at: '2026-07-03T00:00:00Z',
  };
}

function makeHistory(...weights: number[]): ExerciseHistoryEntry {
  return {
    session: {
      id: 'h1',
      routine_id: 'r1',
      started_at: '2026-06-01T00:00:00Z',
      finished_at: '2026-06-01T01:00:00Z',
      notes: null,
      routines: null,
    },
    sets: weights.map((w, i) => makeSet(8, w, i + 1)),
  };
}

describe('maxHistoricalWeight', () => {
  it('returns 0 with no history', () => {
    expect(maxHistoricalWeight([])).toBe(0);
  });

  it('finds the heaviest set across entries', () => {
    expect(maxHistoricalWeight([makeHistory(60, 80), makeHistory(70)])).toBe(80);
  });
});

describe('isWeightPr', () => {
  const history = [makeHistory(60, 80)];

  it('is a PR only when strictly heavier than all history', () => {
    expect(isWeightPr(makeSet(5, 82.5), history)).toBe(true);
    expect(isWeightPr(makeSet(5, 80), history)).toBe(false);
    expect(isWeightPr(makeSet(5, 60), history)).toBe(false);
  });

  it('never badges a history-less exercise', () => {
    expect(isWeightPr(makeSet(5, 100), [])).toBe(false);
  });
});

describe('summariseWorkout', () => {
  it('aggregates sets, tonnage, top sets and PRs', () => {
    const summary = summariseWorkout([
      {
        exercise: { name: 'Bench Press' },
        sets: [makeSet(8, 60, 1), makeSet(6, 82.5, 2)],
        histories: [makeHistory(60, 80)],
      },
      {
        exercise: { name: 'Incline DB Press' },
        sets: [makeSet(10, 30, 3)],
        histories: [makeHistory(32.5)],
      },
      {
        exercise: { name: 'Planned but skipped' },
        sets: [],
        histories: [],
      },
    ]);

    expect(summary.totalSets).toBe(3);
    expect(summary.tonnageKg).toBe(Math.round(8 * 60 + 6 * 82.5 + 10 * 30));
    expect(summary.prCount).toBe(1);
    expect(summary.exercises).toHaveLength(2); // skipped exercise excluded
    expect(summary.exercises[0]).toMatchObject({
      name: 'Bench Press',
      sets: 2,
      topWeightKg: 82.5,
      topWeightReps: 6,
      isPr: true,
    });
    expect(summary.exercises[1].isPr).toBe(false);
  });
});
