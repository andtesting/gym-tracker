import { supabase } from '../supabase';
import type { WorkoutSet } from '../types';

export interface CreateSetInput {
  session_id: string;
  exercise_id: string;
  set_order: number;
  set_type: 'warmup' | 'working';
  reps: number;
  weight_kg: number;
  set_duration_seconds: number | null;
}

export async function createSet(input: CreateSetInput): Promise<WorkoutSet> {
  const { data, error } = await supabase
    .from('sets')
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateSetRest(setId: string, restSeconds: number): Promise<void> {
  const { error } = await supabase
    .from('sets')
    .update({ rest_seconds: restSeconds })
    .eq('id', setId);
  if (error) throw error;
}

export async function updateSet(
  id: string,
  updates: { reps?: number; weight_kg?: number },
): Promise<void> {
  const { error } = await supabase
    .from('sets')
    .update(updates)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteSet(id: string): Promise<void> {
  const { error } = await supabase
    .from('sets')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
