import { useState, useEffect } from 'react';
import { fetchRoutines, createRoutine } from '../api/routines';
import { saveActiveWorkout } from '../lib/sessionPersistence';
import { pushOutbox } from '../lib/outbox';
import { cachedFetch } from '../lib/cache';
import { groupIntoCategories } from '../lib/routineCategories';
import type { Routine, Screen } from '../types';
import { useToast } from '../hooks/useToast';

interface Props {
  onNavigate: (screen: Screen) => void;
}

export default function PickRoutineScreen({ onNavigate }: Props) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  useEffect(() => {
    cachedFetch('routines', fetchRoutines)
      .then(setRoutines)
      .catch(() => toast('Failed to load routines.'))
      .finally(() => setLoading(false));
  }, [toast]);

  // Starting a workout is fully local (AND-8): the session id is minted on
  // the client and the row syncs through the outbox, so a dead spot in the
  // gym never blocks the start.
  function handleSelectRoutine(routine: Routine) {
    if (creating) return;
    setCreating(true);
    const sessionId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    pushOutbox({
      table: 'sessions',
      op: 'upsert',
      rowId: sessionId,
      payload: { id: sessionId, routine_id: routine.id, started_at: startedAt },
    });
    const workout = {
      sessionId,
      routineId: routine.id,
      routineName: routine.name,
    };
    saveActiveWorkout({ ...workout, startedAt, sets: [] });
    onNavigate({ name: 'activeWorkout', ...workout });
  }

  async function handleAddRoutine() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const routine = await createRoutine(trimmed, routines.length);
      // Display order comes entirely from groupIntoCategories (which sorts),
      // so no need to keep this array sorted.
      setRoutines(prev => [...prev, routine]);
      setNewName('');
      setShowAdd(false);
    } catch {
      toast('Failed to create routine.');
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
        {groupIntoCategories(routines).map(category => {
          // Tapping a category starts its default variant — variant A, the
          // lowest variant_order (ROUTINE_VARIANTS_PLAN §6 Q1). Switching to
          // another variant happens in the plan view before the first set.
          const variantA = category.variants[0];
          const multi = category.variants.length > 1;
          return (
            <button
              key={category.name}
              className="btn-secondary"
              onClick={() => handleSelectRoutine(variantA)}
              disabled={creating}
              style={multi ? { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 } : undefined}
            >
              {multi ? (
                <>
                  <span>{category.name}</span>
                  <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                    {category.variants.map(v => v.variant_label ?? '·').join(' / ')}
                  </span>
                </>
              ) : (
                variantA.name
              )}
            </button>
          );
        })}
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
