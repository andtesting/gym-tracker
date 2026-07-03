import { supabase } from '../supabase';
import { loadOutbox } from './outbox';
import type { SetWithExercise } from '../types';

const STORAGE_KEY = 'gym-tracker-active-workout';

// Timer anchors survive an iOS PWA kill mid-workout, so rest/set timing keeps
// measuring across a reload instead of silently dropping to null (AND-8).
export interface PersistedTimer {
  mode: 'idle' | 'set' | 'rest';
  startedAtMs: number | null;
  pendingRestSeconds: number | null;
  setStartedAt: string | null;
}

export interface PersistedWorkout {
  sessionId: string;
  routineId: string;
  routineName: string;
  // Present for sessions created locally (offline-capable start). Older
  // records and server-created sessions may lack it.
  startedAt?: string;
  // Authoritative copy of the current session's sets while the workout is
  // active. Older records lack it and hydrate from the server instead.
  sets?: SetWithExercise[];
  timer?: PersistedTimer | null;
}

export function saveActiveWorkout(workout: PersistedWorkout): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workout));
}

export function updateActiveWorkout(patch: Partial<PersistedWorkout>): void {
  const current = loadActiveWorkout();
  if (!current) return;
  saveActiveWorkout({ ...current, ...patch });
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

export type PersistedSessionStatus = 'active' | 'finished' | 'missing' | 'unknown';

// 'unknown' (network failure) must NOT clear the persisted workout: offline
// resume is exactly when the local copy matters most. Only a definitive
// server answer invalidates it. A session the server has never seen (its
// insert still queued in the outbox) also counts as active.
export async function validatePersistedSession(sessionId: string): Promise<PersistedSessionStatus> {
  // A session whose write is still queued locally is invisible to the server;
  // the last queued upsert knows whether it has been finished.
  const queued = loadOutbox().filter(i => i.table === 'sessions' && i.rowId === sessionId && i.op === 'upsert');
  if (queued.length > 0) {
    const last = queued[queued.length - 1];
    return last.payload?.finished_at ? 'finished' : 'active';
  }
  try {
    const { data, error } = await supabase
      .from('sessions')
      .select('id, finished_at')
      .eq('id', sessionId)
      .maybeSingle();
    if (error) return 'unknown';
    if (!data) return 'missing';
    return data.finished_at === null ? 'active' : 'finished';
  } catch {
    return 'unknown';
  }
}
