import { supabase } from '../supabase';
import type { Exercise } from '../types';

export async function fetchExercises(): Promise<Exercise[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select('*, muscle_groups(*)')
    .order('name');
  if (error) throw error;
  return data;
}

export async function createExercise(name: string, muscleGroupId?: string): Promise<Exercise> {
  const row: Record<string, unknown> = { name };
  if (muscleGroupId) row.muscle_group_id = muscleGroupId;
  const { data, error } = await supabase
    .from('exercises')
    .insert(row)
    .select('*, muscle_groups(*)')
    .single();
  if (error) throw error;
  return data;
}

export async function updateExercise(
  id: string,
  updates: {
    name?: string;
    muscle_group_id?: string | null;
    equipment?: string | null;
    is_bodyweight?: boolean;
    secondary_muscle_group_ids?: string[];
  },
): Promise<void> {
  const { error } = await supabase
    .from('exercises')
    .update(updates)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteExercise(id: string): Promise<void> {
  const { error } = await supabase
    .from('exercises')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
