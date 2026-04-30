import type { SetWithExercise } from '../types';

interface Props {
  sets: SetWithExercise[];
}

export default function LastSessionRef({ sets }: Props) {
  if (sets.length === 0) return null;

  return (
    <div>
      <div className="two-column-label">Last Session</div>
      <div className="set-row set-row-header mt-8">
        <span>#</span><span>Type</span><span>Reps</span><span>Weight</span>
      </div>
      {sets.map((set, i) => (
        <div key={set.id} className="set-row ref-column">
          <span>{i + 1}</span>
          <span>{set.set_type}</span>
          <span>{set.reps}</span>
          <span>{set.weight_kg} kg</span>
        </div>
      ))}
    </div>
  );
}
