import { supabase } from '../supabase';
import type { Routine } from '../types';

export async function fetchRoutines(): Promise<Routine[]> {
  const { data, error } = await supabase
    .from('routines')
    .select('*')
    .order('name');
  if (error) throw error;
  return data;
}

export async function createRoutine(name: string): Promise<Routine> {
  const { data, error } = await supabase
    .from('routines')
    .insert({ name })
    .select()
    .single();
  if (error) throw error;
  return data;
}
