import { formatWeight } from './units';
import type { WeightUnit } from './settings';
import type { SetWithExercise } from '../types';

export interface EditFields {
  reps: string;
  weight_kg: string;
  rpe: string;
  notes: string;
}

export function editFieldsForSet(set: SetWithExercise, unit: WeightUnit): EditFields {
  return {
    reps: String(set.reps),
    weight_kg: formatWeight(set.weight_kg, unit),
    rpe: set.rpe == null ? '' : String(set.rpe),
    notes: set.notes ?? '',
  };
}

// Keeps the SessionDetail edit map complete: every current set has a full
// entry, in-progress edits are preserved, and entries for deleted sets are
// dropped. This is the fix for the add-set crash — a set added mid-edit used
// to have no entry, so its inputs rendered blank AND the first keystroke
// spread `undefined` into a partial object, so `notes.trim()` blew up on save.
export function seedEditedSets(
  sets: SetWithExercise[],
  prev: Record<string, EditFields>,
  unit: WeightUnit,
): Record<string, EditFields> {
  let changed = false;
  const next: Record<string, EditFields> = { ...prev };
  const liveIds = new Set(sets.map(s => s.id));
  for (const set of sets) {
    if (!next[set.id]) {
      next[set.id] = editFieldsForSet(set, unit);
      changed = true;
    }
  }
  for (const id of Object.keys(next)) {
    if (!liveIds.has(id)) {
      delete next[id];
      changed = true;
    }
  }
  return changed ? next : prev;
}

export interface SetOrderRow {
  id: string;
  exercise_id: string | null;
  set_order: number;
}

// Plans appending a set to `exerciseId` right after that exercise's existing
// sets, keeping set_order contiguous so display grouping stays correct (a new
// set appended at the very end would render as a detached group when the
// exercise sits mid-session). Returns the new set's order and the existing
// rows whose order must shift up by one.
export function planSetInsertion(
  sets: SetOrderRow[],
  exerciseId: string,
): { insertOrder: number; shifts: { id: string; set_order: number }[] } {
  const ordered = [...sets].sort((a, b) => a.set_order - b.set_order);
  let lastOrderForExercise: number | null = null;
  for (const s of ordered) {
    if (s.exercise_id === exerciseId) lastOrderForExercise = s.set_order;
  }
  const insertOrder = lastOrderForExercise !== null
    ? lastOrderForExercise + 1
    : (ordered.length > 0 ? ordered[ordered.length - 1].set_order + 1 : 1);
  const shifts = ordered
    .filter(s => s.set_order >= insertOrder)
    .map(s => ({ id: s.id, set_order: s.set_order + 1 }));
  return { insertOrder, shifts };
}
