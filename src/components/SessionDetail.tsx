import { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown, Trash2, Plus } from 'lucide-react';
import { fetchSessionSets, fetchSession, deleteSession, updateSessionNotes } from '../api/sessions';
import { createSet, updateSet, deleteSet } from '../api/sets';
import type { Exercise, Session, SetWithExercise } from '../types';
import { formatRest } from '../lib/timer';
import { useSettings } from '../hooks/useSettings';
import { formatWeight, displayToKg, unitHeader, unitLabel } from '../lib/units';
import { normalizeRpe } from '../lib/rpe';
import ExerciseSearch from './ExerciseSearch';
import ConfirmSheet from './ConfirmSheet';
import { useToast } from '../hooks/useToast';

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
  const [editedSets, setEditedSets] = useState<Record<string, { reps: string; weight_kg: string; rpe: string; notes: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [addingExercise, setAddingExercise] = useState(false);
  const [pendingExercise, setPendingExercise] = useState<Exercise | null>(null);
  const [pendingReps, setPendingReps] = useState('10');
  const [pendingWeight, setPendingWeight] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [confirm, setConfirm] = useState<{ title: string; message?: string; label: string; action: () => void } | null>(null);
  const toast = useToast();
  const { settings } = useSettings();
  const unit = settings.unit;

  useEffect(() => {
    let cancelled = false;
    function load() {
      // The Retry toast action can outlive this screen; do nothing once gone.
      if (cancelled) return;
      setLoading(true);
      Promise.all([fetchSessionSets(sessionId), fetchSession(sessionId)])
        .then(([data, sess]) => {
          if (cancelled) return;
          setSets(data);
          setSession(sess);
        })
        .catch(() => {
          if (!cancelled) toast('Failed to load session.', { label: 'Retry', onClick: load });
        })
        .finally(() => { if (!cancelled) setLoading(false); });
    }
    load();
    return () => { cancelled = true; };
  }, [sessionId, toast]);

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
    const initial: Record<string, { reps: string; weight_kg: string; rpe: string; notes: string }> = {};
    for (const set of sets) {
      initial[set.id] = {
        reps: String(set.reps),
        weight_kg: formatWeight(set.weight_kg, unit),
        rpe: set.rpe == null ? '' : String(set.rpe),
        notes: set.notes ?? '',
      };
    }
    setEditedSets(initial);
    setNotesDraft(session?.notes ?? '');
    setEditing(true);
  }

  function handleCancelEdit() {
    setEditedSets({});
    setEditing(false);
  }

  async function handleSwapExercises(groupIndexA: number, groupIndexB: number) {
    if (groupIndexB < 0 || groupIndexB >= grouped.length || swapping) return;

    setSwapping(true);
    setError(null);
    try {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder exercises.');
    } finally {
      const refreshed = await fetchSessionSets(sessionId);
      setSets(refreshed);
      setSwapping(false);
    }
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
        const newWeightKg = displayToKg(parseFloat(edited.weight_kg), unit);
        const newRpe = normalizeRpe(edited.rpe);
        const newNotes = edited.notes.trim() === '' ? null : edited.notes.trim();
        if (newReps !== set.reps || newWeightKg !== set.weight_kg || newRpe !== (set.rpe ?? null) || newNotes !== (set.notes ?? null)) {
          await updateSet(set.id, { reps: newReps, weight_kg: newWeightKg, rpe: newRpe, notes: newNotes });
        }
      }
      const trimmedNotes = notesDraft.trim();
      if (trimmedNotes !== (session?.notes ?? '')) {
        await updateSessionNotes(sessionId, trimmedNotes === '' ? null : trimmedNotes);
        setSession(prev => (prev ? { ...prev, notes: trimmedNotes === '' ? null : trimmedNotes } : prev));
      }
      const refreshed = await fetchSessionSets(sessionId);
      setSets(refreshed);
      setEditing(false);
      setEditedSets({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes.');
    }
  }

  function handleDeleteSet(setId: string) {
    setConfirm({
      title: 'Delete this set?',
      label: 'Delete set',
      action: async () => {
        setConfirm(null);
        await deleteSet(setId);
        setSets(prev => prev.filter(s => s.id !== setId));
        setEditedSets(prev => {
          const next = { ...prev };
          delete next[setId];
          return next;
        });
      },
    });
  }

  function handleDeleteSession() {
    setConfirm({
      title: 'Delete this entire session?',
      message: 'This cannot be undone.',
      label: 'Delete session',
      action: async () => {
        setConfirm(null);
        await deleteSession(sessionId);
        onBack();
      },
    });
  }

  async function handleAddRetroactiveSet() {
    if (!pendingExercise || submitting) return;
    const reps = parseInt(pendingReps, 10);
    const weight = parseFloat(pendingWeight);
    if (isNaN(reps) || isNaN(weight)) {
      setError('Invalid reps or weight.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const maxOrder = sets.length > 0 ? Math.max(...sets.map(s => s.set_order)) : 0;
      const backdatedCreatedAt = sets.length > 0 ? sets[0].created_at : undefined;
      await createSet({
        session_id: sessionId,
        exercise_id: pendingExercise.id,
        set_order: maxOrder + 1,
        reps,
        weight_kg: displayToKg(weight, unit),
        set_duration_seconds: null,
        started_at: null,
        completed_at: null,
        created_at: backdatedCreatedAt,
      });
      const refreshed = await fetchSessionSets(sessionId);
      setSets(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add set.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleSelectExercise(exercise: Exercise) {
    setPendingExercise(exercise);
    setAddingExercise(false);
  }

  function updateEditField(setId: string, field: 'reps' | 'weight_kg' | 'rpe' | 'notes', value: string) {
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

      {editing && session ? (
        <div className="mb-16">
          <label className="text-small text-muted">Session notes</label>
          <textarea
            value={notesDraft}
            onChange={e => setNotesDraft(e.target.value)}
            placeholder="How did it go?"
            rows={3}
          />
        </div>
      ) : (
        session?.notes && (
          <p className="session-notes mb-16">{session.notes}</p>
        )
      )}

      {grouped.map((group, i) => (
        <div key={i} className="mb-16">
          <div className="row-between">
            <h3>{group.name}</h3>
            {editing && (
              <div className="row" style={{ gap: 4 }}>
                <button
                  className="btn-small btn-secondary"
                  style={{ padding: '4px', minHeight: 0, lineHeight: 0 }}
                  onClick={() => handleSwapExercises(i, i - 1)}
                  disabled={i === 0 || swapping}
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  className="btn-small btn-secondary"
                  style={{ padding: '4px', minHeight: 0, lineHeight: 0 }}
                  onClick={() => handleSwapExercises(i, i + 1)}
                  disabled={i === grouped.length - 1 || swapping}
                >
                  <ChevronDown size={16} />
                </button>
              </div>
            )}
          </div>
          <div className="set-row set-row-header mt-8" style={{ gridTemplateColumns: editing ? '50px 1fr 1fr 52px 40px' : '50px 1fr 1fr 44px 1fr' }}>
            <span>Set</span><span>Reps</span><span>{unitHeader(unit)}</span><span>RPE</span>
            {editing ? <span /> : <span>Rest</span>}
          </div>
          {group.sets.map((set, j) => (
            <div key={set.id}>
            <div className="set-row" style={{ gridTemplateColumns: editing ? '50px 1fr 1fr 52px 40px' : '50px 1fr 1fr 44px 1fr' }}>
              <span>{j + 1}</span>
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
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editedSets[set.id]?.rpe ?? ''}
                    placeholder="–"
                    onChange={e => updateEditField(set.id, 'rpe', e.target.value)}
                    style={{ minHeight: 32, padding: '4px 6px', fontSize: '0.875rem' }}
                  />
                  <button
                    style={{
                      color: 'var(--color-danger)',
                      background: 'none',
                      minHeight: 0,
                      padding: '2px 6px',
                      lineHeight: 0,
                    }}
                    onClick={() => handleDeleteSet(set.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              ) : (
                <>
                  <span>{set.reps}</span>
                  <span>{formatWeight(set.weight_kg, unit)}</span>
                  <span className="text-muted">{set.rpe ?? ''}</span>
                  <span className="text-muted">{formatRest(set.rest_seconds)}</span>
                </>
              )}
            </div>
            {editing ? (
              <input
                type="text"
                value={editedSets[set.id]?.notes ?? ''}
                placeholder="Set note (optional)"
                onChange={e => updateEditField(set.id, 'notes', e.target.value)}
                style={{ width: '100%', minHeight: 32, padding: '4px 6px', fontSize: '0.875rem', marginBottom: 4 }}
              />
            ) : (
              set.notes && <div className="set-note" style={{ paddingLeft: 50 }}>{set.notes}</div>
            )}
            </div>
          ))}
        </div>
      ))}

      {editing && (
        <div className="mt-16">
          <h3 className="mb-16">Add Exercise</h3>
          {addingExercise ? (
            <ExerciseSearch onSelect={handleSelectExercise} />
          ) : pendingExercise ? (
            <div className="card">
              <div className="row-between mb-16">
                <strong>{pendingExercise.name}</strong>
                <button
                  className="btn-secondary btn-small"
                  onClick={() => { setPendingExercise(null); setPendingWeight(''); }}
                >
                  Change
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label className="text-small text-muted">Reps</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={pendingReps}
                    onChange={e => setPendingReps(e.target.value)}
                    style={{ width: '100%', minHeight: 36, padding: '4px 8px', fontSize: '0.875rem' }}
                  />
                </div>
                <div>
                  <label className="text-small text-muted">Weight ({unitLabel(unit)})</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={pendingWeight}
                    onChange={e => setPendingWeight(e.target.value)}
                    style={{ width: '100%', minHeight: 36, padding: '4px 8px', fontSize: '0.875rem' }}
                  />
                </div>
              </div>
              <button
                className="btn-primary btn-small mt-8"
                style={{ width: '100%' }}
                onClick={handleAddRetroactiveSet}
                disabled={submitting}
              >
                <Plus size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                {submitting ? 'Adding...' : 'Add Set'}
              </button>
            </div>
          ) : (
            <button
              className="btn-secondary"
              style={{ width: '100%' }}
              onClick={() => setAddingExercise(true)}
            >
              <Plus size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              Search Exercise to Add
            </button>
          )}
        </div>
      )}

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

      {confirm && (
        <ConfirmSheet
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.label}
          onConfirm={confirm.action}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
