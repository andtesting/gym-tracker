import type { WorkoutSet, Exercise } from '../types';

interface ExerciseEntry {
  exercise: Exercise;
  sets: WorkoutSet[];
}

interface Props {
  exercises: ExerciseEntry[];
  activeIndex: number | null;
  onSelectExercise: (index: number) => void;
}

export default function RunningLog({ exercises, activeIndex, onSelectExercise }: Props) {
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
            <div className="set-row set-row-header mt-8">
              <span>#</span><span>Type</span><span>Reps</span><span>Weight</span>
            </div>
            {entry.sets.map((set, j) => (
              <div key={set.id} className="set-row">
                <span>{j + 1}</span>
                <span>{set.set_type}</span>
                <span>{set.reps}</span>
                <span>{set.weight_kg} kg</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
