import type { WorkoutSet, Exercise } from '../types';
import { formatRest } from '../lib/timer';
import { useSettings } from '../hooks/useSettings';
import { formatWeight, unitHeader } from '../lib/units';

interface ExerciseEntry {
  exercise: Exercise;
  sets: WorkoutSet[];
  groupId?: string | null;
}

interface Props {
  exercises: ExerciseEntry[];
  activeIndex: number | null;
  onSelectExercise: (index: number) => void;
}

export default function RunningLog({ exercises, activeIndex, onSelectExercise }: Props) {
  const { settings } = useSettings();
  const logged = exercises.filter(e => e.sets.length > 0);
  if (logged.length === 0) return null;

  return (
    <div className="mt-16">
      <h2 className="mb-16">Session Log</h2>
      {exercises.map((entry, i) => {
        if (entry.sets.length === 0) return null;
        const isActive = i === activeIndex;
        return (
          <div
            key={entry.exercise.id}
            className="card"
            onClick={() => onSelectExercise(i)}
            style={{ cursor: 'pointer', borderLeft: isActive ? '3px solid var(--color-accent)' : 'none' }}
          >
            <strong>{entry.exercise.name}</strong>
            <span className="text-small text-muted"> ({entry.sets.length} sets)</span>
            {entry.groupId && (
              <span className="text-small" style={{ color: 'var(--color-accent)' }}> · superset</span>
            )}
            <div className="set-row set-row-header mt-8" style={{ gridTemplateColumns: '44px 1fr 1fr 1fr' }}>
              <span>#</span><span>Reps</span><span>{unitHeader(settings.unit)}</span><span>Rest</span>
            </div>
            {entry.sets.map((set, j) => (
              <div key={set.id} className="set-row" style={{ gridTemplateColumns: '44px 1fr 1fr 1fr' }}>
                <span>{j + 1}</span>
                <span>{set.reps}</span>
                <span>{formatWeight(set.weight_kg, settings.unit)}</span>
                <span className="text-muted">{formatRest(set.rest_seconds)}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
