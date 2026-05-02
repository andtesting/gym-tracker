import { supabase } from '../supabase';

const STORAGE_KEY = 'gym-tracker-active-workout';

export interface PersistedWorkout {
  sessionId: string;
  routineId: string;
  routineName: string;
}

export function saveActiveWorkout(workout: PersistedWorkout): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workout));
}

export function loadActiveWorkout(): PersistedWorkout | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.sessionId && parsed.routineId && parsed.routineName) {
      return parsed as PersistedWorkout;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearActiveWorkout(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export async function validatePersistedSession(sessionId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('sessions')
    .select('id, finished_at')
    .eq('id', sessionId)
    .maybeSingle();
  if (error || !data) return false;
  return data.finished_at === null;
}
