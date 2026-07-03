import { useState, useEffect, useRef } from 'react';
import type { WorkoutSummary } from '../lib/summary';
import { useSettings } from '../hooks/useSettings';
import { kgToDisplay, formatWeight, unitLabel } from '../lib/units';

interface Props {
  routineName: string;
  durationSeconds: number;
  summary: WorkoutSummary;
  // Trimmed note text, or '' when left empty.
  onDone: (notes: string) => void;
  // Called on unmount when a typed note was never submitted (e.g. the user
  // back-swiped past the overlay); must be idempotent-safe with onDone.
  onSaveNotes: (notes: string) => void;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// The reward moment the loop used to lack: shown once on Finish, before
// returning Home. Pure display; the session is already finished and queued.
export default function SessionSummary({ routineName, durationSeconds, summary, onDone, onSaveNotes }: Props) {
  const { settings } = useSettings();
  const [notes, setNotes] = useState('');
  const submittedRef = useRef(false);
  const latestRef = useRef({ notes, onSaveNotes });
  latestRef.current = { notes, onSaveNotes };

  // A back-swipe unmounts the overlay without tapping Done; don't let a
  // typed note vanish with it.
  useEffect(() => () => {
    const { notes: pending, onSaveNotes: save } = latestRef.current;
    if (!submittedRef.current && pending.trim()) save(pending.trim());
  }, []);

  return (
    <div className="summary-overlay">
      <div className="summary-card">
        <h2>{routineName} done</h2>
        <div className="summary-stats">
          <div className="summary-stat">
            <span className="summary-stat-value">{formatDuration(durationSeconds)}</span>
            <span className="summary-stat-label">duration</span>
          </div>
          <div className="summary-stat">
            <span className="summary-stat-value">{summary.totalSets}</span>
            <span className="summary-stat-label">sets</span>
          </div>
          <div className="summary-stat">
            <span className="summary-stat-value">{Math.round(kgToDisplay(summary.tonnageKg, settings.unit)).toLocaleString()}</span>
            <span className="summary-stat-label">{unitLabel(settings.unit)} lifted</span>
          </div>
        </div>

        {summary.prCount > 0 && (
          <p className="summary-pr-line">
            {summary.prCount} PR{summary.prCount === 1 ? '' : 's'} today
          </p>
        )}

        <div className="mt-16">
          {summary.exercises.map(ex => (
            <div key={ex.name} className="row-between summary-exercise">
              <span className="text-small">{ex.name}</span>
              <span className="text-small text-muted">
                {ex.sets} × · top {formatWeight(ex.topWeightKg, settings.unit)} {unitLabel(settings.unit)} × {ex.topWeightReps}
                {ex.isPr && <span className="pr-badge">PR</span>}
              </span>
            </div>
          ))}
        </div>

        <textarea
          className="mt-16"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Notes: how did it go? Any niggles?"
          rows={3}
        />

        <button
          className="btn-primary mt-16"
          onClick={() => {
            submittedRef.current = true;
            onDone(notes.trim());
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}
