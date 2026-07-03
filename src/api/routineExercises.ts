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
