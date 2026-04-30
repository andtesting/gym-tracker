export interface ExportRow {
  date: string;
  routine: string;
  exercise: string;
  set_type: string;
  reps: number;
  weight_kg: number;
  set_duration_seconds: number | null;
  rest_seconds: number | null;
}

const CSV_HEADERS = ['date', 'routine', 'exercise', 'set_type', 'reps', 'weight_kg', 'set_duration_seconds', 'rest_seconds'] as const;

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
  date: string;
  routine: string;
  exercises: {
    name: string;
    sets: {
      set_type: string;
      reps: number;
      weight_kg: number;
      set_duration_seconds: number | null;
      rest_seconds: number | null;
    }[];
  }[];
}

export function toJSON(rows: ExportRow[]): string {
  const sessionMap = new Map<string, ExportSession>();

  for (const row of rows) {
    const key = `${row.date}|${row.routine}`;
    if (!sessionMap.has(key)) {
      sessionMap.set(key, { date: row.date, routine: row.routine, exercises: [] });
    }
    const session = sessionMap.get(key)!;
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
    });
  }

  return JSON.stringify(Array.from(sessionMap.values()), null, 2);
}
