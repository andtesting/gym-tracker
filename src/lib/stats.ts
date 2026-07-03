// Monday-based local week start for a local date key (YYYY-MM-DD).
export function weekStartKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const day = date.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

function shiftWeek(weekKey: string, weeks: number): string {
  const [y, m, d] = weekKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + weeks * 7);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

// Consecutive calendar weeks with at least one session, counting back from
// the current week. An empty current week doesn't break the streak (the week
// isn't over yet); it just doesn't count.
export function weeklyStreak(sessionDateKeys: string[], todayKey: string): number {
  const weeks = new Set(sessionDateKeys.map(weekStartKey));
  let cursor = weekStartKey(todayKey);
  let streak = 0;
  if (!weeks.has(cursor)) cursor = shiftWeek(cursor, -1);
  while (weeks.has(cursor)) {
    streak += 1;
    cursor = shiftWeek(cursor, -1);
  }
  return streak;
}

export interface WeekVolume {
  sets: number;
  tonnageKg: number;
}

export interface WeeklyComparison {
  thisWeek: WeekVolume;
  lastWeek: WeekVolume;
}

interface VolumeRow {
  reps: number;
  weight_kg: number;
  // Local date key of the set's session.
  dateKey: string;
}

export function compareWeeks(rows: VolumeRow[], todayKey: string): WeeklyComparison {
  const thisWeekKey = weekStartKey(todayKey);
  const lastWeekKey = shiftWeek(thisWeekKey, -1);
  const thisWeek: WeekVolume = { sets: 0, tonnageKg: 0 };
  const lastWeek: WeekVolume = { sets: 0, tonnageKg: 0 };
  for (const row of rows) {
    const week = weekStartKey(row.dateKey);
    const bucket = week === thisWeekKey ? thisWeek : week === lastWeekKey ? lastWeek : null;
    if (!bucket) continue;
    bucket.sets += 1;
    bucket.tonnageKg += row.reps * row.weight_kg;
  }
  thisWeek.tonnageKg = Math.round(thisWeek.tonnageKg);
  lastWeek.tonnageKg = Math.round(lastWeek.tonnageKg);
  return { thisWeek, lastWeek };
}

interface RoutineRef {
  id: string;
  name: string;
}

interface SessionRef {
  routine_id: string | null;
  started_at: string;
}

// The routine that has gone longest without a session, never-trained ones
// first. Sessions outside the caller's window (12 weeks on Home) read as
// never-trained, which still sorts them first, so the suggestion holds.
// Null with fewer than two routines: a suggestion needs a choice.
export function nextUpRoutine(routines: RoutineRef[], sessions: SessionRef[]): RoutineRef | null {
  if (routines.length < 2) return null;
  const latest = new Map<string, string>();
  for (const s of sessions) {
    if (!s.routine_id) continue;
    const prev = latest.get(s.routine_id);
    if (!prev || s.started_at > prev) latest.set(s.routine_id, s.started_at);
  }
  let best: RoutineRef | null = null;
  // '￿' sorts after any ISO timestamp; '' (never trained) before all.
  let bestDate = '￿';
  for (const r of routines) {
    const date = latest.get(r.id) ?? '';
    if (date < bestDate) {
      best = r;
      bestDate = date;
    }
  }
  return best;
}
