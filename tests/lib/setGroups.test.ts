import { describe, it, expect } from 'vitest';
import { buildDisplayGroups } from '../../src/lib/setGroups';
import type { Exercise, SetWithExercise } from '../../src/types';

function makeExercise(id: string, name: string): Exercise {
  return { id, name, muscle_group_id: null, muscle_groups: null, created_at: '2026-01-01T00:00:00Z' };
}

function makeSet(exerciseId: string, name: string, order: number, groupId: string | null = null): SetWithExercise {
  return {
    id: `set-${order}`,
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
    group_id: groupId,
    deleted_at: null,
    started_at: null,
    completed_at: null,
    created_at: '2026-07-01T00:00:00Z',
    exercises: makeExercise(exerciseId, name),
  };
}

describe('buildDisplayGroups', () => {
  it('groups consecutive same-exercise sets as before when no group_id', () => {
    const groups = buildDisplayGroups([
      makeSet('a', 'Bench', 1),
      makeSet('a', 'Bench', 2),
      makeSet('b', 'Row', 3),
    ]);
    expect(groups.map(g => g.name)).toEqual(['Bench', 'Row']);
    expect(groups[0].labels).toBeNull();
  });

  it('merges an interleaved superset run into one labelled group', () => {
    const groups = buildDisplayGroups([
      makeSet('a', 'Bench', 1, 'g1'),
      makeSet('b', 'Row', 2, 'g1'),
      makeSet('a', 'Bench', 3, 'g1'),
      makeSet('b', 'Row', 4, 'g1'),
      makeSet('c', 'Curl', 5),
    ]);
    expect(groups.map(g => g.name)).toEqual(['Bench + Row', 'Curl']);
    expect(groups[0].labels).toEqual(['A1', 'B1', 'A2', 'B2']);
    expect(groups[1].labels).toBeNull();
  });

  it('keeps distinct group_ids separate', () => {
    const groups = buildDisplayGroups([
      makeSet('a', 'Bench', 1, 'g1'),
      makeSet('b', 'Row', 2, 'g2'),
    ]);
    expect(groups).toHaveLength(2);
  });

  it('renders a single-exercise group_id run as a plain group', () => {
    const groups = buildDisplayGroups([
      makeSet('a', 'Bench', 1, 'g1'),
      makeSet('a', 'Bench', 2, 'g1'),
    ]);
    expect(groups[0].name).toBe('Bench');
    expect(groups[0].labels).toBeNull();
  });

  it('separates same-name runs split by other exercises', () => {
    const groups = buildDisplayGroups([
      makeSet('a', 'Bench', 1),
      makeSet('b', 'Row', 2),
      makeSet('a', 'Bench', 3),
    ]);
    expect(groups.map(g => g.name)).toEqual(['Bench', 'Row', 'Bench']);
  });
});
