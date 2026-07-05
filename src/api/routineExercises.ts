import { supabase } from '../supabase';
import type { RoutineExerciseWithExercise } from '../types';

export async function fetchRoutineExercises(routineId: string): Promise<RoutineExerciseWithExercise[]> {
  const { data, error } = await supabase
    .from('routine_exercises')
    .select('*, exercises(*, muscle_groups(*))')
    .eq('routine_id', routineId)
    .order('sort_order');
  if (error) throw error;
  return data as unknown as RoutineExerciseWithExercise[];
}

export async function addRoutineExercise(
  routineId: string,
  exerciseId: string,
  sortOrder: number,
): Promise<RoutineExerciseWithExercise> {
  const { data, error } = await supabase
    .from('routine_exercises')
    .insert({ routine_id: routineId, exercise_id: exerciseId, sort_order: sortOrder })
    .select('*, exercises(*, muscle_groups(*))')
    .single();
  if (error) throw error;
  return data as unknown as RoutineExerciseWithExercise;
}

// Bulk insert for seeding a freshly minted variant's template in one round
// trip (see lib/variantFromSession). Targets not supplied stay null.
export async function createRoutineExercises(
  rows: Array<{
    routine_id: string;
    exercise_id: string;
    sort_order: number;
    target_reps?: number | null;
    target_weight_kg?: number | null;
  }>,
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from('routine_exercises').insert(rows);
  if (error) throw error;
}

export async function updateRoutineExercise(
  id: string,
  updates: {
    sort_order?: number;
    target_sets?: number | null;
    target_reps?: number | null;
    target_weight_kg?: number | null;
    target_rest_seconds?: number | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from('routine_exercises')
    .update(updates)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteRoutineExercise(id: string): Promise<void> {
  const { error } = await supabase
    .from('routine_exercises')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
