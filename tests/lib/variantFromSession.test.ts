import { describe, it, expect } from 'vitest';
import { sessionDeviatesFromTemplate, buildVariantSeed } from '../../src/lib/variantFromSession';
import type { ActiveExercise } from '../../src/hooks/useWorkout';
import type { WorkoutSet, Exercise, RoutineExercise } from '../../src/types';

function ex(id: string): Exercise {
  return {
    id, name: id, muscle_group_id: null, muscle_groups: null,
    equipment: null, is_bodyweight: false, secondary_muscle_group_ids: [],
    created_at: '2026-01-01T00:00:00Z',
  };
}

function set(exerciseId: string, weight: number, reps: number): WorkoutSet {
  return {
    id: `${exerciseId}-${weight}`, session_id: 's', exercise_id: exerciseId,
    set_order: 1, set_type: 'working', reps, weight_kg: weight,
    set_duration_seconds: null, rest_seconds: null, rpe: null, notes: null,
    group_id: null, deleted_at: null, started_at: null, completed_at: null,
    created_at: '2026-01-01T00:00:00Z',
  };
}

function tmpl(exerciseId: string): RoutineExercise {
  return {
    id: `t-${exerciseId}`, routine_id: 'r', exercise_id: exerciseId, sort_order: 0,
    target_sets: null, target_reps: null, target_weight_kg: null,
    target_rest_seconds: null, created_at: '2026-01-01T00:00:00Z',
  };
}

function entry(id: string, opts: { sets?: WorkoutSet[]; inTemplate?: boolean } = {}): ActiveExercise {
  return {
    exercise: ex(id),
    sets: opts.sets ?? [],
    histories: [],
    template: opts.inTemplate ? tmpl(id) : null,
    groupId: null,
  };
}

describe('sessionDeviatesFromTemplate', () => {
  it('is false when the performed exercises match the template exactly', () => {
    const exercises = [
      entry('a', { sets: [set('a', 60, 8)], inTemplate: true }),
      entry('b', { sets: [set('b', 40, 10)], inTemplate: true }),
    ];
    expect(sessionDeviatesFromTemplate(exercises)).toBe(false);
  });

  it('is true when an exercise not in the template was performed (added)', () => {
    const exercises = [
      entry('a', { sets: [set('a', 60, 8)], inTemplate: true }),
      entry('c', { sets: [set('c', 30, 12)], inTemplate: false }),
    ];
    expect(sessionDeviatesFromTemplate(exercises)).toBe(true);
  });

  it('is true when a template exercise was swapped out (dropped)', () => {
    // a and b planned; only a done, plus substitute c.
    const exercises = [
      entry('a', { sets: [set('a', 60, 8)], inTemplate: true }),
      entry('b', { inTemplate: true }),
      entry('c', { sets: [set('c', 30, 12)], inTemplate: false }),
    ];
    expect(sessionDeviatesFromTemplate(exercises)).toBe(true);
  });

  it('is true when a planned exercise was skipped (done set is a subset)', () => {
    const exercises = [
      entry('a', { sets: [set('a', 60, 8)], inTemplate: true }),
      entry('b', { inTemplate: true }),
    ];
    expect(sessionDeviatesFromTemplate(exercises)).toBe(true);
  });

  it('is false for an empty session (nothing to save)', () => {
    expect(sessionDeviatesFromTemplate([entry('a', { inTemplate: true })])).toBe(false);
  });

  it('is false for a plan-less routine (no template to deviate from)', () => {
    const exercises = [
      entry('a', { sets: [set('a', 60, 8)] }),
      entry('b', { sets: [set('b', 40, 10)] }),
    ];
    expect(sessionDeviatesFromTemplate(exercises)).toBe(false);
  });
});

describe('buildVariantSeed', () => {
  it('includes only performed exercises, in plan order, with sort_order', () => {
    const seed = buildVariantSeed([
      entry('a', { sets: [set('a', 60, 8)], inTemplate: true }),
      entry('b', { inTemplate: true }),                 // planned, not done → excluded
      entry('c', { sets: [set('c', 30, 12)] }),
    ]);
    expect(seed.map(r => r.exercise_id)).toEqual(['a', 'c']);
    expect(seed.map(r => r.sort_order)).toEqual([0, 1]);
  });

  it('seeds targets from the heaviest set of each exercise', () => {
    const seed = buildVariantSeed([
      entry('a', { sets: [set('a', 60, 8), set('a', 72.5, 5), set('a', 65, 6)] }),
    ]);
    expect(seed[0].target_weight_kg).toBe(72.5);
    expect(seed[0].target_reps).toBe(5);
  });
});
