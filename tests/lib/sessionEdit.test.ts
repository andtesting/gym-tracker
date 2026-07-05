import { describe, it, expect } from 'vitest';
import { seedEditedSets, editFieldsForSet, planSetInsertion } from '../../src/lib/sessionEdit';
import type { EditFields, SetOrderRow } from '../../src/lib/sessionEdit';
import type { Exercise, SetWithExercise } from '../../src/types';

function makeExercise(id: string): Exercise {
  return {
    id, name: `Ex ${id}`, muscle_group_id: null, muscle_groups: null,
    equipment: null, is_bodyweight: false, secondary_muscle_group_ids: [],
    created_at: '2026-01-01T00:00:00Z',
  };
}

function makeSet(id: string, exerciseId: string, order: number, over: Partial<SetWithExercise> = {}): SetWithExercise {
  return {
    id, session_id: 's1', exercise_id: exerciseId, set_order: order, set_type: 'working',
    reps: 10, weight_kg: 80, set_duration_seconds: null, rest_seconds: null,
    rpe: null, notes: null, group_id: null, deleted_at: null,
    started_at: null, completed_at: null, created_at: '2026-07-01T00:00:00Z',
    exercises: makeExercise(exerciseId), ...over,
  };
}

describe('editFieldsForSet', () => {
  it('stringifies values and blanks null rpe/notes', () => {
    expect(editFieldsForSet(makeSet('a', 'e1', 1, { reps: 8, weight_kg: 60, rpe: 8.5, notes: 'twinge' }), 'kg'))
      .toEqual({ reps: '8', weight_kg: '60', rpe: '8.5', notes: 'twinge' });
    expect(editFieldsForSet(makeSet('a', 'e1', 1), 'kg'))
      .toEqual({ reps: '10', weight_kg: '80', rpe: '', notes: '' });
  });
});

describe('seedEditedSets', () => {
  it('seeds a set that has no entry yet (the add-set crash root cause)', () => {
    const sets = [makeSet('a', 'e1', 1), makeSet('b', 'e1', 2, { reps: 8, weight_kg: 60 })];
    const next = seedEditedSets(sets, {}, 'kg');
    expect(next.a).toEqual({ reps: '10', weight_kg: '80', rpe: '', notes: '' });
    expect(next.b).toEqual({ reps: '8', weight_kg: '60', rpe: '', notes: '' });
  });

  it('preserves in-progress edits, only filling the missing entry', () => {
    const sets = [makeSet('a', 'e1', 1), makeSet('b', 'e1', 2)];
    const prev: Record<string, EditFields> = { a: { reps: '12', weight_kg: '85', rpe: '9', notes: 'edited' } };
    const next = seedEditedSets(sets, prev, 'kg');
    expect(next.a).toEqual({ reps: '12', weight_kg: '85', rpe: '9', notes: 'edited' });
    expect(next.b).toEqual({ reps: '10', weight_kg: '80', rpe: '', notes: '' });
  });

  it('drops entries for sets that no longer exist', () => {
    const sets = [makeSet('a', 'e1', 1)];
    const prev: Record<string, EditFields> = {
      a: { reps: '10', weight_kg: '80', rpe: '', notes: '' },
      gone: { reps: '5', weight_kg: '5', rpe: '', notes: '' },
    };
    const next = seedEditedSets(sets, prev, 'kg');
    expect(Object.keys(next)).toEqual(['a']);
  });

  it('returns the same reference when nothing changes (stable for React)', () => {
    const sets = [makeSet('a', 'e1', 1)];
    const prev: Record<string, EditFields> = { a: { reps: '10', weight_kg: '80', rpe: '', notes: '' } };
    expect(seedEditedSets(sets, prev, 'kg')).toBe(prev);
  });
});

describe('planSetInsertion', () => {
  const rows: SetOrderRow[] = [
    { id: 'a1', exercise_id: 'A', set_order: 1 },
    { id: 'a2', exercise_id: 'A', set_order: 2 },
    { id: 'b1', exercise_id: 'B', set_order: 3 },
    { id: 'b2', exercise_id: 'B', set_order: 4 },
  ];

  it('appends after the last exercise with no shifts', () => {
    expect(planSetInsertion(rows, 'B')).toEqual({ insertOrder: 5, shifts: [] });
  });

  it('inserts adjacent to a mid-session exercise and shifts the rest up', () => {
    expect(planSetInsertion(rows, 'A')).toEqual({
      insertOrder: 3,
      shifts: [{ id: 'b1', set_order: 4 }, { id: 'b2', set_order: 5 }],
    });
  });

  it('appends at the end when the exercise is not in the session', () => {
    expect(planSetInsertion(rows, 'Z')).toEqual({ insertOrder: 5, shifts: [] });
  });

  it('starts at order 1 for an empty session', () => {
    expect(planSetInsertion([], 'A')).toEqual({ insertOrder: 1, shifts: [] });
  });

  it('is robust to unsorted input', () => {
    const shuffled: SetOrderRow[] = [rows[3], rows[0], rows[2], rows[1]];
    expect(planSetInsertion(shuffled, 'A')).toEqual({
      insertOrder: 3,
      shifts: [{ id: 'b1', set_order: 4 }, { id: 'b2', set_order: 5 }],
    });
  });
});
