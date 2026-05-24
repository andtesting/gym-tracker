import { useState, useEffect } from 'react';
import { fetchRoutines } from '../api/routines';
import { createSession } from '../api/sessions';
import type { Routine, Screen } from '../types';

interface Props {
  onNavigate: (screen: Screen) => void;
}

function todayLocalIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function LogPastWorkoutScreen({ onNavigate }: Props) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(todayLocalIso());
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRoutines()
      .then(setRoutines)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleContinue() {
    if (!selectedRoutineId || !date) return;
    const routine = routines.find(r => r.id === selectedRoutineId);
    if (!routine) return;
    setError(null);
    setCreating(true);
    try {
      // Anchor session start at midday on the picked date so it lands cleanly
      // in heatmap buckets and doesn't accidentally roll into the prior day.
      const startedAt = new Date(`${date}T12:00:00`).toISOString();
      const session = await createSession(routine.id, startedAt);
      onNavigate({
        name: 'retroactiveWorkout',
        sessionId: session.id,
        routineId: routine.id,
        routineName: routine.name,
        date,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create session');
      setCreating(false);
    }
  }

  return (
    <div>
      <button
        className="btn-secondary btn-small mb-16"
        onClick={() => onNavigate({ name: 'home' })}
      >
        Back
      </button>
      <h1 className="mb-16">Log past workout</h1>
      <p className="text-muted text-small mb-16">
        For days you forgot to bring your phone. Pick the date and routine, then enter the sets you did.
      </p>

      {loading && <p className="text-muted text-center mt-16">Loading...</p>}
      {error && <p style={{ color: 'var(--color-danger)' }} className="text-small mb-16">{error}</p>}

      {!loading && (
        <>
          <label className="text-small text-muted">Date</label>
          <input
            type="date"
            value={date}
            max={todayLocalIso()}
            onChange={e => setDate(e.target.value)}
            className="mb-16"
            style={{ marginTop: 4 }}
          />

          <h2 className="mb-16">Routine</h2>
          <div className="stack mb-16">
            {routines.map(routine => (
              <button
                key={routine.id}
                className="btn-secondary"
                onClick={() => setSelectedRoutineId(routine.id)}
                style={{
                  borderColor: selectedRoutineId === routine.id ? 'var(--color-accent)' : undefined,
                  background: selectedRoutineId === routine.id ? 'var(--color-accent-light)' : undefined,
                }}
              >
                <div className="row" style={{ gap: 8 }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: routine.color, flexShrink: 0,
                  }} />
                  <span>{routine.name}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="bottom-bar">
        <button
          className="btn-primary"
          style={{ width: '100%', maxWidth: 480 }}
          onClick={handleContinue}
          disabled={!selectedRoutineId || !date || creating}
        >
          {creating ? 'Creating...' : 'Continue'}
        </button>
      </div>
    </div>
  );
}
