import { supabase } from '../supabase';
import type { Routine } from '../types';
import { autoAssignColour } from '../lib/palette';

export async function fetchRoutines(): Promise<Routine[]> {
  const { data, error } = await supabase
    .from('routines')
    .select('*')
    .order('name');
  if (error) throw error;
  return data;
}

export async function createRoutine(name: string, existingCount: number): Promise<Routine> {
  const { data, error } = await supabase
    .from('routines')
    .insert({ name, color: autoAssignColour(existingCount) })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateRoutine(
  id: string,
  updates: { name?: string; color?: string },
): Promise<void> {
  const { error } = await supabase
    .from('routines')
    .update(updates)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteRoutine(id: string): Promise<void> {
  const { error } = await supabase
    .from('routines')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
