import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { fetchRecentRoutineSessions } from '../api/sessions';
import type { RoutineSessionHistory, SetWithExercise } from '../types';

interface Props {
  routineId: string;
  routineName: string;
  excludeSessionId?: string;
  onClose: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

interface ExerciseGroup {
  name: string;
  sets: SetWithExercise[];
}

function groupSets(sets: SetWithExercise[]): ExerciseGroup[] {
  const groups: ExerciseGroup[] = [];
  for (const set of sets) {
    const name = set.exercises?.name ?? 'Unnamed Exercise';
    const last = groups[groups.length - 1];
    if (last && last.name === name) {
      last.sets.push(set);
    } else {
      groups.push({ name, sets: [set] });
    }
  }
  return groups;
}

export default function SessionHistorySheet({
  routineId, routineName, excludeSessionId, onClose,
}: Props) {
  const [history, setHistory] = useState<RoutineSessionHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchRecentRoutineSessions(routineId, 6)
      .then(data => {
        const filtered = excludeSessionId
          ? data.filter(d => d.session.id !== excludeSessionId)
          : data;
        const trimmed = filtered.slice(0, 5);
        setHistory(trimmed);
        if (trimmed.length > 0) setExpandedId(trimmed[0].session.id);
      })
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [routineId, excludeSessionId]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Workout history"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.45)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--color-bg)',
          width: '100%',
          maxWidth: 480,
          maxHeight: '85dvh',
          borderRadius: '12px 12px 0 0',
          padding: 16,
          overflowY: 'auto',
          boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.15)',
        }}
      >
        <div className="row-between mb-16" style={{ position: 'sticky', top: -16, background: 'var(--color-bg)', paddingTop: 16, marginTop: -16, marginLeft: -16, marginRight: -16, paddingLeft: 16, paddingRight: 16, borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <h2>{routineName} · Prior sessions</h2>
            <p className="text-small text-muted">Last {Math.max(history.length, 0)} session{history.length === 1 ? '' : 's'}</p>
          </div>
          <button
            className="btn-secondary btn-small"
            onClick={onClose}
            aria-label="Close history"
            style={{ padding: 6, minHeight: 36 }}
          >
            <X size={16} />
          </button>
        </div>

        {loading && <p className="text-muted text-center mt-16">Loading…</p>}

        {!loading && history.length === 0 && (
          <p className="text-muted text-center mt-16">
            No prior sessions for this routine yet.
          </p>
        )}

        {!loading && history.map(({ session, sets }) => {
          const expanded = expandedId === session.id;
          const groups = groupSets(sets);
          return (
            <div key={session.id} className="card" style={{ marginBottom: 12 }}>
              <button
                onClick={() => setExpandedId(expanded ? null : session.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  width: '100%',
                  textAlign: 'left',
                  minHeight: 0,
                  cursor: 'pointer',
                }}
              >
                <div className="row-between">
                  <div className="row" style={{ gap: 8 }}>
                    {session.routines && (
                      <div style={{
                        width: 10, height: 10, borderRadius: '50%',
                        background: session.routines.color, flexShrink: 0,
                      }} />
                    )}
                    <strong>{formatDate(session.started_at)}</strong>
                  </div>
                  <span className="text-small text-muted">
                    {groups.length} exercise{groups.length === 1 ? '' : 's'} · {sets.length} set{sets.length === 1 ? '' : 's'}
                  </span>
                </div>
              </button>

              {expanded && groups.length > 0 && (
                <div className="mt-8">
                  {groups.map((g, gi) => (
                    <div key={gi} className="mt-8">
                      <div className="text-small" style={{ fontWeight: 600 }}>{g.name}</div>
                      <div className="set-row set-row-header mt-8">
                        <span>#</span><span>Reps</span><span>Weight</span>
                      </div>
                      {g.sets.map((s, si) => (
                        <div key={s.id} className="set-row">
                          <span>{si + 1}</span>
                          <span>{s.reps}</span>
                          <span>{s.weight_kg} kg</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
