import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Exercise, WorkoutSet, ExerciseHistoryEntry } from '../types';
import { formatRest } from '../lib/timer';
import LastSessionRef from './LastSessionRef';

interface Props {
  exercise: Exercise;
  loggedSets: WorkoutSet[];
  histories: ExerciseHistoryEntry[];
  currentRoutineId: string;
  timerMode: 'idle' | 'rest' | 'set';
  retroactive?: boolean;
  onStartSet: () => void;
  onLogSet: (data: { reps: number; weight_kg: number }) => Promise<void>;
  onEditSet: (setId: string, updates: { reps?: number; weight_kg?: number }) => Promise<void>;
  onDeleteSet: (setId: string) => Promise<void>;
  onRemoveExercise: () => void;
  onBackToPlan?: () => void;
}

export default function SetLogger({
  exercise,
  loggedSets,
  histories,
  currentRoutineId,
  timerMode,
  retroactive = false,
  onStartSet,
  onLogSet,
  onEditSet,
  onDeleteSet,
  onRemoveExercise,
  onBackToPlan,
}: Props) {
  const [reps, setReps] = useState('');
  const [weight, setWeight] = useState('');
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [editReps, setEditReps] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [histIndex, setHistIndex] = useState(0);

  const selectedHistory = histories[histIndex] ?? null;

  async function handleLog() {
    if (submitting) return;
    const r = parseInt(reps, 10);
    const w = parseFloat(weight);
    if (isNaN(r) || isNaN(w) || r <= 0 || w < 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await onLogSet({ reps: r, weight_kg: w });
      setReps('');
      setWeight('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to log set');
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(set: WorkoutSet) {
    setEditingSetId(set.id);
    setEditReps(String(set.reps));
    setEditWeight(String(set.weight_kg));
    setError(null);
  }

  async function commitEdit(set: WorkoutSet) {
    const r = parseInt(editReps, 10);
    const w = parseFloat(editWeight);
    if (isNaN(r) || isNaN(w) || r === set.reps && w === set.weight_kg) {
      setEditingSetId(null);
      return;
    }
    try {
      await onEditSet(set.id, { reps: r, weight_kg: w });
      setEditingSetId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save edit');
      // Keep the editor open so the user can retry or revert.
    }
  }

  async function handleDelete(setId: string) {
    if (!window.confirm('Delete this set?')) return;
    try {
      await onDeleteSet(setId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete set');
    }
  }

  const inSet = timerMode === 'set';
  const canLog = retroactive || inSet;

  return (
    <div className="card">
      <div className="exercise-header">
        <div className="row" style={{ gap: 8 }}>
          {onBackToPlan && (
            <button className="btn-secondary btn-small" onClick={onBackToPlan}>
              ← Plan
            </button>
          )}
          <h3>{exercise.name}</h3>
        </div>
        <button className="btn-secondary btn-small" onClick={onRemoveExercise}>Remove</button>
      </div>

      <div className="two-column mt-8">
        <div>
          <LastSessionRef
            entry={selectedHistory}
            currentRoutineId={currentRoutineId}
            index={histIndex}
            total={histories.length}
            onOlder={() => setHistIndex(i => Math.min(i + 1, histories.length - 1))}
            onNewer={() => setHistIndex(i => Math.max(i - 1, 0))}
          />
        </div>
        <div>
          <div className="set-col-title">
            <span className="two-column-label" style={{ border: 'none', padding: 0 }}>Current</span>
          </div>
          <div className="set-col-meta">Today</div>
          {loggedSets.length === 0 ? (
            <p className="text-small text-muted">No sets yet</p>
          ) : (
            <>
              <div className="set-row set-row-header" style={{ gridTemplateColumns: '18px minmax(0,1fr) minmax(0,1fr) 34px 20px', gap: 4 }}>
                <span>#</span><span>Reps</span><span>Wt</span><span>Rest</span><span />
              </div>
              {loggedSets.map((set, i) => {
                const editing = editingSetId === set.id;
                const rest = i === 0 ? '' : formatRest(loggedSets[i - 1].rest_seconds);
                return (
                  <div
                    key={set.id}
                    className="set-row"
                    style={{ gridTemplateColumns: '18px minmax(0,1fr) minmax(0,1fr) 34px 20px', gap: 4 }}
                  >
                    <span>{i + 1}</span>
                    {editing ? (
                      <>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={editReps}
                          onChange={e => setEditReps(e.target.value)}
                          onBlur={() => commitEdit(set)}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                          autoFocus
                          style={{ minHeight: 28, padding: '2px 4px', fontSize: '0.8125rem' }}
                        />
                        <input
                          type="text"
                          inputMode="decimal"
                          value={editWeight}
                          onChange={e => setEditWeight(e.target.value)}
                          onBlur={() => commitEdit(set)}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                          style={{ minHeight: 28, padding: '2px 4px', fontSize: '0.8125rem' }}
                        />
                      </>
                    ) : (
                      <>
                        <span onClick={() => startEdit(set)} style={{ cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: 2 }}>
                          {set.reps}
                        </span>
                        <span onClick={() => startEdit(set)} style={{ cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: 2 }}>
                          {set.weight_kg}kg
                        </span>
                      </>
                    )}
                    <span className="text-muted" style={{ fontSize: '0.75rem' }}>{rest}</span>
                    <button
                      onClick={() => handleDelete(set.id)}
                      style={{
                        color: 'var(--color-danger)',
                        background: 'none',
                        minHeight: 0,
                        padding: 2,
                        lineHeight: 0,
                      }}
                      aria-label="Delete set"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {error && (
        <p className="text-small mt-8" style={{ color: 'var(--color-danger)' }}>{error}</p>
      )}

      <div className="mt-16">
        {!canLog ? (
          <button
            className="btn-primary mb-16"
            onClick={onStartSet}
            disabled={submitting}
          >
            Start Set
          </button>
        ) : (
          <button
            className="btn-primary mb-16"
            onClick={handleLog}
            disabled={submitting}
            style={{ background: 'var(--color-success)' }}
          >
            {submitting ? 'Saving…' : retroactive ? 'Add Set' : 'Log Set'}
          </button>
        )}

        <div className="row">
          <input
            type="text"
            inputMode="numeric"
            value={reps}
            onChange={e => setReps(e.target.value)}
            placeholder="Reps"
            style={{ flex: 1 }}
          />
          <input
            type="text"
            inputMode="decimal"
            value={weight}
            onChange={e => setWeight(e.target.value)}
            placeholder="Weight (kg)"
            style={{ flex: 1 }}
          />
        </div>
      </div>
    </div>
  );
}
