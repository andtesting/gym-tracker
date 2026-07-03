import { describe, it, expect } from 'vitest';
import { buildPlan } from '../../src/lib/plan';
import type { Exercise, RoutineExerciseWithExercise, SetWithExercise } from '../../src/types';

function makeExercise(id: string): Exercise {
  return { id, name: `Exercise ${id}`, muscle_group_id: null, muscle_groups: null, created_at: '2026-01-01T00:00:00Z' };
}

function makeSet(exerciseId: string, order: number): SetWithExercise {
  return {
    id: `set-${exerciseId}-${order}`,
    session_id: 's1',
    exercise_id: exerciseId,
    set_order: order,
    set_type: 'working',
    reps: 8,
    weight_kg: 50,
    set_duration_seconds: null,
    rest_seconds: null,
    rpe: null,
    notes: null,
    group_id: null,
    started_at: null,
    completed_at: null,
    created_at: '2026-07-01T00:00:00Z',
    exercises: makeExercise(exerciseId),
  };
}

function makeTemplate(exerciseId: string, sortOrder: number, restSeconds: number | null = null): RoutineExerciseWithExercise {
  return {
    id: `re-${exerciseId}`,
    routine_id: 'r1',
    exercise_id: exerciseId,
    sort_order: sortOrder,
    target_sets: null,
    target_reps: null,
    target_weight_kg: null,
    target_rest_seconds: restSeconds,
    created_at: '2026-01-01T00:00:00Z',
    exercises: makeExercise(exerciseId),
  };
}

describe('buildPlan', () => {
  it('orders current-session exercises first, then template, then last-session leftovers', () => {
    const plan = buildPlan(
      [makeSet('c', 1)],
      [makeTemplate('t1', 1), makeTemplate('t2', 2)],
      [makeSet('old', 1)],
    );
    expect(plan.map(p => p.exercise.id)).toEqual(['c', 't1', 't2', 'old']);
  });

  it('deduplicates across sources, first source wins the position', () => {
    const plan = buildPlan(
      [makeSet('a', 1)],
      [makeTemplate('b', 1), makeTemplate('a', 2)],
      [makeSet('b', 1), makeSet('c', 2)],
    );
    expect(plan.map(p => p.exercise.id)).toEqual(['a', 'b', 'c']);
  });

  it('attaches template rows to exercises that arrived via sets, not just template entries', () => {
    const plan = buildPlan(
      [makeSet('a', 1)],
      [makeTemplate('a', 1, 90)],
      [],
    );
    expect(plan[0].template?.target_rest_seconds).toBe(90);
  });

  it('leaves template null for exercises the template does not cover', () => {
    const plan = buildPlan([makeSet('a', 1)], [], [makeSet('b', 1)]);
    expect(plan[0].template).toBeNull();
    expect(plan[1].template).toBeNull();
  });

  it('skips template rows whose exercise was deleted', () => {
    const orphan = { ...makeTemplate('gone', 1), exercises: null };
    const plan = buildPlan([], [orphan], []);
    expect(plan).toEqual([]);
  });

  it('empty everything gives an empty plan', () => {
    expect(buildPlan([], [], [])).toEqual([]);
  });

  it('orders template entries by sort_order even when the input array is unsorted', () => {
    const plan = buildPlan([], [makeTemplate('b', 2), makeTemplate('a', 1)], []);
    expect(plan.map(p => p.exercise.id)).toEqual(['a', 'b']);
  });
});
