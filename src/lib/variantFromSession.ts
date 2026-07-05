import type { ActiveExercise } from '../hooks/useWorkout';

// Seed row for a new variant's routine_exercises template, built from what was
// actually done today. Rest/sets targets are left null (we only carry over the
// concrete load the user hit); routine_id is assigned once the routine exists.
export interface VariantExerciseSeed {
  exercise_id: string;
  sort_order: number;
  target_reps: number | null;
  target_weight_kg: number | null;
}

// Did today deviate from the started variant's template? Compares the set of
// exercises actually performed (>=1 logged set) against the set in the
// template. Any add, drop, or swap counts (the "machines were busy" case).
// An empty session (nothing logged) never deviates: there's nothing to save.
export function sessionDeviatesFromTemplate(exercises: ActiveExercise[]): boolean {
  const done = new Set(exercises.filter(e => e.sets.length > 0).map(e => e.exercise.id));
  if (done.size === 0) return false;
  const template = new Set(exercises.filter(e => e.template !== null).map(e => e.exercise.id));
  if (done.size !== template.size) return true;
  for (const id of done) if (!template.has(id)) return true;
  return false;
}

// Builds the new variant's template from today's performed exercises, in the
// order they sit in the plan. Each exercise's target reps/weight come from its
// top set (heaviest; ties keep the first seen), per ROUTINE_VARIANTS_PLAN Q3.
export function buildVariantSeed(exercises: ActiveExercise[]): VariantExerciseSeed[] {
  return exercises
    .filter(e => e.sets.length > 0)
    .map((e, i) => {
      const top = e.sets.reduce<ActiveExercise['sets'][number] | null>(
        (best, s) => (!best || s.weight_kg > best.weight_kg ? s : best),
        null,
      );
      return {
        exercise_id: e.exercise.id,
        sort_order: i,
        target_reps: top ? top.reps : null,
        target_weight_kg: top ? top.weight_kg : null,
      };
    });
}
