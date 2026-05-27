import type { WorkoutSet, SessionWithRoutine } from '../types';

interface Props {
  sets: WorkoutSet[];
  session: SessionWithRoutine | null;
  currentRoutineId: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

export default function LastSessionRef({ sets, session, currentRoutineId }: Props) {
  if (sets.length === 0 || !session) {
    return (
      <div>
        <div className="two-column-label">Last Time</div>
        <p className="text-small text-muted mt-8">No prior history</p>
      </div>
    );
  }

  const fromOtherRoutine = session.routine_id !== currentRoutineId;
  const routineName = session.routines?.name ?? 'Unnamed';

  return (
    <div>
      <div className="two-column-label">Last Time</div>
      <div className="text-small text-muted mt-8" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        <span>{formatDate(session.started_at)}</span>
        {fromOtherRoutine && (
          <>
            <span>·</span>
            <span style={{ color: session.routines?.color ?? 'var(--color-muted)' }}>
              {routineName}
            </span>
          </>
        )}
      </div>
      <div className="set-row set-row-header mt-8">
        <span>#</span><span>Reps</span><span>Weight</span>
      </div>
      {sets.map((set, i) => (
        <div key={set.id} className="set-row ref-column">
          <span>{i + 1}</span>
          <span>{set.reps}</span>
          <span>{set.weight_kg} kg</span>
        </div>
      ))}
    </div>
  );
}
