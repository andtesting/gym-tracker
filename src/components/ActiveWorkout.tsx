import { useState, useEffect } from 'react';
import { useWorkout } from '../hooks/useWorkout';
import { useTimer } from '../hooks/useTimer';
import { updateSetRest } from '../api/sets';
import ExerciseSearch from './ExerciseSearch';
import SetLogger from './SetLogger';
import TimerDisplay from './TimerDisplay';
import RunningLog from './RunningLog';

interface Props {
  sessionId: string;
  routineId: string;
  routineName: string;
  onFinish: () => void;
}

export default function ActiveWorkout({ sessionId, routineId, routineName, onFinish }: Props) {
  const workout = useWorkout(sessionId, routineId);
  const timer = useTimer();
  const [sessionStart] = useState(() => Date.now());
  const [sessionElapsed, setSessionElapsed] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setSessionElapsed(Math.round((Date.now() - sessionStart) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionStart]);

  function formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  async function handleFinish() {
    timer.stop();
    await workout.finish();
    onFinish();
  }

  if (workout.loading) {
    return <p className="text-muted text-center mt-16">Loading...</p>;
  }

  const activeExercise = workout.activeIndex !== null ? workout.exercises[workout.activeIndex] : null;

  return (
    <div>
      <div className="row-between mb-16">
        <div>
          <h1>{routineName}</h1>
          <span className="text-small text-muted">{formatDuration(sessionElapsed)}</span>
        </div>
      </div>

      <TimerDisplay mode={timer.mode} elapsed={timer.elapsed} />

      <ExerciseSearch onSelect={workout.addExercise} />

      {workout.exercises.length > 0 && workout.activeIndex === null && (
        <div className="stack">
          {workout.exercises.map((entry, i) => (
            <button key={entry.exercise.id} className="btn-secondary" onClick={() => workout.setActiveIndex(i)}>
              {entry.exercise.name}
              {entry.sets.length > 0 && <span className="text-muted"> ({entry.sets.length} sets)</span>}
            </button>
          ))}
        </div>
      )}

      {activeExercise && workout.activeIndex !== null && (
        <SetLogger
          exercise={activeExercise.exercise}
          loggedSets={activeExercise.sets}
          lastSessionSets={activeExercise.lastSessionSets}
          timerMode={timer.mode}
          onStartSet={() => {
            const restSeconds = timer.startSet();
            if (workout.lastSetId && restSeconds > 0) {
              updateSetRest(workout.lastSetId, restSeconds);
            }
          }}
          onLogSet={async (data) => {
            const setDuration = timer.startRest();
            await workout.logSet(workout.activeIndex!, {
              ...data,
              set_duration_seconds: setDuration > 0 ? setDuration : null,
            }, null);
          }}
          onRemoveExercise={() => workout.removeExercise(workout.activeIndex!)}
        />
      )}

      <RunningLog
        exercises={workout.exercises}
        activeIndex={workout.activeIndex}
        onSelectExercise={workout.setActiveIndex}
      />

      <div className="bottom-bar">
        <button className="btn-danger" onClick={handleFinish} style={{ width: '100%', maxWidth: 480 }}>
          Finish Workout
        </button>
      </div>
    </div>
  );
}
