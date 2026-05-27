import { useState, useEffect, useRef } from 'react';
import { Clock, ChevronUp, ChevronDown } from 'lucide-react';
import { useWorkout } from '../hooks/useWorkout';
import { useTimer } from '../hooks/useTimer';
import { updateSetRest } from '../api/sets';
import { saveActiveWorkout, clearActiveWorkout } from '../lib/sessionPersistence';
import ExerciseSearch from './ExerciseSearch';
import SetLogger from './SetLogger';
import TimerDisplay from './TimerDisplay';
import RunningLog from './RunningLog';
import SessionHistorySheet from './SessionHistorySheet';

interface Props {
  sessionId: string;
  routineId: string;
  routineName: string;
  retroactive?: boolean;
  retroactiveDate?: string;
  onFinish: () => void;
  onHome: () => void;
}

export default function ActiveWorkout({
  sessionId,
  routineId,
  routineName,
  retroactive = false,
  retroactiveDate,
  onFinish,
  onHome,
}: Props) {
  const workout = useWorkout(sessionId, routineId, { retroactive });
  const timer = useTimer();
  const [sessionStart] = useState(() => Date.now());
  const [sessionElapsed, setSessionElapsed] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const setStartedAtRef = useRef<string | null>(null);
  // Local mirror of "the last set whose rest_seconds we still owe", set ONLY
  // after createSet resolves. Avoids the race where workout.lastSetId is stale
  // while a logSet promise is still in flight.
  const lastCompletedSetIdRef = useRef<string | null>(null);

  function switchExercise(idx: number | null) {
    // Switching away from an in-progress set cancels it: drop the timer state
    // and clear the started-at ref so we don't bleed the running set into a
    // different exercise.
    if (timer.mode === 'set') {
      timer.stop();
      setStartedAtRef.current = null;
    }
    workout.setActiveIndex(idx);
  }

  useEffect(() => {
    if (!retroactive) {
      saveActiveWorkout({ sessionId, routineId, routineName });
    }
  }, [sessionId, routineId, routineName, retroactive]);

  useEffect(() => {
    if (retroactive) return;
    const interval = window.setInterval(() => {
      setSessionElapsed(Math.round((Date.now() - sessionStart) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionStart, retroactive]);

  function formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  async function handleFinish() {
    timer.stop();
    if (retroactive && retroactiveDate) {
      // Anchor to noon local on the picked date so the session sits cleanly on
      // its calendar day regardless of timezone. (Parsing the bare YYYY-MM-DD
      // would be UTC midnight, which can drift across days for some zones.)
      const datePart = retroactiveDate.split('T')[0];
      const finishedAt = new Date(`${datePart}T12:30:00`).toISOString();
      await workout.finish(finishedAt);
    } else {
      await workout.finish();
    }
    if (!retroactive) clearActiveWorkout();
    onFinish();
  }

  if (workout.loading) {
    return <p className="text-muted text-center mt-16">Loading...</p>;
  }

  const activeExercise = workout.activeIndex !== null ? workout.exercises[workout.activeIndex] : null;

  const primaryMuscleGroupId = (() => {
    const counts = new Map<string, number>();
    for (const e of workout.exercises) {
      const mgId = e.exercise.muscle_group_id;
      if (mgId) counts.set(mgId, (counts.get(mgId) ?? 0) + 1);
    }
    let best: string | null = null;
    let bestCount = 0;
    for (const [id, count] of counts) {
      if (count > bestCount) { best = id; bestCount = count; }
    }
    return best;
  })();

  return (
    <div>
      <div className="row-between mb-16">
        <div>
          <h1>{routineName}{retroactive && <span className="text-small text-muted"> · past</span>}</h1>
          {retroactive ? (
            retroactiveDate && (
              <span className="text-small text-muted">
                {new Date(retroactiveDate).toLocaleDateString('en-AU', {
                  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                })}
              </span>
            )
          ) : (
            <span className="text-small text-muted">{formatDuration(sessionElapsed)}</span>
          )}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button
            className="btn-secondary btn-small"
            onClick={() => setShowHistory(true)}
            aria-label="View history"
            title="View prior sessions"
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Clock size={14} />
            History
          </button>
          <button className="btn-secondary btn-small" onClick={onHome}>Home</button>
        </div>
      </div>

      {!retroactive && <TimerDisplay mode={timer.mode} elapsed={timer.elapsed} />}

      <ExerciseSearch onSelect={workout.addExercise} primaryMuscleGroupId={primaryMuscleGroupId} />

      {workout.activeIndex === null && (
        <div>
          {workout.exercises.length === 0 ? (
            <p className="text-muted text-center mt-16">
              Add exercises above to plan your workout.
            </p>
          ) : (
            <div className="stack">
              <h2>Plan</h2>
              {workout.exercises.map((entry, i) => {
                const recent = entry.histories[0] ?? null;
                const topSet = recent?.sets
                  .reduce<typeof recent.sets[number] | null>(
                    (best, s) => !best || s.weight_kg > best.weight_kg ? s : best, null,
                  );
                const fromOther = recent && recent.session.routine_id !== routineId;
                return (
                  <div
                    key={entry.exercise.id}
                    className="card"
                    style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 0, padding: 10 }}
                  >
                    <button
                      onClick={() => switchExercise(i)}
                      style={{
                        flex: 1,
                        textAlign: 'left',
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        minHeight: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        cursor: 'pointer',
                      }}
                    >
                      <div className="row-between">
                        <strong>{entry.exercise.name}</strong>
                        {entry.sets.length > 0 && (
                          <span className="text-small text-muted">
                            {entry.sets.length} set{entry.sets.length === 1 ? '' : 's'} today
                          </span>
                        )}
                      </div>
                      {topSet ? (
                        <span className="text-small text-muted">
                          Last: {topSet.weight_kg}kg × {topSet.reps}
                          {fromOther && recent?.session.routines && (
                            <> · <span style={{ color: recent.session.routines.color }}>
                              {recent.session.routines.name}
                            </span></>
                          )}
                        </span>
                      ) : (
                        <span className="text-small text-muted">No prior history</span>
                      )}
                    </button>
                    <div className="row" style={{ gap: 2, flexShrink: 0 }}>
                      <button
                        className="pager-btn"
                        onClick={() => workout.reorderExercise(i, 'up')}
                        disabled={i === 0}
                        aria-label="Move up"
                        style={{ minHeight: 32, padding: 4 }}
                      >
                        <ChevronUp size={16} />
                      </button>
                      <button
                        className="pager-btn"
                        onClick={() => workout.reorderExercise(i, 'down')}
                        disabled={i === workout.exercises.length - 1}
                        aria-label="Move down"
                        style={{ minHeight: 32, padding: 4 }}
                      >
                        <ChevronDown size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeExercise && workout.activeIndex !== null && (
        <SetLogger
          key={activeExercise.exercise.id}
          exercise={activeExercise.exercise}
          loggedSets={activeExercise.sets}
          histories={activeExercise.histories}
          currentRoutineId={routineId}
          timerMode={timer.mode}
          retroactive={retroactive}
          onStartSet={() => {
            setStartedAtRef.current = new Date().toISOString();
            const restSeconds = timer.startSet();
            // Attribute the rest just completed to the set we last persisted.
            // Read from our local ref (set post-await in onLogSet) instead of
            // workout.lastSetId, which would be stale if a logSet promise was
            // still in flight when the user pressed Start Set.
            const targetId = lastCompletedSetIdRef.current;
            if (targetId && restSeconds > 0) {
              updateSetRest(targetId, restSeconds).catch(() => {});
            }
          }}
          onLogSet={async (data) => {
            if (retroactive) {
              const createdAt = retroactiveDate
                ? new Date(`${retroactiveDate.split('T')[0]}T12:00:00`).toISOString()
                : undefined;
              const newSet = await workout.logSet(workout.activeIndex!, {
                ...data,
                set_duration_seconds: null,
                started_at: null,
                completed_at: null,
              }, null, createdAt);
              lastCompletedSetIdRef.current = newSet.id;
              return;
            }
            const completedAt = new Date().toISOString();
            const setDuration = timer.startRest();
            const newSet = await workout.logSet(workout.activeIndex!, {
              ...data,
              set_duration_seconds: setDuration > 0 ? setDuration : null,
              started_at: setStartedAtRef.current,
              completed_at: completedAt,
            }, null);
            lastCompletedSetIdRef.current = newSet.id;
            setStartedAtRef.current = null;
          }}
          onEditSet={(setId, updates) => workout.editSet(workout.activeIndex!, setId, updates)}
          onDeleteSet={(setId) => workout.deleteSet(workout.activeIndex!, setId)}
          onRemoveExercise={() => workout.removeExercise(workout.activeIndex!)}
          onBackToPlan={() => switchExercise(null)}
        />
      )}

      <RunningLog
        exercises={workout.exercises}
        activeIndex={workout.activeIndex}
        onSelectExercise={switchExercise}
      />

      {showHistory && (
        <SessionHistorySheet
          routineId={routineId}
          routineName={routineName}
          excludeSessionId={sessionId}
          onClose={() => setShowHistory(false)}
        />
      )}

      <div className="bottom-bar">
        <button className="btn-danger" onClick={handleFinish} style={{ width: '100%', maxWidth: 480 }}>
          {retroactive ? 'Save Past Workout' : 'Finish Workout'}
        </button>
      </div>
    </div>
  );
}
