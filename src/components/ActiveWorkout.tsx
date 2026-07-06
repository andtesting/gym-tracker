import { useState, useEffect, useRef } from 'react';
import { Clock, ChevronUp, ChevronDown, Zap, EyeOff } from 'lucide-react';
import { useWorkout } from '../hooks/useWorkout';
import { useTimer } from '../hooks/useTimer';
import { fetchSession } from '../api/sessions';
import { fetchRoutines, createRoutine, deleteRoutine } from '../api/routines';
import { createRoutineExercises } from '../api/routineExercises';
import { groupIntoCategories, nextVariantLabel, nextVariantOrder } from '../lib/routineCategories';
import { sessionDeviatesFromTemplate, buildVariantSeed } from '../lib/variantFromSession';
import { cachedFetch } from '../lib/cache';
import { useToast } from '../hooks/useToast';
import type { Routine, RoutineCategory } from '../types';
import {
  saveActiveWorkout,
  loadActiveWorkout,
  updateActiveWorkout,
  clearActiveWorkout,
} from '../lib/sessionPersistence';
import type { PersistedTimer } from '../lib/sessionPersistence';
import type { TimerState } from '../lib/timer';
import { summariseWorkout } from '../lib/summary';
import { DEFAULT_REST_TARGET_SECONDS, latestCompletedMs } from '../lib/timer';
import type { WorkoutSummary } from '../lib/summary';
import { pushOutbox } from '../lib/outbox';
import { useSettings } from '../hooks/useSettings';
import { formatWeight, unitLabel, kgToDisplay } from '../lib/units';
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
  // Which variant this workout is bound to. Starts at the picked variant (A)
  // and can be switched before the first set (see the variant switcher below);
  // switching re-runs useWorkout, reloading that variant's template into the
  // plan. Held locally so the switch is self-contained; resume reads the same
  // fields from the persisted record, which switchVariant keeps in sync.
  const [routine, setRoutine] = useState({ id: routineId, name: routineName });
  const workout = useWorkout(sessionId, routine.id, { retroactive });
  const { settings } = useSettings();
  const toast = useToast();

  // This workout's category (the routine and its sibling variants). Drives the
  // pre-first-set switcher and the save-as-variant offer on finish. Null for a
  // routine not yet grouped, or while the routine list is still loading.
  const [category, setCategory] = useState<RoutineCategory | null>(null);
  useEffect(() => {
    if (retroactive) return;
    cachedFetch('routines', fetchRoutines)
      .then(all => {
        setCategory(
          groupIntoCategories(all).find(c => c.variants.some(v => v.id === routineId)) ?? null,
        );
      })
      .catch(() => {});
  }, [routineId, retroactive]);
  const variants = category?.variants ?? [];

  // The session binds to its variant once the first set is logged (the set
  // rows carry the session_id, and the routine_id is now meaningful history).
  // Before that, switching is free.
  const hasLoggedSet = workout.exercises.some(e => e.sets.length > 0);

  function switchVariant(v: Routine) {
    if (v.id === routine.id || hasLoggedSet) return;
    setRoutine({ id: v.id, name: v.name });
    // Keep the persisted record (drives resume) and the session row in step.
    updateActiveWorkout({ routineId: v.id, routineName: v.name });
    const startedAt = loadActiveWorkout()?.startedAt ?? null;
    const payload: Record<string, unknown> = { id: sessionId, routine_id: v.id };
    // started_at covers the offline case where the session's insert is still
    // queued ahead of us: our upsert then re-inserts identity-complete.
    if (startedAt) payload.started_at = startedAt;
    pushOutbox({ table: 'sessions', op: 'upsert', rowId: sessionId, payload });
  }
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
    // The name to title the reward screen with — the new variant when the
    // session was saved-as-variant, else the routine it was done under.
    routineName: string;
  } | null>(null);
  // Finish is deliberate now: it opens a confirmation with a summary rather
  // than ending immediately (the old fixed bottom bar was easy to fat-finger).
  const [confirmingFinish, setConfirmingFinish] = useState(false);
  // When today deviated from the plan, the finish confirmation offers to save
  // it as a new variant of this category (opt-in, default off).
  const [saveAsVariant, setSaveAsVariant] = useState(false);
  // Set once save-as-variant mints and repoints to a new variant. The summary
  // notes upsert and title read this so they follow the new variant instead of
  // repointing the session back to the started one. A ref, not state, so it
  // doesn't re-run useWorkout and blank the summary behind the loading gate.
  const repointedRef = useRef<{ id: string; name: string } | null>(null);
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
      saveActiveWorkout({ sessionId, routineId: routine.id, routineName: routine.name });
    }
  }, [sessionId, routine.id, routine.name, retroactive]);

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
    // Save-as-variant runs before clearActiveWorkout so it can still read the
    // started_at for the session repoint. Best-effort: a failure here must not
    // lose the finished workout, only the convenience variant.
    if (saveAsVariant && category && sessionDeviatesFromTemplate(workout.exercises)) {
      await createSessionVariant(category, persistedStartedAt);
    }
    clearActiveWorkout();
    // The summary is the reward moment; skip it for an empty session.
    const workoutSummary = summariseWorkout(workout.exercises);
    if (workoutSummary.totalSets > 0) {
      setSummary({
        data: workoutSummary,
        durationSeconds: sessionElapsed,
        startedAt: persistedStartedAt,
        routineName: repointedRef.current?.name ?? routine.name,
      });
    } else {
      onFinish();
    }
  }

  // Mints a new variant in this category from today's actual exercises: next
  // free label/order, this variant's colour, a template seeded from each
  // performed exercise's top set (ROUTINE_VARIANTS_PLAN Q3), then repoints the
  // just-finished session at it. routine_exercises are direct writes (not in
  // the outbox), so this needs the network; on failure the workout is already
  // saved and only the variant is lost.
  async function createSessionVariant(cat: RoutineCategory, startedAt: string | null) {
    let created: Routine | null = null;
    try {
      const label = nextVariantLabel(cat.variants);
      const order = nextVariantOrder(cat.variants);
      const color = cat.variants.find(v => v.id === routine.id)?.color ?? cat.variants[0]?.color;
      created = await createRoutine(`${cat.name} ${label}`, cat.variants.length, {
        category: cat.name,
        variant_label: label,
        variant_order: order,
        color,
      });
      await createRoutineExercises(
        buildVariantSeed(workout.exercises).map(r => ({ ...r, routine_id: created!.id })),
      );
      const payload: Record<string, unknown> = { id: sessionId, routine_id: created.id };
      if (startedAt) payload.started_at = startedAt;
      pushOutbox({ table: 'sessions', op: 'upsert', rowId: sessionId, payload });
      // The session now belongs to the new variant; record it so the summary
      // notes upsert repoints there too rather than back to the started one.
      repointedRef.current = { id: created.id, name: created.name };
    } catch {
      // Roll back a routine created without its template, so the switcher never
      // surfaces an empty-plan variant. Best-effort; the workout is safe either way.
      if (created) deleteRoutine(created.id).catch(() => {});
      toast('Workout saved, but the new variant could not be created.');
    }
  }

  function saveSummaryNotes(notes: string) {
    if (!notes) return;
    const payload: Record<string, unknown> = { id: sessionId, notes };
    // Same identity rule as finish(): locally created sessions carry their
    // own fields so the upsert can reconstruct the row if the creation write
    // was lost; server-created sessions send only the changed column.
    if (summary?.startedAt) {
      payload.routine_id = repointedRef.current?.id ?? routine.id;
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
          <h1>{routine.name}{retroactive && <span className="text-small text-muted"> · past</span>}</h1>
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

      {/* Variant switcher: flip A/B/C before the first set. Hidden once a set
          is logged (the session is then bound to this variant) and for
          standalone routines. Switching reloads the chosen variant's plan. */}
      {variants.length > 1 && workout.activeIndex === null && !hasLoggedSet && (
        <div className="row mt-16" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="text-small text-muted">Variant</span>
          {variants.map(v => {
            const active = v.id === routine.id;
            return (
              <button
                key={v.id}
                className={active ? 'btn-primary btn-small' : 'btn-secondary btn-small'}
                onClick={() => switchVariant(v)}
                aria-pressed={active}
              >
                {v.variant_label ?? v.name}
              </button>
            );
          })}
        </div>
      )}

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
                const fromOther = recent && recent.session.routine_id !== routine.id;
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
          currentRoutineId={routine.id}
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
          onDeleteSet={async (setId) => {
            // Snapshot remaining completions BEFORE the delete's async state
            // update. The rest clock restarts at each Log Set, so deleting the
            // set it last restarted at would strand the anchor there; re-anchor
            // rest to the latest surviving set so the next set's rest keeps
            // measuring from real work. No remaining set → drop to idle so the
            // re-logged set is treated as a first set (no rest credited).
            const remaining = workout.exercises
              .flatMap(e => e.sets)
              .filter(s => s.id !== setId)
              .map(s => s.completed_at);
            workout.deleteSet(workout.activeIndex!, setId);
            if (retroactive || timer.mode !== 'rest') return;
            const anchor = latestCompletedMs(remaining);
            if (anchor !== null) {
              timer.resumeRest(anchor);
              persistTimer('rest', anchor);
            } else {
              timer.stop();
              persistTimer('idle', null);
            }
          }}
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
          routineId={routine.id}
          routineName={routine.name}
          excludeSessionId={sessionId}
          onClose={() => setShowHistory(false)}
        />
      )}

      {summary && (
        <SessionSummary
          routineName={summary.routineName}
          durationSeconds={summary.durationSeconds}
          summary={summary.data}
          onSaveNotes={saveSummaryNotes}
          onDone={(notes) => {
            saveSummaryNotes(notes);
            onFinish();
          }}
        />
      )}

      {/* At the end of the page (not a fixed bar) so it can't be fat-fingered
          mid-workout; finishing goes through a confirmation. */}
      <button
        className="btn-danger mt-16"
        onClick={() => setConfirmingFinish(true)}
        style={{ width: '100%' }}
      >
        {retroactive ? 'Save Past Workout' : 'Finish Workout'}
      </button>

      {confirmingFinish && (() => {
        const s = summariseWorkout(workout.exercises);
        const kg = Math.round(kgToDisplay(s.tonnageKg, settings.unit)).toLocaleString();
        // Coarse minutes to match the reward screen shown a beat later, not the
        // live-ticking MM:SS header.
        const durationLabel = sessionElapsed >= 3600
          ? `${Math.floor(sessionElapsed / 3600)}h ${Math.floor((sessionElapsed % 3600) / 60)}m`
          : `${Math.floor(sessionElapsed / 60)}m`;
        // Offer save-as-variant only when today's exercises actually deviated
        // from the plan (Q2), and only for a grouped, live workout.
        const canSaveVariant = !retroactive && category !== null
          && sessionDeviatesFromTemplate(workout.exercises);
        const newVariantLabel = category ? nextVariantLabel(category.variants) : '';
        return (
          <div className="confirm-backdrop" onClick={() => setConfirmingFinish(false)}>
            <div className="confirm-sheet" onClick={e => e.stopPropagation()}>
              <h3>{retroactive ? 'Save this workout?' : 'End workout?'}</h3>
              <div className="summary-stats mt-16">
                <div className="summary-stat">
                  <span className="summary-stat-value">{s.exercises.length}</span>
                  <span className="summary-stat-label">exercise{s.exercises.length === 1 ? '' : 's'}</span>
                </div>
                <div className="summary-stat">
                  <span className="summary-stat-value">{s.totalSets}</span>
                  <span className="summary-stat-label">sets</span>
                </div>
                <div className="summary-stat">
                  <span className="summary-stat-value">{kg}</span>
                  <span className="summary-stat-label">{unitLabel(settings.unit)} lifted</span>
                </div>
                {!retroactive && (
                  <div className="summary-stat">
                    <span className="summary-stat-value">{durationLabel}</span>
                    <span className="summary-stat-label">duration</span>
                  </div>
                )}
              </div>
              <p className="text-small text-muted mt-16">
                Are you sure you want to {retroactive ? 'save' : 'end'} this workout?
              </p>
              {canSaveVariant && (
                <label
                  className="row mt-16"
                  style={{ gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}
                >
                  <input
                    type="checkbox"
                    checked={saveAsVariant}
                    onChange={e => setSaveAsVariant(e.target.checked)}
                    style={{ marginTop: 3 }}
                  />
                  <span className="text-small">
                    Today differed from {routine.name}. Save it as a new variant{' '}
                    <strong>{category!.name} {newVariantLabel}</strong>?
                  </span>
                </label>
              )}
              <button
                className="btn-primary mt-16"
                style={{ width: '100%' }}
                onClick={() => { setConfirmingFinish(false); handleFinish(); }}
              >
                Yes, {retroactive ? 'save' : 'end'} workout
              </button>
              <button
                className="btn-secondary mt-8"
                style={{ width: '100%' }}
                onClick={() => setConfirmingFinish(false)}
              >
                No, keep going
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
