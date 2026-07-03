import type { SetWithExercise } from '../types';

export interface DisplayGroup {
  name: string;
  sets: SetWithExercise[];
  // Per-row labels for superset groups ("A1", "B2": exercise letter + that
  // exercise's running set count). Null for plain single-exercise groups,
  // where the row index suffices.
  labels: string[] | null;
}

// Groups a session's ordered sets for display. Consecutive sets sharing a
// group_id form one superset group (exercises interleave inside it);
// otherwise consecutive sets of the same exercise group as before.
// Non-contiguous same-group runs are NOT re-merged — same behaviour as the
// old consecutive-name grouping, and the useWorkout adjacency invariant
// keeps group members contiguous in practice.
export function buildDisplayGroups(sets: SetWithExercise[]): DisplayGroup[] {
  interface Acc { key: string; sets: SetWithExercise[]; isSuperset: boolean }
  const acc: Acc[] = [];

  for (const set of sets) {
    const key = set.group_id
      ? `g:${set.group_id}`
      : `n:${set.exercises?.name ?? 'Unnamed Exercise'}`;
    const last = acc[acc.length - 1];
    if (last && last.key === key) {
      last.sets.push(set);
    } else {
      acc.push({ key, sets: [set], isSuperset: Boolean(set.group_id) });
    }
  }

  return acc.map(group => {
    if (!group.isSuperset) {
      return {
        name: group.sets[0].exercises?.name ?? 'Unnamed Exercise',
        sets: group.sets,
        labels: null,
      };
    }
    // Letter per exercise in first-appearance order; label = letter + running
    // count within that exercise.
    const letterByExercise = new Map<string, string>();
    const countByExercise = new Map<string, number>();
    const names: string[] = [];
    const labels = group.sets.map(set => {
      const exKey = set.exercise_id ?? 'unknown';
      if (!letterByExercise.has(exKey)) {
        letterByExercise.set(exKey, String.fromCharCode(65 + letterByExercise.size));
        names.push(set.exercises?.name ?? 'Unnamed Exercise');
      }
      const n = (countByExercise.get(exKey) ?? 0) + 1;
      countByExercise.set(exKey, n);
      return `${letterByExercise.get(exKey)}${n}`;
    });
    // A "superset" that only ever contains one exercise reads better plain.
    if (names.length === 1) {
      return { name: names[0], sets: group.sets, labels: null };
    }
    return { name: names.join(' + '), sets: group.sets, labels };
  });
}
