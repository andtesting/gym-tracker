import { useState, useEffect } from 'react';
import { fetchSessionSets } from '../api/sessions';
import type { SetWithExercise } from '../types';

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

  useEffect(() => {
    fetchSessionSets(sessionId)
      .then(setSets)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sessionId]);

  const grouped: ExerciseGroup[] = [];
  for (const set of sets) {
    const last = grouped[grouped.length - 1];
    if (last && last.name === set.exercises.name) {
      last.sets.push(set);
    } else {
      grouped.push({ name: set.exercises.name, sets: [set] });
    }
  }

  return (
    <div>
      <button className="btn-secondary btn-small mb-16" onClick={onBack}>Back</button>

      {loading && <p className="text-muted text-center">Loading...</p>}

      {grouped.map((group, i) => (
        <div key={i} className="mb-16">
          <h3>{group.name}</h3>
          <div className="set-row set-row-header mt-8">
            <span>Set</span><span>Type</span><span>Reps</span><span>Weight</span>
          </div>
          {group.sets.map((set, j) => (
            <div key={set.id} className="set-row">
              <span>{j + 1}</span>
              <span>{set.set_type}</span>
              <span>{set.reps}</span>
              <span>{set.weight_kg} kg</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
