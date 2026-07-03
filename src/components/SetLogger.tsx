import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Exercise, WorkoutSet, ExerciseHistoryEntry } from '../types';
import { formatRest } from '../lib/timer';
import { isWeightPr } from '../lib/summary';
import { useSettings } from '../hooks/useSettings';
import { useToast } from '../hooks/useToast';
import { formatWeight, displayToKg, unitHeader, unitLabel } from '../lib/units';
import { normalizeRpe } from '../lib/rpe';
import type { WeightUnit } from '../lib/settings';
import LastSessionRef from './LastSessionRef';
import QuickCapture from './QuickCapture';

// Most sets repeat (or barely nudge) the previous set's numbers, so the inputs
// prefill rather than start empty (AND-42): previous set of this exercise
// today, else the corresponding set from the most recent prior session.
// The weight string is in DISPLAY units; storage stays kg.
function prefillValues(
  loggedSets: WorkoutSet[],
  histories: ExerciseHistoryEntry[],
  unit: WeightUnit,
): { reps: string; weight: string } | null {
  const last = loggedSets[loggedSets.length - 1];
  if (last) return { reps: String(last.reps), weight: formatWeight(last.weight_kg, unit) };
  const prior = histories[0];
  const s = prior ? (prior.sets[loggedSets.length] ?? prior.sets[prior.sets.length - 1]) : undefined;
  if (s) return { reps: String(s.reps), weight: formatWeight(s.weight_kg, unit) };
  return null;
}

interface Props {
  exercise: Exercise;
  loggedSets: WorkoutSet[];
  histories: ExerciseHistoryEntry[];
  currentRoutineId: string;
  timerMode: 'idle' | 'rest' | 'set';
  retroactive?: boolean;
  onStartSet: () => void;
  onLogSet: (data: { reps: number; weight_kg: number; rpe: number | null }) => Promise<void>;
  onEditSet: (setId: string, updates: { reps?: number; weight_kg?: number; rpe?: number | null }) => Promise<void>;
  onDeleteSet: (setId: string) => Promise<void>;
  onRestoreSet: (set: WorkoutSet) => boolean;
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
  onRestoreSet,
  onRemoveExercise,
  onBackToPlan,
}: Props) {
  const toast = useToast();
  const { settings } = useSettings();
  const unit = settings.unit;
  const [initialPrefill] = useState(() => prefillValues(loggedSets, histories, unit));
  const [reps, setReps] = useState(initialPrefill?.reps ?? '');
  const [weight, setWeight] = useState(initialPrefill?.weight ?? '');
  // RPE is deliberately NOT prefilled from the previous set: effort is the one
  // number that genuinely changes set to set, and a stale carried-over rating
  // is worse than none. One tap to rate, or log unrated.
  const [rpe, setRpe] = useState<number | null>(null);
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [editReps, setEditReps] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [editRpe, setEditRpe] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [histIndex, setHistIndex] = useState(0);

  const selectedHistory = histories[histIndex] ?? null;

  // Histories load lazily for freshly added exercises; when they first arrive,
  // apply the prefill if the user hasn't typed anything yet. Render-time state
  // adjustment (not an effect) per the "state from previous render" pattern;
  // one-shot so a deliberately cleared field is never overwritten afterwards.
  const [prefillApplied, setPrefillApplied] = useState(histories.length > 0);
  if (!prefillApplied && histories.length > 0) {
    setPrefillApplied(true);
    if (reps === '' && weight === '') {
      const p = prefillValues(loggedSets, histories, unit);
      if (p) {
        setReps(p.reps);
        setWeight(p.weight);
      }
    }
  }

  async function handleLog() {
    if (submitting) return;
    const r = parseInt(reps, 10);
    const w = parseFloat(weight);
    if (isNaN(r) || isNaN(w) || r <= 0 || w < 0) {
      setError('Enter reps and weight first.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onLogSet({ reps: r, weight_kg: displayToKg(w, unit), rpe });
      // Keep the just-logged values as the next set's prefill (repeat sets are
      // the majority case), normalised through the parsers. RPE resets: see
      // the state declaration.
      setReps(String(r));
      setWeight(String(w));
      setRpe(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to log set');
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(set: WorkoutSet) {
    setEditingSetId(set.id);
    setEditReps(String(set.reps));
    setEditWeight(formatWeight(set.weight_kg, unit));
    setEditRpe(set.rpe == null ? '' : String(set.rpe));
    setError(null);
  }

  async function commitEdit(set: WorkoutSet) {
    const r = parseInt(editReps, 10);
    const w = parseFloat(editWeight);
    const wKg = isNaN(w) ? NaN : displayToKg(w, unit);
    const newRpe = normalizeRpe(editRpe);
    // set.rpe ?? null: pre-deploy localStorage records lack the key entirely.
    if (isNaN(r) || isNaN(wKg) || (r === set.reps && wKg === set.weight_kg && newRpe === (set.rpe ?? null))) {
      setEditingSetId(null);
      return;
    }
    try {
      await onEditSet(set.id, { reps: r, weight_kg: wKg, rpe: newRpe });
      setEditingSetId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save edit');
      // Keep the editor open so the user can retry or revert.
    }
  }

  // Delete-then-undo beats confirm-first mid-workout: no modal in the way,
  // and a mistaken tap is one Undo away for the toast's lifetime.
  async function handleDelete(set: WorkoutSet) {
    try {
      await onDeleteSet(set.id);
      toast('Set deleted.', {
        label: 'Undo',
        onClick: () => {
          if (!onRestoreSet(set)) toast('Could not undo this set.');
        },
      });
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
              <div className="set-row set-row-header" style={{ gridTemplateColumns: '18px minmax(0,1fr) minmax(0,1fr) 26px 34px 20px', gap: 4 }}>
                <span>#</span><span>Reps</span><span>{unitHeader(unit)}</span><span>RPE</span><span>Rest</span><span />
              </div>
              {loggedSets.map((set, i) => {
                const editing = editingSetId === set.id;
                const rest = formatRest(set.rest_seconds);
                // A set only badges when it beats history AND every earlier
                // set today: the record can be broken twice in a session, but
                // a lighter follow-up set is not a PR.
                const maxEarlierToday = Math.max(0, ...loggedSets.slice(0, i).map(s => s.weight_kg));
                const isPr = isWeightPr(set, histories) && set.weight_kg > maxEarlierToday;
                return (
                  <div
                    key={set.id}
                    className="set-row"
                    style={{ gridTemplateColumns: '18px minmax(0,1fr) minmax(0,1fr) 26px 34px 20px', gap: 4 }}
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
                        {/* RPE input takes the RPE+Rest cells; rest is not editable anyway. */}
                        <input
                          type="text"
                          inputMode="decimal"
                          value={editRpe}
                          placeholder="RPE"
                          onChange={e => setEditRpe(e.target.value)}
                          onBlur={() => commitEdit(set)}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                          style={{ minHeight: 28, padding: '2px 4px', fontSize: '0.8125rem', gridColumn: 'span 2' }}
                        />
                      </>
                    ) : (
                      <>
                        <span onClick={() => startEdit(set)} style={{ cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: 2 }}>
                          {set.reps}
                        </span>
                        <span onClick={() => startEdit(set)} style={{ cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: 2, whiteSpace: 'nowrap' }}>
                          {formatWeight(set.weight_kg, unit)}
                          {isPr && <span className="pr-badge">PR</span>}
                        </span>
                        <span
                          className="text-muted"
                          onClick={() => startEdit(set)}
                          style={{ fontSize: '0.75rem', cursor: 'pointer' }}
                        >
                          {set.rpe ?? ''}
                        </span>
                        <span className="text-muted" style={{ fontSize: '0.75rem' }}>{rest}</span>
                      </>
                    )}
                    <button
                      onClick={() => handleDelete(set)}
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
            {submitting
              ? 'Saving…'
              : `${retroactive ? 'Add Set' : 'Log Set'}${reps && weight ? ` · ${reps} × ${weight} ${unitLabel(unit)}` : ''}`}
          </button>
        )}

        {/* Keyed on the logged count so each logged set remounts the pad:
            closes it and restores replace-on-first-digit for the next set. */}
        <QuickCapture
          key={loggedSets.length}
          reps={reps}
          weight={weight}
          rpe={rpe}
          onRepsChange={setReps}
          onWeightChange={setWeight}
          onRpeChange={setRpe}
        />
      </div>
    </div>
  );
}
