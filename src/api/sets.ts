import { supabase } from '../supabase';
import type { WorkoutSet } from '../types';

export interface CreateSetInput {
  session_id: string;
  exercise_id: string;
  set_order: number;
  // The warmup/working distinction was removed from the UI; every new set is
  // 'working'. The DB column is retained (and still holds historical labels)
  // so old data is preserved and the feature is reversible.
  set_type?: 'warmup' | 'working';
  reps: number;
  weight_kg: number;
  set_duration_seconds: number | null;
  // Rest taken BEFORE this set (since the previously logged set in the session,
  // across exercises). Null for the first set of a session and for retroactive
  // sets, where no rest is measured. See AND-37.
  rest_seconds?: number | null;
  rpe?: number | null;
  notes?: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at?: string;
}

export async function createSet(input: CreateSetInput): Promise<WorkoutSet> {
  const { data, error } = await supabase
    .from('sets')
    .insert({ set_type: 'working', ...input })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateSet(
  id: string,
  updates: { reps?: number; weight_kg?: number; set_order?: number; rpe?: number | null; notes?: string | null },
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
