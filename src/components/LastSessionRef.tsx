import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ExerciseHistoryEntry } from '../types';
import { formatRest } from '../lib/timer';
import { useSettings } from '../hooks/useSettings';
import { formatWeight, unitHeader } from '../lib/units';

interface Props {
  entry: ExerciseHistoryEntry | null;
  currentRoutineId: string;
  index: number;
  total: number;
  onOlder: () => void;
  onNewer: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

export default function LastSessionRef({
  entry, currentRoutineId, index, total, onOlder, onNewer,
}: Props) {
  const { settings } = useSettings();
  const fromOtherRoutine = entry ? entry.session.routine_id !== currentRoutineId : false;
  const routineName = entry?.session.routines?.name ?? 'Unnamed';

  return (
    <div>
      <div className="set-col-title">
        <span className="two-column-label" style={{ border: 'none', padding: 0 }}>Last Time</span>
        {total > 1 && (
          <span className="row" style={{ gap: 2 }}>
            <button
              className="pager-btn"
              onClick={onNewer}
              disabled={index === 0}
              aria-label="Newer session"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-small text-muted" style={{ minWidth: 28, textAlign: 'center' }}>
              {index + 1}/{total}
            </span>
            <button
              className="pager-btn"
              onClick={onOlder}
              disabled={index >= total - 1}
              aria-label="Older session"
            >
              <ChevronRight size={14} />
            </button>
          </span>
        )}
      </div>

      <div className="set-col-meta">
        {entry ? (
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            <span>{formatDate(entry.session.started_at)}</span>
            {fromOtherRoutine && (
              <>
                <span>·</span>
                <span style={{ color: entry.session.routines?.color ?? 'var(--color-muted)' }}>
                  {routineName}
                </span>
              </>
            )}
          </span>
        ) : (
          <span>No prior history</span>
        )}
      </div>

      {entry && (
        <>
          <div className="set-row set-row-header" style={{ gridTemplateColumns: '18px minmax(0,1fr) minmax(0,1fr) 34px', gap: 4 }}>
            <span>#</span><span>Reps</span><span>{unitHeader(settings.unit)}</span><span>Rest</span>
          </div>
          {entry.sets.map((set, i) => (
            <div key={set.id} className="set-row ref-column" style={{ gridTemplateColumns: '18px minmax(0,1fr) minmax(0,1fr) 34px', gap: 4 }}>
              <span>{i + 1}</span>
              <span>{set.reps}</span>
              <span>{formatWeight(set.weight_kg, settings.unit)}</span>
              <span>{formatRest(set.rest_seconds)}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
