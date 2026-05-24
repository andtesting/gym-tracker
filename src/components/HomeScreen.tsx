import { useState, useEffect } from 'react';
import { fetchRecentSessions, fetchSessionSets, fetchHeatmapSessions } from '../api/sessions';
import { signOut } from '../hooks/useAuth';
import { saveActiveWorkout } from '../lib/sessionPersistence';
import { toCSV, toJSON } from '../lib/export';
import type { ExportRow } from '../lib/export';
import type { SessionWithRoutine, HeatmapSession, Screen } from '../types';
import ActivityHeatmap from './ActivityHeatmap';
import ExportDropdown from './ExportDropdown';

interface Props {
  onNavigate: (screen: Screen) => void;
}

export default function HomeScreen({ onNavigate }: Props) {
  const [sessions, setSessions] = useState<SessionWithRoutine[]>([]);
  const [heatmapSessions, setHeatmapSessions] = useState<HeatmapSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 84);
    const startDate = start.toISOString().split('T')[0];
    const endDate = now.toISOString().split('T')[0] + 'T23:59:59';

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
    const allSessions = await fetchRecentSessions(1000);
    const rows: ExportRow[] = [];
    for (const session of allSessions) {
      const sets = await fetchSessionSets(session.id);
      for (const set of sets) {
        rows.push({
          date: session.started_at.split('T')[0],
          routine: session.routines?.name ?? 'Unnamed Routine',
          exercise: set.exercises?.name ?? 'Unnamed Exercise',
          set_type: set.set_type,
          reps: set.reps,
          weight_kg: set.weight_kg,
          set_duration_seconds: set.set_duration_seconds,
          rest_seconds: set.rest_seconds,
        });
      }
    }

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

      {!loading && <ActivityHeatmap sessions={heatmapSessions} />}

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
