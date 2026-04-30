import { supabase } from '../supabase';
import type { Exercise } from '../types';

export async function fetchExercises(): Promise<Exercise[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .order('name');
  if (error) throw error;
  return data;
}

export async function createExercise(name: string): Promise<Exercise> {
  const { data, error } = await supabase
    .from('exercises')
    .insert({ name })
    .select()
    .single();
  if (error) throw error;
  return data;
}
