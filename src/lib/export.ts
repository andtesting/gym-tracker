export interface ExportRow {
  // Local calendar date of the session (localDateKey), not the UTC split.
  date: string;
  routine: string;
  exercise: string;
  set_type: string;
  reps: number;
  weight_kg: number;
  set_duration_seconds: number | null;
  rest_seconds: number | null;
  started_at: string | null;
  completed_at: string | null;
  session_id: string;
  session_started_at: string;
  session_finished_at: string | null;
  session_notes: string | null;
  rpe: number | null;
  set_notes: string | null;
  group_id: string | null;
}

// Original ten columns first so existing downstream consumers keep working;
// session identity columns appended, then per-set context columns (rpe,
// set_notes...) appended after those for the same reason.
const CSV_HEADERS = [
  'date', 'routine', 'exercise', 'set_type', 'reps', 'weight_kg',
  'set_duration_seconds', 'rest_seconds', 'started_at', 'completed_at',
  'session_id', 'session_started_at', 'session_finished_at', 'session_notes',
  'rpe', 'set_notes', 'group_id',
] as const;

function escapeCSV(value: string | number | null): string {
  if (value === null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCSV(rows: ExportRow[]): string {
  const header = CSV_HEADERS.join(',');
  const dataLines = rows.map(row =>
    CSV_HEADERS.map(key => escapeCSV(row[key])).join(',')
  );
  return [header, ...dataLines].join('\n');
}

interface ExportSession {
  session_id: string;
  date: string;
  routine: string;
  started_at: string;
  finished_at: string | null;
  notes: string | null;
  exercises: {
    name: string;
    sets: {
      set_type: string;
      reps: number;
      weight_kg: number;
      set_duration_seconds: number | null;
      rest_seconds: number | null;
      rpe: number | null;
      notes: string | null;
      group_id: string | null;
      started_at: string | null;
      completed_at: string | null;
    }[];
  }[];
}

export function toJSON(rows: ExportRow[]): string {
  const sessionMap = new Map<string, ExportSession>();

  for (const row of rows) {
    if (!sessionMap.has(row.session_id)) {
      sessionMap.set(row.session_id, {
        session_id: row.session_id,
        date: row.date,
        routine: row.routine,
        started_at: row.session_started_at,
        finished_at: row.session_finished_at,
        notes: row.session_notes,
        exercises: [],
      });
    }
    const session = sessionMap.get(row.session_id)!;
    let exercise = session.exercises.find(e => e.name === row.exercise);
    if (!exercise) {
      exercise = { name: row.exercise, sets: [] };
      session.exercises.push(exercise);
    }
    exercise.sets.push({
      set_type: row.set_type,
      reps: row.reps,
      weight_kg: row.weight_kg,
      set_duration_seconds: row.set_duration_seconds,
      rest_seconds: row.rest_seconds,
      rpe: row.rpe,
      notes: row.set_notes,
      group_id: row.group_id,
      started_at: row.started_at,
      completed_at: row.completed_at,
    });
  }

  return JSON.stringify(Array.from(sessionMap.values()), null, 2);
}
