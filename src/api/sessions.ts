import { supabase } from '../supabase';
import type { Session, SessionWithRoutine, SetWithExercise, LastSessionData } from '../types';

export async function fetchRecentSessions(limit = 20): Promise<SessionWithRoutine[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select('*, routines(*)')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function createSession(routineId: string): Promise<Session> {
  const { data, error } = await supabase
    .from('sessions')
    .insert({ routine_id: routineId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function finishSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .update({ finished_at: new Date().toISOString() })
    .eq('id', sessionId);
  if (error) throw error;
}

export async function fetchSessionSets(sessionId: string): Promise<SetWithExercise[]> {
  const { data, error } = await supabase
    .from('sets')
    .select('*, exercises(*)')
    .eq('session_id', sessionId)
    .order('set_order');
  if (error) throw error;
  return data;
}

export async function fetchLastSession(routineId: string): Promise<LastSessionData | null> {
  const { data: session, error: sessionErr } = await supabase
    .from('sessions')
    .select('*')
    .eq('routine_id', routineId)
    .not('finished_at', 'is', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sessionErr) throw sessionErr;
  if (!session) return null;

  const { data: sets, error: setsErr } = await supabase
    .from('sets')
    .select('*, exercises(*)')
    .eq('session_id', session.id)
    .order('set_order');
  if (setsErr) throw setsErr;

  return { session, sets };
}
