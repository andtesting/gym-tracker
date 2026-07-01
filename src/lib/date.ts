// Converts a UTC ISO timestamp (as stored in `sessions.started_at`) to the
// LOCAL calendar date as `YYYY-MM-DD`. The activity heatmap builds its grid
// cells from local dates, so sessions must be bucketed by their local day too;
// splitting the raw ISO string on 'T' yields the UTC day, which lands
// early-morning workouts on the previous day for timezones east of UTC (AND-38).
export function localDateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
