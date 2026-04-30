import { useState, useEffect } from 'react';
import { fetchRoutines, createRoutine } from '../api/routines';
import { createSession } from '../api/sessions';
import type { Routine, Screen } from '../types';

interface Props {
  onNavigate: (screen: Screen) => void;
}

export default function PickRoutineScreen({ onNavigate }: Props) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchRoutines()
      .then(setRoutines)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSelectRoutine(routine: Routine) {
    setCreating(true);
    try {
      const session = await createSession(routine.id);
      onNavigate({
        name: 'activeWorkout',
        sessionId: session.id,
        routineId: routine.id,
        routineName: routine.name,
      });
    } catch {
      setCreating(false);
    }
  }

  async function handleAddRoutine() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const routine = await createRoutine(trimmed);
      setRoutines(prev => [...prev, routine].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName('');
      setShowAdd(false);
    } catch {
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <button className="btn-secondary btn-small mb-16" onClick={() => onNavigate({ name: 'home' })}>
        Back
      </button>
      <h1 className="mb-16">Pick Routine</h1>

      {loading && <p className="text-muted text-center">Loading...</p>}

      <div className="stack">
        {routines.map(routine => (
          <button
            key={routine.id}
            className="btn-secondary"
            onClick={() => handleSelectRoutine(routine)}
            disabled={creating}
          >
            {routine.name}
          </button>
        ))}
      </div>

      {!showAdd ? (
        <button
          className="btn-secondary mt-16"
          onClick={() => setShowAdd(true)}
          style={{ width: '100%', borderStyle: 'dashed' }}
        >
          + Add Routine
        </button>
      ) : (
        <div className="row mt-16">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Routine name"
            onKeyDown={e => e.key === 'Enter' && handleAddRoutine()}
            autoFocus
          />
          <button className="btn-primary btn-small" onClick={handleAddRoutine} disabled={creating}>
            Add
          </button>
        </div>
      )}
    </div>
  );
}
