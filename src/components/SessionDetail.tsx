import { useState, useEffect } from 'react';
import { fetchSessionSets, deleteSession } from '../api/sessions';
import { updateSet, deleteSet } from '../api/sets';
import type { SetWithExercise } from '../types';

interface Props {
  sessionId: string;
  onBack: () => void;
}

interface ExerciseGroup {
  name: string;
  sets: SetWithExercise[];
}

export default function SessionDetail({ sessionId, onBack }: Props) {
  const [sets, setSets] = useState<SetWithExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editedSets, setEditedSets] = useState<Record<string, { reps: string; weight_kg: string }>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSessionSets(sessionId)
      .then(setSets)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sessionId]);

  const grouped: ExerciseGroup[] = [];
  for (const set of sets) {
    const name = set.exercises?.name ?? 'Unnamed Exercise';
    const last = grouped[grouped.length - 1];
    if (last && last.name === name) {
      last.sets.push(set);
    } else {
      grouped.push({ name, sets: [set] });
    }
  }

  function handleStartEdit() {
    const initial: Record<string, { reps: string; weight_kg: string }> = {};
    for (const set of sets) {
      initial[set.id] = { reps: String(set.reps), weight_kg: String(set.weight_kg) };
    }
    setEditedSets(initial);
    setEditing(true);
  }

  function handleCancelEdit() {
    setEditedSets({});
    setEditing(false);
  }

  async function handleSwapExercises(groupIndexA: number, groupIndexB: number) {
    if (groupIndexB < 0 || groupIndexB >= grouped.length) return;

    const reordered = [...grouped];
    [reordered[groupIndexA], reordered[groupIndexB]] = [reordered[groupIndexB], reordered[groupIndexA]];

    const updates: Promise<void>[] = [];
    let order = 1;
    for (const group of reordered) {
      for (const s of group.sets) {
        if (s.set_order !== order) {
          updates.push(updateSet(s.id, { set_order: order }));
        }
        order++;
      }
    }

    await Promise.all(updates);
    const refreshed = await fetchSessionSets(sessionId);
    setSets(refreshed);
  }

  async function handleSave() {
    setError(null);
    for (const set of sets) {
      const edited = editedSets[set.id];
      if (!edited) continue;
      const newReps = parseInt(edited.reps, 10);
      const newWeight = parseFloat(edited.weight_kg);
      if (isNaN(newReps) || isNaN(newWeight)) {
        setError('Invalid number in reps or weight.');
        return;
      }
    }
    try {
      for (const set of sets) {
        const edited = editedSets[set.id];
        if (!edited) continue;
        const newReps = parseInt(edited.reps, 10);
        const newWeight = parseFloat(edited.weight_kg);
        if (newReps !== set.reps || newWeight !== set.weight_kg) {
          await updateSet(set.id, { reps: newReps, weight_kg: newWeight });
        }
      }
      const refreshed = await fetchSessionSets(sessionId);
      setSets(refreshed);
      setEditing(false);
      setEditedSets({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes.');
    }
  }

  async function handleDeleteSet(setId: string) {
    if (!window.confirm('Delete this set?')) return;
    await deleteSet(setId);
    setSets(prev => prev.filter(s => s.id !== setId));
    setEditedSets(prev => {
      const next = { ...prev };
      delete next[setId];
      return next;
    });
  }

  async function handleDeleteSession() {
    if (!window.confirm('Delete this entire session? This cannot be undone.')) return;
    await deleteSession(sessionId);
    onBack();
  }

  function updateEditField(setId: string, field: 'reps' | 'weight_kg', value: string) {
    setEditedSets(prev => ({
      ...prev,
      [setId]: { ...prev[setId], [field]: value },
    }));
  }

  return (
    <div>
      <div className="row-between mb-16">
        <button className="btn-secondary btn-small" onClick={onBack}>Back</button>
        {!editing ? (
          <button className="btn-secondary btn-small" onClick={handleStartEdit}>Edit</button>
        ) : (
          <div className="row">
            <button className="btn-secondary btn-small" onClick={handleCancelEdit}>Cancel</button>
            <button className="btn-primary btn-small" onClick={handleSave}>Save</button>
          </div>
        )}
      </div>

      {loading && <p className="text-muted text-center">Loading...</p>}
      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem' }} className="mb-16">{error}</p>}

      {grouped.map((group, i) => (
        <div key={i} className="mb-16">
          <div className="row-between">
            <h3>{group.name}</h3>
            {editing && (
              <div className="row" style={{ gap: 4 }}>
                <button
                  className="btn-small btn-secondary"
                  style={{ padding: '2px 8px', minHeight: 0, fontSize: '0.875rem' }}
                  onClick={() => handleSwapExercises(i, i - 1)}
                  disabled={i === 0}
                >
                  ↑
                </button>
                <button
                  className="btn-small btn-secondary"
                  style={{ padding: '2px 8px', minHeight: 0, fontSize: '0.875rem' }}
                  onClick={() => handleSwapExercises(i, i + 1)}
                  disabled={i === grouped.length - 1}
                >
                  ↓
                </button>
              </div>
            )}
          </div>
          <div className="set-row set-row-header mt-8">
            <span>Set</span><span>Type</span><span>Reps</span><span>Weight</span>
            {editing && <span />}
          </div>
          {group.sets.map((set, j) => (
            <div key={set.id} className="set-row" style={editing ? { gridTemplateColumns: '50px 1fr 1fr 1fr 40px' } : undefined}>
              <span>{j + 1}</span>
              <span>{set.set_type}</span>
              {editing ? (
                <>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={editedSets[set.id]?.reps ?? ''}
                    onChange={e => updateEditField(set.id, 'reps', e.target.value)}
                    style={{ minHeight: 32, padding: '4px 6px', fontSize: '0.875rem' }}
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editedSets[set.id]?.weight_kg ?? ''}
                    onChange={e => updateEditField(set.id, 'weight_kg', e.target.value)}
                    style={{ minHeight: 32, padding: '4px 6px', fontSize: '0.875rem' }}
                  />
                  <button
                    style={{
                      color: 'var(--color-danger)',
                      background: 'none',
                      minHeight: 0,
                      padding: '2px 6px',
                      fontSize: '1rem',
                    }}
                    onClick={() => handleDeleteSet(set.id)}
                  >
                    X
                  </button>
                </>
              ) : (
                <>
                  <span>{set.reps}</span>
                  <span>{set.weight_kg} kg</span>
                </>
              )}
            </div>
          ))}
        </div>
      ))}

      <button
        className="btn-small mt-16"
        style={{
          color: 'var(--color-danger)',
          background: 'none',
          border: '1px solid var(--color-danger)',
          width: '100%',
        }}
        onClick={handleDeleteSession}
      >
        Delete Session
      </button>
    </div>
  );
}
