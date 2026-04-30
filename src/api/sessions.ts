import { supabase } from '../supabase';
import type { Session, SessionWithRoutine, SetWithExercise, LastSessionData, HeatmapSession } from '../types';

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

export async function deleteSession(id: string): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function fetchSessionSets(sessionId: string): Promise<SetWithExercise[]> {
  const { data, error } = await supabase
    .from('sets')
    .select('*, exercises(*, muscle_groups(*))')
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
    .select('*, exercises(*, muscle_groups(*))')
    .eq('session_id', session.id)
    .order('set_order');
  if (setsErr) throw setsErr;

  return { session, sets };
}

export async function fetchHeatmapSessions(startDate: string, endDate: string): Promise<HeatmapSession[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select('started_at, routines(color)')
    .gte('started_at', startDate)
    .lte('started_at', endDate)
    .order('started_at');
  if (error) throw error;
  return data as unknown as HeatmapSession[];
}

export async function fetchExerciseTrends(exerciseId: string, limit = 8) {
  const { data: rows, error } = await supabase
    .from('sets')
    .select('session_id, set_order, reps, weight_kg, sessions!inner(started_at)')
    .eq('exercise_id', exerciseId)
    .order('set_order');
  if (error) throw error;

  const sessionMap = new Map<string, { started_at: string; sets: { set_order: number; reps: number; weight_kg: number }[] }>();
  for (const row of rows) {
    const sid = row.session_id;
    const date = (row.sessions as unknown as { started_at: string }).started_at;
    if (!sessionMap.has(sid)) {
      sessionMap.set(sid, { started_at: date, sets: [] });
    }
    sessionMap.get(sid)!.sets.push({ set_order: row.set_order, reps: row.reps, weight_kg: row.weight_kg });
  }

  return Array.from(sessionMap.values())
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, limit)
    .reverse();
}
