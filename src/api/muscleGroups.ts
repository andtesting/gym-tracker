import { supabase } from '../supabase';
import type { MuscleGroup } from '../types';

export async function fetchMuscleGroups(): Promise<MuscleGroup[]> {
  const { data, error } = await supabase
    .from('muscle_groups')
    .select('*')
    .order('sort_order');
  if (error) throw error;
  return data;
}

export async function createMuscleGroup(name: string, sortOrder: number): Promise<MuscleGroup> {
  const { data, error } = await supabase
    .from('muscle_groups')
    .insert({ name, sort_order: sortOrder })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateMuscleGroup(
  id: string,
  updates: { name?: string; sort_order?: number },
): Promise<void> {
  const { error } = await supabase
    .from('muscle_groups')
    .update(updates)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteMuscleGroup(id: string): Promise<void> {
  const { error } = await supabase
    .from('muscle_groups')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
