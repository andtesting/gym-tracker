import { supabase } from '../supabase';
import type {
  Session,
  SessionWithRoutine,
  SetWithExercise,
  WorkoutSet,
  LastSessionData,
  HeatmapSession,
  ExerciseHistoryEntry,
  RoutineSessionHistory,
} from '../types';

export async function fetchRecentSessions(limit = 20): Promise<SessionWithRoutine[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select('*, routines(*)')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function createSession(routineId: string, startedAt?: string): Promise<Session> {
  const row: Record<string, unknown> = { routine_id: routineId };
  if (startedAt) row.started_at = startedAt;
  const { data, error } = await supabase
    .from('sessions')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function finishSession(sessionId: string, finishedAt?: string): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .update({ finished_at: finishedAt ?? new Date().toISOString() })
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

// Returns the most recent finished session for each exercise across ALL routines,
// keyed by exercise_id. Used during an active workout so the user can see prior
// performance for an exercise even when it was last done under a different routine.
export async function fetchLastSetsForExercises(
  exerciseIds: string[],
): Promise<Map<string, ExerciseHistoryEntry>> {
  if (exerciseIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('sets')
    .select('*, sessions!inner(*, routines(*))')
    .in('exercise_id', exerciseIds)
    .not('sessions.finished_at', 'is', null)
    .order('started_at', { referencedTable: 'sessions', ascending: false })
    .order('set_order');
  if (error) throw error;

  // Group rows by exercise → take the most recent session_id seen, then collect
  // every set from that session for that exercise.
  type Row = WorkoutSet & { sessions: SessionWithRoutine };
  const rows = data as unknown as Row[];

  // Walk rows in (session-date DESC, set_order ASC) order. First session_id we
  // see for each exercise_id wins; collect all sets sharing that session_id.
  const winningSession = new Map<string, string>(); // exercise_id -> session_id
  const result = new Map<string, ExerciseHistoryEntry>();

  for (const row of rows) {
    if (!row.exercise_id) continue;
    if (!winningSession.has(row.exercise_id)) {
      winningSession.set(row.exercise_id, row.session_id);
      result.set(row.exercise_id, { session: row.sessions, sets: [] });
    }
    if (winningSession.get(row.exercise_id) === row.session_id) {
      const rest: WorkoutSet = {
        id: row.id,
        session_id: row.session_id,
        exercise_id: row.exercise_id,
        set_order: row.set_order,
        set_type: row.set_type,
        reps: row.reps,
        weight_kg: row.weight_kg,
        set_duration_seconds: row.set_duration_seconds,
        rest_seconds: row.rest_seconds,
        started_at: row.started_at,
        completed_at: row.completed_at,
        created_at: row.created_at,
      };
      result.get(row.exercise_id)!.sets.push(rest);
    }
  }

  return result;
}

// Last N finished sessions for a routine, each with full set list. Used by the
// in-workout history overlay so the user can compare against multiple prior runs.
export async function fetchRecentRoutineSessions(
  routineId: string,
  limit = 5,
): Promise<RoutineSessionHistory[]> {
  const { data: sessions, error: sessionErr } = await supabase
    .from('sessions')
    .select('*, routines(*)')
    .eq('routine_id', routineId)
    .not('finished_at', 'is', null)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (sessionErr) throw sessionErr;
  if (sessions.length === 0) return [];

  const ids = sessions.map(s => s.id);
  const { data: sets, error: setsErr } = await supabase
    .from('sets')
    .select('*, exercises(*, muscle_groups(*))')
    .in('session_id', ids)
    .order('set_order');
  if (setsErr) throw setsErr;

  const setsBySession = new Map<string, SetWithExercise[]>();
  for (const s of sets) {
    const arr = setsBySession.get(s.session_id) ?? [];
    arr.push(s);
    setsBySession.set(s.session_id, arr);
  }
  return sessions.map(session => ({
    session,
    sets: setsBySession.get(session.id) ?? [],
  }));
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
