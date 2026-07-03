import type { Exercise, RoutineExercise, RoutineExerciseWithExercise, SetWithExercise } from '../types';

export interface PlanEntry {
  exercise: Exercise;
  template: RoutineExercise | null;
}

// The ordered exercise plan for an active workout, merged from three sources:
// 1. Exercises already touched this session (in set_order), always first —
//    reality beats the plan.
// 2. The routine template (routine_exercises by sort_order) for exercises not
//    yet touched: the planned shape of the day.
// 3. Leftover exercises from the most recent same-routine session, so a
//    template-less routine keeps today's behaviour exactly.
// Template rows also attach to exercises that arrived via source 1 or 3, so
// rest targets apply regardless of how the exercise entered the list.
export function buildPlan(
  currentSets: SetWithExercise[],
  templates: RoutineExerciseWithExercise[],
  lastSessionSets: SetWithExercise[],
): PlanEntry[] {
  const templateByExercise = new Map<string, RoutineExercise>();
  for (const t of templates) templateByExercise.set(t.exercise_id, t);

  const entries = new Map<string, PlanEntry>();

  for (const set of currentSets) {
    if (!set.exercise_id || !set.exercises || entries.has(set.exercise_id)) continue;
    entries.set(set.exercise_id, {
      exercise: set.exercises,
      template: templateByExercise.get(set.exercise_id) ?? null,
    });
  }

  for (const t of templates) {
    if (!t.exercises || entries.has(t.exercise_id)) continue;
    entries.set(t.exercise_id, { exercise: t.exercises, template: t });
  }

  for (const set of lastSessionSets) {
    if (!set.exercise_id || !set.exercises || entries.has(set.exercise_id)) continue;
    entries.set(set.exercise_id, {
      exercise: set.exercises,
      template: templateByExercise.get(set.exercise_id) ?? null,
    });
  }

  return Array.from(entries.values());
}
