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

export async function fetchSession(sessionId: string): Promise<Session | null> {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateSessionNotes(sessionId: string, notes: string | null): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .update({ notes })
    .eq('id', sessionId);
  if (error) throw error;
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

export interface ExportSetRow {
  set_order: number;
  set_type: 'warmup' | 'working';
  reps: number;
  weight_kg: number;
  set_duration_seconds: number | null;
  rest_seconds: number | null;
  rpe: number | null;
  notes: string | null;
  group_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  sessions: {
    id: string;
    started_at: string;
    finished_at: string | null;
    notes: string | null;
    routines: { name: string } | null;
  };
  exercises: { name: string } | null;
}

// Session started_at DESC, stable id tie-break, then set_order ASC. Shared by
// the export fetch and fetchExerciseHistories: PostgREST can't order outer
// rows by a referenced table's column, so both sort client-side.
function compareBySessionThenOrder(
  a: { sessions: { started_at: string; id: string }; set_order: number },
  b: { sessions: { started_at: string; id: string }; set_order: number },
): number {
  const cmp = b.sessions.started_at.localeCompare(a.sessions.started_at);
  if (cmp !== 0) return cmp;
  const idCmp = b.sessions.id.localeCompare(a.sessions.id);
  if (idCmp !== 0) return idCmp;
  return a.set_order - b.set_order;
}

// Every set with its session context, paginated: supabase-js caps un-ranged
// queries at PostgREST's max-rows (default 1000), which would silently
// truncate the export once total sets exceed it.
export async function fetchExportSets(): Promise<ExportSetRow[]> {
  const PAGE = 1000;
  const rows: ExportSetRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('sets')
      .select('set_order, set_type, reps, weight_kg, set_duration_seconds, rest_seconds, rpe, notes, group_id, started_at, completed_at, sessions!inner(id, started_at, finished_at, notes, routines(name)), exercises(name)')
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const page = data as unknown as ExportSetRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  rows.sort(compareBySessionThenOrder);
  return rows;
}

export async function fetchHeatmapSessions(startDate: string, endDate: string): Promise<HeatmapSession[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select('id, routine_id, started_at, routines(name, color)')
    .gte('started_at', startDate)
    .lte('started_at', endDate)
    .order('started_at');
  if (error) throw error;
  return data as unknown as HeatmapSession[];
}

export interface VolumeSetRow {
  reps: number;
  weight_kg: number;
  sessions: { started_at: string };
}

// Sets from recent sessions only (home-screen week comparison); bounded by
// the since filter so it stays a small query.
export async function fetchRecentVolumeSets(sinceIso: string): Promise<VolumeSetRow[]> {
  const { data, error } = await supabase
    .from('sets')
    .select('reps, weight_kg, sessions!inner(started_at)')
    .gte('sessions.started_at', sinceIso)
    .not('sessions.finished_at', 'is', null);
  if (error) throw error;
  return data as unknown as VolumeSetRow[];
}

// Returns up to `maxSessions` most recent finished sessions for each exercise
// across ALL routines, keyed by exercise_id, newest first. Used during an active
// workout so the user can page through prior performances of an exercise even
// when it was last done under a different routine.
//
// Note: PostgREST's `referencedTable` ordering only sorts nested arrays, not
// outer rows. To order by session date we must sort client-side after pulling
// all rows.
export async function fetchExerciseHistories(
  exerciseIds: string[],
  maxSessions = 10,
): Promise<Map<string, ExerciseHistoryEntry[]>> {
  if (exerciseIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('sets')
    .select('*, sessions!inner(*, routines(*))')
    .in('exercise_id', exerciseIds)
    .not('sessions.finished_at', 'is', null);
  if (error) throw error;

  type Row = WorkoutSet & { sessions: SessionWithRoutine };
  const rows = data as unknown as Row[];

  rows.sort(compareBySessionThenOrder);

  const result = new Map<string, ExerciseHistoryEntry[]>();
  // Track, per exercise, the session_id of the entry we're currently appending
  // to so consecutive rows of the same session accumulate into one entry.
  const lastSessionForExercise = new Map<string, string>();

  for (const row of rows) {
    if (!row.exercise_id) continue;
    const list = result.get(row.exercise_id) ?? [];
    if (!result.has(row.exercise_id)) result.set(row.exercise_id, list);

    const isNewSession = lastSessionForExercise.get(row.exercise_id) !== row.session_id;
    if (isNewSession) {
      if (list.length >= maxSessions) continue;
      list.push({ session: row.sessions, sets: [] });
      lastSessionForExercise.set(row.exercise_id, row.session_id);
    }
    const set: WorkoutSet = {
      id: row.id,
      session_id: row.session_id,
      exercise_id: row.exercise_id,
      set_order: row.set_order,
      set_type: row.set_type,
      reps: row.reps,
      weight_kg: row.weight_kg,
      set_duration_seconds: row.set_duration_seconds,
      rest_seconds: row.rest_seconds,
      rpe: row.rpe,
      notes: row.notes,
      group_id: row.group_id,
      started_at: row.started_at,
      completed_at: row.completed_at,
      created_at: row.created_at,
    };
    list[list.length - 1].sets.push(set);
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
