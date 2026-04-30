import { useState, useEffect } from 'react';
import { fetchRecentSessions, fetchSessionSets } from '../api/sessions';
import { signOut } from '../hooks/useAuth';
import { toCSV, toJSON } from '../lib/export';
import type { ExportRow } from '../lib/export';
import type { SessionWithRoutine, Screen } from '../types';

interface Props {
  onNavigate: (screen: Screen) => void;
}

export default function HomeScreen({ onNavigate }: Props) {
  const [sessions, setSessions] = useState<SessionWithRoutine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRecentSessions()
      .then(setSessions)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleExport(format: 'csv' | 'json') {
    const rows: ExportRow[] = [];
    for (const session of sessions) {
      const sets = await fetchSessionSets(session.id);
      for (const set of sets) {
        rows.push({
          date: session.started_at.split('T')[0],
          routine: session.routines.name,
          exercise: set.exercises.name,
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
          <button className="btn-secondary btn-small" onClick={() => handleExport('csv')}>CSV</button>
          <button className="btn-secondary btn-small" onClick={() => handleExport('json')}>JSON</button>
          <button className="btn-secondary btn-small" onClick={signOut}>Out</button>
        </div>
      </div>

      {loading && <p className="text-muted text-center mt-16">Loading...</p>}
      {error && <p className="text-center mt-16" style={{ color: 'var(--color-danger)' }}>{error}</p>}

      {!loading && sessions.length === 0 && (
        <p className="text-muted text-center mt-16">No workouts yet. Start your first one!</p>
      )}

      {sessions.map(session => (
        <div
          key={session.id}
          className="session-list-item"
          onClick={() => onNavigate({ name: 'sessionDetail', sessionId: session.id })}
        >
          <div className="row-between">
            <div>
              <strong>{session.routines.name}</strong>
              <div className="text-small text-muted">{formatDate(session.started_at)}</div>
            </div>
            {!session.finished_at && (
              <span className="text-small" style={{ color: 'var(--color-warning)' }}>In progress</span>
            )}
          </div>
        </div>
      ))}

      <div className="bottom-bar">
        <button className="btn-primary" onClick={() => onNavigate({ name: 'pickRoutine' })}>
          Start Workout
        </button>
      </div>
    </div>
  );
}
