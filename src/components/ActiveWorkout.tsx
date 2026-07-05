import { useState, useEffect, useRef } from 'react';
import { Clock, ChevronUp, ChevronDown, Zap, EyeOff } from 'lucide-react';
import { useWorkout } from '../hooks/useWorkout';
import { useTimer } from '../hooks/useTimer';
import { fetchSession } from '../api/sessions';
import {
  saveActiveWorkout,
  loadActiveWorkout,
  updateActiveWorkout,
  clearActiveWorkout,
} from '../lib/sessionPersistence';
import type { PersistedTimer } from '../lib/sessionPersistence';
import type { TimerState } from '../lib/timer';
import { summariseWorkout } from '../lib/summary';
import { DEFAULT_REST_TARGET_SECONDS } from '../lib/timer';
import type { WorkoutSummary } from '../lib/summary';
import { pushOutbox } from '../lib/outbox';
import { useSettings } from '../hooks/useSettings';
import { formatWeight, unitLabel } from '../lib/units';
import ExerciseSearch from './ExerciseSearch';
import SetLogger from './SetLogger';
import TimerDisplay from './TimerDisplay';
import RunningLog from './RunningLog';
import SessionHistorySheet from './SessionHistorySheet';
import SessionSummary from './SessionSummary';

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
  const { settings } = useSettings();
  // Restore persisted timer anchors so an iOS PWA kill mid-set or mid-rest
  // keeps measuring instead of silently dropping the timing data (AND-8).
  // Anchors older than an hour are abandoned workouts, not rests; restoring
  // them would record garbage multi-hour durations on the next set.
  const [restoredTimer] = useState<PersistedTimer | null>(() => {
    if (retroactive) return null;
    const persisted = loadActiveWorkout();
    const timer = persisted?.sessionId === sessionId ? persisted.timer ?? null : null;
    if (timer?.startedAtMs && Date.now() - timer.startedAtMs > 60 * 60 * 1000) return null;
    return timer;
  });
  const initialTimerState: TimerState | undefined =
    restoredTimer && restoredTimer.mode !== 'idle' && restoredTimer.startedAtMs !== null
      ? { mode: restoredTimer.mode, startTime: restoredTimer.startedAtMs }
      : undefined;
  const timer = useTimer(initialTimerState);
  // Mount time is only a placeholder until the session row loads: a resumed
  // session must show elapsed since started_at, not since remount (AND-45).
  const [sessionStart, setSessionStart] = useState(() => {
    if (!retroactive) {
      const persisted = loadActiveWorkout();
      if (persisted?.sessionId === sessionId && persisted.startedAt) {
        return Date.parse(persisted.startedAt);
      }
    }
    return Date.now();
  });
  const [now, setNow] = useState(() => Date.now());
  const sessionElapsed = Math.max(0, Math.round((now - sessionStart) / 1000));
  const [showHistory, setShowHistory] = useState(false);
  // The Undo toast can outlive the workout; once finished, undo must not
  // resurrect a set into the closed session.
  const finishedRef = useRef(false);
  // Duration is snapshotted at finish: the elapsed interval keeps ticking
  // behind the overlay, and the reward screen must not count up. startedAt is
  // stashed before clearActiveWorkout so the notes upsert can carry the same
  // identity fields as finish() for locally created sessions.
  const [summary, setSummary] = useState<{
    data: WorkoutSummary;
    durationSeconds: number;
    startedAt: string | null;
  } | null>(null);
  const setStartedAtRef = useRef<string | null>(restoredTimer?.setStartedAt ?? null);
  // Rest measured when the user pressed Start Set, held until the following
  // Log Set so it can be stored as that set's `rest_seconds` (rest taken BEFORE
  // this set). The rest timer keeps running across an exercise switch, so this
  // captures the gap between the previous exercise's last set and the new
  // exercise's first set too (AND-37).
  const pendingRestRef = useRef<number | null>(restoredTimer?.pendingRestSeconds ?? null);

  function persistTimer(mode: 'idle' | 'set' | 'rest', startedAtMs: number | null) {
    if (retroactive) return;
    updateActiveWorkout({
      timer: {
        mode,
        startedAtMs,
        pendingRestSeconds: pendingRestRef.current,
        setStartedAt: setStartedAtRef.current,
      },
    });
  }

  function switchExercise(idx: number | null) {
    // Switching away from an in-progress set cancels it: drop the timer state,
    // the started-at ref, and any pending rest so we don't bleed the abandoned
    // set into a different exercise.
    if (timer.mode === 'set') {
      timer.stop();
      setStartedAtRef.current = null;
      pendingRestRef.current = null;
      persistTimer('idle', null);
    }
    workout.setActiveIndex(idx);
  }

  useEffect(() => {
    if (retroactive) return;
    // Only create a fresh record when none exists for this session; an
    // unconditional save would wipe the locally persisted sets and timer.
    const persisted = loadActiveWorkout();
    if (persisted?.sessionId !== sessionId) {
      saveActiveWorkout({ sessionId, routineId, routineName });
    }
  }, [sessionId, routineId, routineName, retroactive]);

  useEffect(() => {
    if (retroactive) return;
    const persisted = loadActiveWorkout();
    if (persisted?.sessionId === sessionId && persisted.startedAt) return;
    fetchSession(sessionId)
      .then(s => {
        if (s?.started_at) {
          setSessionStart(Date.parse(s.started_at));
          updateActiveWorkout({ startedAt: s.started_at });
        }
      })
      .catch(() => {});
  }, [sessionId, retroactive]);

  useEffect(() => {
    if (retroactive) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [retroactive]);

  function formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  async function handleFinish() {
    finishedRef.current = true;
    timer.stop();
    if (retroactive && retroactiveDate) {
      // Anchor to noon local on the picked date so the session sits cleanly on
      // its calendar day regardless of timezone. (Parsing the bare YYYY-MM-DD
      // would be UTC midnight, which can drift across days for some zones.)
      const datePart = retroactiveDate.split('T')[0];
      const finishedAt = new Date(`${datePart}T12:30:00`).toISOString();
      await workout.finish(finishedAt);
      onFinish();
      return;
    }
    const persistedStartedAt = loadActiveWorkout()?.startedAt ?? null;
    await workout.finish();
    clearActiveWorkout();
    // The summary is the reward moment; skip it for an empty session.
    const workoutSummary = summariseWorkout(workout.exercises);
    if (workoutSummary.totalSets > 0) {
      setSummary({ data: workoutSummary, durationSeconds: sessionElapsed, startedAt: persistedStartedAt });
    } else {
      onFinish();
    }
  }

  function saveSummaryNotes(notes: string) {
    if (!notes) return;
    const payload: Record<string, unknown> = { id: sessionId, notes };
    // Same identity rule as finish(): locally created sessions carry their
    // own fields so the upsert can reconstruct the row if the creation write
    // was lost; server-created sessions send only the changed column.
    if (summary?.startedAt) {
      payload.routine_id = routineId;
      payload.started_at = summary.startedAt;
    }
    pushOutbox({ table: 'sessions', op: 'upsert', rowId: sessionId, payload });
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

      {!retroactive && (
        <TimerDisplay
          mode={timer.mode}
          elapsed={timer.elapsed}
          restTargetSeconds={(() => {
            if (!settings.restCountdown) return null;
            const target = activeExercise?.template?.target_rest_seconds;
            // Non-positive coach-written targets degrade to the default so
            // "Countdown" always counts down.
            return target != null && target > 0 ? target : DEFAULT_REST_TARGET_SECONDS;
          })()}
        />
      )}

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
                const linkedWithPrev =
                  i > 0 && entry.groupId !== null && entry.groupId === workout.exercises[i - 1].groupId;
                return (
                  <div
                    key={entry.exercise.id}
                    className="card"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 0,
                      padding: 10,
                      borderLeft: entry.groupId ? '3px solid var(--color-accent)' : undefined,
                    }}
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
                      <div className="row-between" style={{ gap: 8 }}>
                        <strong style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {entry.exercise.name}
                        </strong>
                        {/* Fixed width + wrap so "N sets" / "today" lands in
                            the same place on every card, regardless of the
                            name length or the control cluster width. */}
                        {entry.sets.length > 0 && (
                          <span
                            className="text-small text-muted"
                            style={{ flexShrink: 0, width: 42, textAlign: 'right', lineHeight: 1.15 }}
                          >
                            {entry.sets.length} set{entry.sets.length === 1 ? '' : 's'} today
                          </span>
                        )}
                      </div>
                      {topSet ? (
                        <span className="text-small text-muted">
                          Last: {formatWeight(topSet.weight_kg, settings.unit)} {unitLabel(settings.unit)} × {topSet.reps}
                          {fromOther && recent?.session.routines && (
                            <> · <span style={{ color: recent.session.routines.color }}>
                              {recent.session.routines.name}
                            </span></>
                          )}
                        </span>
                      ) : (
                        <span className="text-small text-muted">No prior history</span>
                      )}
                      {(() => {
                        const t = entry.template;
                        if (!t) return null;
                        const parts: string[] = [];
                        if (t.target_sets != null || t.target_reps != null) {
                          parts.push(`${t.target_sets ?? '?'}×${t.target_reps ?? '?'}`);
                        }
                        if (t.target_weight_kg != null) {
                          parts.push(`${formatWeight(t.target_weight_kg, settings.unit)} ${unitLabel(settings.unit)}`);
                        }
                        if (t.target_rest_seconds != null) parts.push(`rest ${t.target_rest_seconds}s`);
                        if (parts.length === 0) return null;
                        return <span className="text-small text-muted">Target: {parts.join(' · ')}</span>;
                      })()}
                    </button>
                    <div className="row" style={{ gap: 2, flexShrink: 0 }}>
                      {i > 0 ? (
                        <button
                          className="pager-btn"
                          onClick={() => workout.toggleSuperset(i)}
                          aria-label={linkedWithPrev ? 'Unlink superset' : 'Superset with previous'}
                          aria-pressed={linkedWithPrev}
                          style={{
                            minHeight: 32,
                            padding: 4,
                            color: linkedWithPrev ? 'var(--color-accent)' : undefined,
                          }}
                        >
                          <Zap size={16} />
                        </button>
                      ) : (
                        // Reserve the superset slot so the control cluster is
                        // the same width on the first card as on the rest, and
                        // the sets-today block stays aligned across cards.
                        <span style={{ width: 24, flexShrink: 0 }} aria-hidden="true" />
                      )}
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
                      <button
                        className="pager-btn"
                        onClick={() => workout.moveExerciseToEnd(i)}
                        disabled={i === workout.exercises.length - 1}
                        aria-label="Skip for today (move to bottom)"
                        style={{ minHeight: 32, padding: 4 }}
                      >
                        <EyeOff size={16} />
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
            // The rest just completed belongs to the set about to be logged
            // (rest taken before it). Hold it until onLogSet persists the set.
            const restSeconds = timer.startSet();
            pendingRestRef.current = restSeconds > 0 ? restSeconds : null;
            persistTimer('set', Date.now());
          }}
          onLogSet={async (data) => {
            if (retroactive) {
              const createdAt = retroactiveDate
                ? new Date(`${retroactiveDate.split('T')[0]}T12:00:00`).toISOString()
                : undefined;
              await workout.logSet(workout.activeIndex!, {
                ...data,
                set_duration_seconds: null,
                started_at: null,
                completed_at: null,
              }, null, createdAt);
              return;
            }
            const completedAt = new Date().toISOString();
            const setDuration = timer.startRest();
            // Snapshot and clear the refs BEFORE the await: if the insert is slow
            // and the user starts the next set while it's in flight, onStartSet
            // repopulates these refs — a post-await clear would wipe them.
            const startedAt = setStartedAtRef.current;
            const restSeconds = pendingRestRef.current;
            setStartedAtRef.current = null;
            pendingRestRef.current = null;
            persistTimer('rest', Date.now());
            await workout.logSet(workout.activeIndex!, {
              ...data,
              set_duration_seconds: setDuration > 0 ? setDuration : null,
              started_at: startedAt,
              completed_at: completedAt,
            }, restSeconds);
          }}
          onEditSet={(setId, updates) => workout.editSet(workout.activeIndex!, setId, updates)}
          onDeleteSet={(setId) => workout.deleteSet(workout.activeIndex!, setId)}
          onRestoreSet={(set) => (finishedRef.current ? false : workout.restoreSet(set))}
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

      {summary && (
        <SessionSummary
          routineName={routineName}
          durationSeconds={summary.durationSeconds}
          summary={summary.data}
          onSaveNotes={saveSummaryNotes}
          onDone={(notes) => {
            saveSummaryNotes(notes);
            onFinish();
          }}
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
