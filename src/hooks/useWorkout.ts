import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchLastSession, fetchSessionSets, fetchExerciseHistories } from '../api/sessions';
import { fetchRoutineExercises } from '../api/routineExercises';
import { pushOutbox } from '../lib/outbox';
import { cachedFetch } from '../lib/cache';
import { buildPlan } from '../lib/plan';
import { loadActiveWorkout, updateActiveWorkout } from '../lib/sessionPersistence';
import { useToast } from './useToast';
import type { Exercise, RoutineExercise, WorkoutSet, SetWithExercise, ExerciseHistoryEntry } from '../types';

export interface ActiveExercise {
  exercise: Exercise;
  sets: WorkoutSet[];
  // Cross-routine prior performances of this exercise across ALL routines,
  // newest first. Index 0 is the most recent; the SetLogger pages through them.
  histories: ExerciseHistoryEntry[];
  // Routine template row for this exercise, when one exists: target sets/reps/
  // weight for the plan view and target_rest_seconds for the rest countdown.
  template: RoutineExercise | null;
  // Superset membership (AND-10): exercises sharing a groupId are one
  // grouping; sets inherit it at log time. Derived from logged sets on
  // resume, so a link made before any set is logged does not survive a kill.
  groupId: string | null;
}

interface UseWorkoutOptions {
  retroactive?: boolean;
}

// Exact DB columns for the sets table; strips UI-side joins before the row
// goes into the outbox.
function toSetRow(set: WorkoutSet): Record<string, unknown> {
  return {
    id: set.id,
    session_id: set.session_id,
    exercise_id: set.exercise_id,
    set_order: set.set_order,
    set_type: set.set_type,
    reps: set.reps,
    weight_kg: set.weight_kg,
    set_duration_seconds: set.set_duration_seconds,
    rest_seconds: set.rest_seconds,
    rpe: set.rpe ?? null,
    notes: set.notes ?? null,
    group_id: set.group_id ?? null,
    deleted_at: set.deleted_at ?? null,
    started_at: set.started_at,
    completed_at: set.completed_at,
    created_at: set.created_at,
  };
}

// The active-workout record embeds each set's exercise so the workout can
// rehydrate without the server (offline resume after a PWA kill).
function flattenSets(exercises: ActiveExercise[]): SetWithExercise[] {
  return exercises
    .flatMap(e => e.sets.map(s => ({ ...s, exercises: e.exercise })))
    .sort((a, b) => a.set_order - b.set_order);
}

export function useWorkout(sessionId: string, routineId: string, opts: UseWorkoutOptions = {}) {
  const retroactive = opts.retroactive ?? false;
  const [exercises, setExercises] = useState<ActiveExercise[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [setOrder, setSetOrder] = useState(1);
  const [lastSetId, setLastSetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    const lastSamePromise = fetchLastSession(routineId).catch((e) => {
      console.error('Failed to fetch last same-routine session:', e);
      return null;
    });

    // Template rows use the reference-list cache so a planned routine still
    // renders its plan offline; a routine without a template resolves to [].
    const templatesPromise = cachedFetch(`routine-exercises-${routineId}`, () =>
      fetchRoutineExercises(routineId),
    ).catch((e) => {
      console.error('Failed to fetch routine template:', e);
      return [];
    });

    // The local record is authoritative for the current session's sets while
    // a workout is active: it works offline and it is fresher than the server
    // whenever the outbox still holds unsynced writes.
    const persisted = retroactive ? null : loadActiveWorkout();
    const localSets = persisted?.sessionId === sessionId && persisted.sets ? persisted.sets : null;
    const setsPromise: Promise<SetWithExercise[]> = localSets
      ? Promise.resolve(localSets)
      : fetchSessionSets(sessionId);

    Promise.all([lastSamePromise, setsPromise, templatesPromise])
      .then(async ([lastSameRoutine, currentSets, templates]) => {
        // Ordered plan: current-session exercises, then untouched template
        // rows, then leftover exercises from the last same-routine session
        // (see lib/plan.ts).
        const plan = buildPlan(currentSets, templates, lastSameRoutine?.sets ?? []);
        const exerciseMap = new Map<string, ActiveExercise>();
        const exerciseOrder: string[] = [];
        for (const entry of plan) {
          exerciseMap.set(entry.exercise.id, {
            exercise: entry.exercise,
            sets: [],
            histories: [],
            template: entry.template,
            groupId: null,
          });
          exerciseOrder.push(entry.exercise.id);
        }
        for (const set of currentSets) {
          if (!set.exercise_id) continue;
          const entry = exerciseMap.get(set.exercise_id);
          if (!entry) continue;
          entry.sets.push(set);
          // Superset membership survives resume through the sets themselves.
          // Unconditional: sets arrive in set_order, so the LAST set's value
          // wins — a truthy-only assign would resurrect a dissolved link from
          // a partially synced unlink (mixed gid/null rows on the server).
          entry.groupId = set.group_id ?? null;
        }

        // Cross-routine history (AND-25/31): prior performances of each exercise
        // regardless of routine, newest first, excluding the current session.
        // Offline this fails and the workout proceeds without references.
        const historyByExercise = await fetchExerciseHistories(exerciseOrder).catch((e) => {
          console.error('Failed to fetch cross-routine history:', e);
          return new Map<string, ExerciseHistoryEntry[]>();
        });
        for (const exId of exerciseOrder) {
          const entries = (historyByExercise.get(exId) ?? []).filter(e => e.session.id !== sessionId);
          exerciseMap.get(exId)!.histories = entries;
        }

        const result = exerciseOrder.map(id => exerciseMap.get(id)!);
        setExercises(result);

        // Seed the local record from the server copy so a mid-workout kill
        // can rehydrate without network from here on.
        if (!retroactive && !localSets) {
          updateActiveWorkout({ sets: currentSets });
        }

        // Resumed session: jump back to where the user was (last exercise touched).
        // Fresh session: stay on plan view (activeIndex = null) so the user sees
        // the full plan before diving in (AND-26).
        if (currentSets.length > 0) {
          const lastSet = currentSets[currentSets.length - 1];
          const idx = exerciseOrder.findIndex(id => id === lastSet.exercise_id);
          if (idx !== -1) setActiveIndex(idx);
          const maxOrder = Math.max(...currentSets.map(s => s.set_order));
          setSetOrder(maxOrder + 1);
          setLastSetId(lastSet.id);
        }
      })
      .catch((e) => {
        console.error('Failed to load session data:', e);
        toast('Failed to load session data. Check your connection and reopen the workout.');
      })
      .finally(() => setLoading(false));
  }, [sessionId, routineId, retroactive, toast]);

  const persistSets = useCallback((next: ActiveExercise[]) => {
    if (!retroactive) updateActiveWorkout({ sets: flattenSets(next) });
  }, [retroactive]);

  const addExercise = useCallback((exercise: Exercise) => {
    setExercises(prev => {
      const existing = prev.findIndex(e => e.exercise.id === exercise.id);
      if (existing !== -1) {
        setActiveIndex(existing);
        return prev;
      }
      const next = [...prev, { exercise, sets: [], histories: [], template: null, groupId: null }];
      // Lazy-load history for the newly added exercise.
      fetchExerciseHistories([exercise.id])
        .then(map => {
          const entries = (map.get(exercise.id) ?? []).filter(e => e.session.id !== sessionId);
          if (entries.length === 0) return;
          setExercises(curr => curr.map(e =>
            e.exercise.id === exercise.id ? { ...e, histories: entries } : e,
          ));
        })
        .catch(() => {});
      setActiveIndex(next.length - 1);
      return next;
    });
  }, [sessionId]);

  // Re-stamps each exercise's logged sets to its current groupId, pushing
  // outbox upserts for rows that changed. Shared by every mutation that can
  // move group membership; grouping is a property of the session, not of
  // when the user tapped Link.
  const alignSetsToGroups = useCallback((list: ActiveExercise[]): ActiveExercise[] => {
    return list.map(e => {
      if (e.sets.length === 0 || e.sets.every(s => (s.group_id ?? null) === e.groupId)) return e;
      const sets = e.sets.map(s => {
        if ((s.group_id ?? null) === e.groupId) return s;
        const updated = { ...s, group_id: e.groupId };
        pushOutbox({ table: 'sets', op: 'upsert', rowId: s.id, payload: toSetRow(updated) });
        return updated;
      });
      return { ...e, sets };
    });
  }, []);

  const reorderExercise = useCallback((index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= exercises.length) return;
    const swapped = [...exercises];
    [swapped[index], swapped[target]] = [swapped[target], swapped[index]];
    // The link model assumes group members are contiguous (the Link button
    // and display only ever look at neighbours). A member separated by this
    // reorder is unlinked explicitly rather than left silently stale.
    const normalized = swapped.map((e, i) => {
      if (e.groupId === null) return e;
      const adjacent =
        (i > 0 && swapped[i - 1].groupId === e.groupId) ||
        (i < swapped.length - 1 && swapped[i + 1].groupId === e.groupId);
      return adjacent ? e : { ...e, groupId: null };
    });
    const next = alignSetsToGroups(normalized);
    setExercises(next);
    persistSets(next);
  }, [exercises, alignSetsToGroups, persistSets]);

  const removeExercise = useCallback((index: number) => {
    setExercises(prev => prev.filter((_, i) => i !== index));
    setActiveIndex(null);
  }, []);

  // Link/unlink an exercise with the one above it (AND-10). Linking joins the
  // previous exercise's group (or mints one); unlinking removes only this
  // exercise, dissolving the group if a single member remains. Already-logged
  // sets of affected exercises are re-stamped so the session stays coherent —
  // grouping is a property of the session, not of when the user tapped Link.
  const toggleSuperset = useCallback((index: number) => {
    if (index <= 0 || index >= exercises.length) return;
    const prevEx = exercises[index - 1];
    const cur = exercises[index];
    const linked = cur.groupId !== null && cur.groupId === prevEx.groupId;

    let next: ActiveExercise[];
    if (linked) {
      next = exercises.map((e, i) => (i === index ? { ...e, groupId: null } : e));
      const remaining = next.filter(e => e.groupId === cur.groupId);
      if (remaining.length === 1) {
        next = next.map(e => (e.groupId === cur.groupId ? { ...e, groupId: null } : e));
      }
    } else {
      const gid = prevEx.groupId ?? crypto.randomUUID();
      next = exercises.map((e, i) =>
        i === index - 1 || i === index ? { ...e, groupId: gid } : e,
      );
    }

    next = alignSetsToGroups(next);
    setExercises(next);
    persistSets(next);
  }, [exercises, alignSetsToGroups, persistSets]);

  // Mutations are local-first (AND-8): state and the persisted record update
  // synchronously and the server write goes through the outbox, so logging
  // never waits on the network. The async signatures are kept for callers.
  const logSet = useCallback(async (
    exerciseIndex: number,
    data: {
      reps: number;
      weight_kg: number;
      rpe: number | null;
      set_duration_seconds: number | null;
      started_at: string | null;
      completed_at: string | null;
    },
    restSeconds: number | null,
    createdAt?: string,
  ): Promise<WorkoutSet> => {
    const exercise = exercises[exerciseIndex];
    const newSet: WorkoutSet = {
      id: crypto.randomUUID(),
      session_id: sessionId,
      exercise_id: exercise.exercise.id,
      set_order: setOrder,
      set_type: 'working',
      reps: data.reps,
      weight_kg: data.weight_kg,
      rpe: data.rpe,
      notes: null,
      group_id: exercise.groupId,
      deleted_at: null,
      set_duration_seconds: data.set_duration_seconds,
      rest_seconds: restSeconds,
      started_at: data.started_at,
      completed_at: data.completed_at,
      created_at: createdAt ?? new Date().toISOString(),
    };
    const next = exercises.map((e, i) =>
      i === exerciseIndex ? { ...e, sets: [...e.sets, newSet] } : e,
    );
    setExercises(next);
    persistSets(next);
    pushOutbox({ table: 'sets', op: 'upsert', rowId: newSet.id, payload: toSetRow(newSet) });
    setSetOrder(prev => prev + 1);
    setLastSetId(newSet.id);
    return newSet;
  }, [sessionId, exercises, setOrder, persistSets]);

  const editSet = useCallback(async (
    exerciseIndex: number,
    setId: string,
    updates: { reps?: number; weight_kg?: number; rpe?: number | null; notes?: string | null },
  ) => {
    let updated: WorkoutSet | null = null;
    const next = exercises.map((e, i) => {
      if (i !== exerciseIndex) return e;
      return {
        ...e,
        sets: e.sets.map(s => {
          if (s.id !== setId) return s;
          updated = { ...s, ...updates };
          return updated;
        }),
      };
    });
    if (!updated) return;
    setExercises(next);
    persistSets(next);
    pushOutbox({ table: 'sets', op: 'upsert', rowId: setId, payload: toSetRow(updated) });
  }, [exercises, persistSets]);

  // The Undo toast can fire up to ~6s after the delete, from a closure made
  // on an old render; a ref gives it the CURRENT exercise state so a delayed
  // undo cannot clobber sets logged in between, and the duplicate guard makes
  // a double-tapped Undo a no-op.
  const exercisesRef = useRef(exercises);
  useEffect(() => {
    exercisesRef.current = exercises;
  }, [exercises]);

  // Undo for a just-deleted set: reinsert with the SAME id, so the FIFO
  // outbox replays upsert(deleted_at)-then-upsert(null) and the server
  // converges on the restored row.
  const restoreSet = useCallback((set: WorkoutSet): boolean => {
    const current = exercisesRef.current;
    const idx = current.findIndex(e => e.exercise.id === set.exercise_id);
    if (idx === -1) return false;
    if (current[idx].sets.some(s => s.id === set.id)) return false;
    const next = current.map((e, i) =>
      i === idx ? { ...e, sets: [...e.sets, set].sort((a, b) => a.set_order - b.set_order) } : e,
    );
    exercisesRef.current = next;
    setExercises(next);
    persistSets(next);
    // deleted_at explicitly null: the undo upsert must clear the soft-delete
    // stamp the delete upsert wrote, whatever the captured object held.
    pushOutbox({ table: 'sets', op: 'upsert', rowId: set.id, payload: toSetRow({ ...set, deleted_at: null }) });
    return true;
  }, [persistSets]);

  // Soft delete: the row stays on the server with deleted_at stamped, so
  // Layer 2 never silently loses a set it already processed. Local state
  // still drops the row (the UI never shows deleted sets), and restoreSet's
  // full-row upsert of the original set (deleted_at null) is the undo.
  const deleteSet = useCallback(async (exerciseIndex: number, setId: string) => {
    let removed: WorkoutSet | null = null;
    const next = exercises.map((e, i) => {
      if (i !== exerciseIndex) return e;
      removed = e.sets.find(s => s.id === setId) ?? null;
      return { ...e, sets: e.sets.filter(s => s.id !== setId) };
    });
    if (!removed) return;
    setExercises(next);
    persistSets(next);
    pushOutbox({
      table: 'sets',
      op: 'upsert',
      rowId: setId,
      payload: toSetRow({ ...(removed as WorkoutSet), deleted_at: new Date().toISOString() }),
    });
    if (lastSetId === setId) setLastSetId(null);
  }, [exercises, persistSets, lastSetId]);

  const finish = useCallback(async (finishedAt?: string) => {
    const persisted = retroactive ? null : loadActiveWorkout();
    const payload: Record<string, unknown> = {
      id: sessionId,
      finished_at: finishedAt ?? new Date().toISOString(),
    };
    // Locally created sessions carry their identity so the upsert can insert
    // the row even if the original creation write was somehow lost.
    if (persisted?.startedAt) {
      payload.routine_id = routineId;
      payload.started_at = persisted.startedAt;
    }
    pushOutbox({ table: 'sessions', op: 'upsert', rowId: sessionId, payload });
  }, [sessionId, routineId, retroactive]);

  return {
    exercises,
    activeIndex,
    setActiveIndex,
    addExercise,
    removeExercise,
    reorderExercise,
    toggleSuperset,
    logSet,
    editSet,
    deleteSet,
    restoreSet,
    finish,
    loading,
    lastSetId,
    retroactive,
  };
}
