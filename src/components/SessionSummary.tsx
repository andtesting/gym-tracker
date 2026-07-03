import type { WorkoutSummary } from '../lib/summary';

interface Props {
  routineName: string;
  durationSeconds: number;
  summary: WorkoutSummary;
  onDone: () => void;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// The reward moment the loop used to lack: shown once on Finish, before
// returning Home. Pure display; the session is already finished and queued.
export default function SessionSummary({ routineName, durationSeconds, summary, onDone }: Props) {
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
            <span className="summary-stat-value">{summary.tonnageKg.toLocaleString()}</span>
            <span className="summary-stat-label">kg lifted</span>
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
                {ex.sets} × · top {ex.topWeightKg}kg × {ex.topWeightReps}
                {ex.isPr && <span className="pr-badge">PR</span>}
              </span>
            </div>
          ))}
        </div>

        <button className="btn-primary mt-16" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
