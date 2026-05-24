import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { fetchRoutines, createRoutine } from '../api/routines';
import { createSession, finishSession, deleteSession } from '../api/sessions';
import type { Routine, Screen } from '../types';

interface Props {
  onNavigate: (screen: Screen) => void;
  initialDate?: string;
}

function todayLocalIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function LogPastWorkoutScreen({ onNavigate, initialDate }: Props) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(initialDate ?? todayLocalIso());
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingRoutine, setAddingRoutine] = useState(false);
  const [newRoutineName, setNewRoutineName] = useState('');
  const [addingBusy, setAddingBusy] = useState(false);

  useEffect(() => {
    fetchRoutines()
      .then(setRoutines)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleAddRoutine() {
    const trimmed = newRoutineName.trim();
    if (!trimmed || addingBusy) return;
    setAddingBusy(true);
    setError(null);
    try {
      const routine = await createRoutine(trimmed, routines.length);
      setRoutines(prev => [...prev, routine].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedRoutineId(routine.id);
      setNewRoutineName('');
      setAddingRoutine(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add routine');
    } finally {
      setAddingBusy(false);
    }
  }

  async function handleContinue() {
    if (!selectedRoutineId || !date) return;
    if (date > todayLocalIso()) {
      setError('Date cannot be in the future.');
      return;
    }
    const routine = routines.find(r => r.id === selectedRoutineId);
    if (!routine) return;
    setError(null);
    setCreating(true);
    let createdId: string | null = null;
    try {
      const startedAt = new Date(`${date}T12:00:00`).toISOString();
      const finishedAt = new Date(`${date}T12:30:00`).toISOString();
      const session = await createSession(routine.id, startedAt);
      createdId = session.id;
      await finishSession(session.id, finishedAt);
      onNavigate({
        name: 'retroactiveWorkout',
        sessionId: session.id,
        routineId: routine.id,
        routineName: routine.name,
        date,
      });
    } catch (e) {
      if (createdId) {
        await deleteSession(createdId).catch(() => {});
      }
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

            {addingRoutine ? (
              <div className="row">
                <input
                  value={newRoutineName}
                  onChange={e => setNewRoutineName(e.target.value)}
                  placeholder="Routine name"
                  onKeyDown={e => { if (e.key === 'Enter') handleAddRoutine(); }}
                  autoFocus
                />
                <button
                  className="btn-primary btn-small"
                  onClick={handleAddRoutine}
                  disabled={addingBusy || !newRoutineName.trim()}
                >
                  {addingBusy ? '...' : 'Add'}
                </button>
                <button
                  className="btn-secondary btn-small"
                  onClick={() => { setAddingRoutine(false); setNewRoutineName(''); }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="btn-secondary"
                onClick={() => setAddingRoutine(true)}
                style={{ borderStyle: 'dashed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <Plus size={14} />
                Add routine
              </button>
            )}
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
