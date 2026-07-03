import { useState, useEffect } from 'react';
import { fetchRecentSessions, fetchHeatmapSessions, fetchExportSets } from '../api/sessions';
import { signOut } from '../hooks/useAuth';
import { saveActiveWorkout } from '../lib/sessionPersistence';
import { toCSV, toJSON } from '../lib/export';
import { localDateKey } from '../lib/date';
import type { ExportRow } from '../lib/export';
import type { SessionWithRoutine, HeatmapSession, Screen } from '../types';
import ActivityHeatmap from './ActivityHeatmap';
import ExportDropdown from './ExportDropdown';
import DayDetailSheet from './DayDetailSheet';

interface Props {
  onNavigate: (screen: Screen) => void;
}

export default function HomeScreen({ onNavigate }: Props) {
  const [sessions, setSessions] = useState<SessionWithRoutine[]>([]);
  const [heatmapSessions, setHeatmapSessions] = useState<HeatmapSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [popoverDate, setPopoverDate] = useState<string | null>(null);

  const sessionsForPopover = popoverDate
    ? heatmapSessions.filter(s => localDateKey(s.started_at) === popoverDate)
    : [];

  useEffect(() => {
    const now = new Date();
    const start = new Date(now);
    // Pad the fetch window a day on each side: the bounds are UTC-derived but
    // the heatmap buckets/renders by LOCAL date, so without the pad a session on
    // the edge day could fall outside the UTC bound and be dropped (AND-38).
    start.setDate(start.getDate() - 85);
    const end = new Date(now);
    end.setDate(end.getDate() + 1);
    const startDate = start.toISOString().split('T')[0];
    const endDate = end.toISOString().split('T')[0] + 'T23:59:59';

    Promise.all([
      fetchRecentSessions(14),
      fetchHeatmapSessions(startDate, endDate),
    ])
      .then(([recent, heatmap]) => {
        setSessions(recent);
        setHeatmapSessions(heatmap);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleExport(format: 'csv' | 'json') {
    const exportSets = await fetchExportSets();
    const rows: ExportRow[] = exportSets.map(set => ({
      date: localDateKey(set.sessions.started_at),
      routine: set.sessions.routines?.name ?? 'Unnamed Routine',
      exercise: set.exercises?.name ?? 'Unnamed Exercise',
      set_type: set.set_type,
      reps: set.reps,
      weight_kg: set.weight_kg,
      set_duration_seconds: set.set_duration_seconds,
      rest_seconds: set.rest_seconds,
      started_at: set.started_at,
      completed_at: set.completed_at,
      session_id: set.sessions.id,
      session_started_at: set.sessions.started_at,
      session_finished_at: set.sessions.finished_at,
      session_notes: set.sessions.notes,
    }));

    const content = format === 'csv' ? toCSV(rows) : toJSON(rows);
    const blob = new Blob([content], { type: format === 'csv' ? 'text/csv' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gym-tracker-export.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-AU', {
      weekday: 'short', day: 'numeric', month: 'short',
    });
  }

  return (
    <div>
      <div className="header-bar">
        <h1>Gym Tracker</h1>
        <div className="row">
          <button className="btn-secondary btn-small" onClick={() => onNavigate({ name: 'editMode' })}>Edit</button>
          <button className="btn-secondary btn-small" onClick={signOut}>Logout</button>
        </div>
      </div>

      {loading && <p className="text-muted text-center mt-16">Loading...</p>}
      {error && <p className="text-center mt-16" style={{ color: 'var(--color-danger)' }}>{error}</p>}

      {!loading && (
        <ActivityHeatmap
          sessions={heatmapSessions}
          onCellClick={(date) => setPopoverDate(date)}
        />
      )}

      {popoverDate && (
        <DayDetailSheet
          date={popoverDate}
          sessions={sessionsForPopover}
          onClose={() => setPopoverDate(null)}
          onNavigate={onNavigate}
        />
      )}

      {!loading && sessions.length === 0 && (
        <p className="text-muted text-center mt-16">No workouts yet. Start your first one!</p>
      )}

      <div className="mt-16">
        {sessions.map(session => (
          <div
            key={session.id}
            className="session-list-item"
            onClick={() => {
              if (!session.finished_at && session.routines) {
                const workout = {
                  sessionId: session.id,
                  routineId: session.routine_id!,
                  routineName: session.routines.name,
                };
                saveActiveWorkout(workout);
                onNavigate({ name: 'activeWorkout', ...workout });
              } else {
                onNavigate({ name: 'sessionDetail', sessionId: session.id });
              }
            }}
          >
            <div className="row-between">
              <div className="row" style={{ gap: 8 }}>
                {session.routines && (
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: session.routines.color,
                      flexShrink: 0,
                    }}
                  />
                )}
                <strong>{session.routines?.name ?? 'Unnamed Routine'}</strong>
              </div>
              <div className="row" style={{ gap: 8 }}>
                {!session.finished_at && (
                  <span className="text-small" style={{ color: 'var(--color-warning)' }}>In progress</span>
                )}
                <span className="text-small text-muted">{formatDate(session.started_at)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bottom-bar-two-row">
        <div className="row">
          <div style={{ flex: 1 }}>
            <ExportDropdown onExport={handleExport} />
          </div>
          <button
            className="btn-secondary"
            style={{ flex: 1 }}
            onClick={() => onNavigate({ name: 'trends' })}
          >
            View Trends
          </button>
        </div>
        <button className="btn-primary" onClick={() => onNavigate({ name: 'pickRoutine' })}>
          Start Workout
        </button>
        <button
          className="btn-secondary"
          style={{ width: '100%' }}
          onClick={() => onNavigate({ name: 'logPastWorkout' })}
        >
          Log past workout
        </button>
      </div>
    </div>
  );
}
