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

// New routines default to their own single-variant category (category = name);
// variant creation passes explicit category/label/order (and reuses the
// category's colour). See docs/ROUTINE_VARIANTS_PLAN.md.
export async function createRoutine(
  name: string,
  existingCount: number,
  meta?: { category?: string; variant_label?: string | null; variant_order?: number; color?: string },
): Promise<Routine> {
  const { data, error } = await supabase
    .from('routines')
    .insert({
      name,
      color: meta?.color ?? autoAssignColour(existingCount),
      category: meta?.category ?? name,
      variant_label: meta?.variant_label ?? null,
      variant_order: meta?.variant_order ?? 0,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateRoutine(
  id: string,
  updates: {
    name?: string;
    color?: string;
    category?: string;
    variant_label?: string | null;
    variant_order?: number;
  },
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
