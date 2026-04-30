import { useState } from 'react';
import type { Exercise, WorkoutSet, SetWithExercise } from '../types';
import LastSessionRef from './LastSessionRef';

interface Props {
  exercise: Exercise;
  loggedSets: WorkoutSet[];
  lastSessionSets: SetWithExercise[];
  timerMode: 'idle' | 'rest' | 'set';
  onStartSet: () => void;
  onLogSet: (data: { reps: number; weight_kg: number; set_type: 'warmup' | 'working' }) => void;
  onRemoveExercise: () => void;
}

export default function SetLogger({
  exercise, loggedSets, lastSessionSets, timerMode, onStartSet, onLogSet, onRemoveExercise,
}: Props) {
  const [reps, setReps] = useState('');
  const [weight, setWeight] = useState('');
  const [setType, setSetType] = useState<'warmup' | 'working'>('working');

  function handleLog() {
    const r = parseInt(reps, 10);
    const w = parseFloat(weight);
    if (isNaN(r) || isNaN(w) || r <= 0 || w < 0) return;
    onLogSet({ reps: r, weight_kg: w, set_type: setType });
    setReps('');
    setWeight('');
  }

  const inSet = timerMode === 'set';

  return (
    <div className="card">
      <div className="exercise-header">
        <h3>{exercise.name}</h3>
        <button className="btn-secondary btn-small" onClick={onRemoveExercise}>Remove</button>
      </div>

      <div className="two-column mt-8">
        <div>
          <LastSessionRef sets={lastSessionSets} />
        </div>
        <div>
          <div className="two-column-label">Current Session</div>
          {loggedSets.length > 0 && (
            <>
              <div className="set-row set-row-header mt-8">
                <span>#</span><span>Type</span><span>Reps</span><span>Weight</span>
              </div>
              {loggedSets.map((set, i) => (
                <div key={set.id} className="set-row">
                  <span>{i + 1}</span>
                  <span>{set.set_type}</span>
                  <span>{set.reps}</span>
                  <span>{set.weight_kg} kg</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      <div className="mt-16">
        {!inSet ? (
          <button className="btn-primary mb-16" onClick={onStartSet}>
            Start Set
          </button>
        ) : (
          <button
            className="btn-primary mb-16"
            onClick={handleLog}
            style={{ background: 'var(--color-success)' }}
          >
            Log Set
          </button>
        )}

        <div className="toggle-group mb-16">
          <button
            className={setType === 'warmup' ? 'active' : ''}
            onClick={() => setSetType('warmup')}
          >
            Warmup
          </button>
          <button
            className={setType === 'working' ? 'active' : ''}
            onClick={() => setSetType('working')}
          >
            Working
          </button>
        </div>

        <div className="row">
          <input
            type="text"
            inputMode="numeric"
            value={reps}
            onChange={e => setReps(e.target.value)}
            placeholder="Reps"
            style={{ flex: 1 }}
          />
          <input
            type="text"
            inputMode="decimal"
            value={weight}
            onChange={e => setWeight(e.target.value)}
            placeholder="Weight (kg)"
            style={{ flex: 1 }}
          />
        </div>
      </div>
    </div>
  );
}
