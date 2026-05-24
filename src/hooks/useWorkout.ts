import { useState, useEffect, useCallback } from 'react';
import {
  fetchLastSession,
  fetchSessionSets,
  finishSession,
  fetchLastSetsForExercises,
} from '../api/sessions';
import { createSet, updateSet as apiUpdateSet, deleteSet as apiDeleteSet, updateSetRest } from '../api/sets';
import type { Exercise, WorkoutSet, ExerciseHistoryEntry } from '../types';
import type { CreateSetInput } from '../api/sets';

export interface ActiveExercise {
  exercise: Exercise;
  sets: WorkoutSet[];
  // Cross-routine: most recent prior performance of this exercise across ALL routines.
  history: ExerciseHistoryEntry | null;
}

interface UseWorkoutOptions {
  retroactive?: boolean;
}

export function useWorkout(sessionId: string, routineId: string, opts: UseWorkoutOptions = {}) {
  const [exercises, setExercises] = useState<ActiveExercise[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [setOrder, setSetOrder] = useState(1);
  const [lastSetId, setLastSetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const lastSamePromise = fetchLastSession(routineId).catch((e) => {
      console.error('Failed to fetch last same-routine session:', e);
      return null;
    });

    Promise.all([lastSamePromise, fetchSessionSets(sessionId)])
      .then(async ([lastSameRoutine, currentSets]) => {
        // Build ordered list: current-session exercises first (in set_order),
        // then pre-populate any leftover exercises from the most recent
        // same-routine session that we haven't touched yet.
        const exerciseMap = new Map<string, ActiveExercise>();
        const exerciseOrder: string[] = [];

        for (const set of currentSets) {
          if (!set.exercise_id || !set.exercises) continue;
          if (!exerciseMap.has(set.exercise_id)) {
            exerciseMap.set(set.exercise_id, {
              exercise: set.exercises,
              sets: [],
              history: null,
            });
            exerciseOrder.push(set.exercise_id);
          }
          exerciseMap.get(set.exercise_id)!.sets.push(set);
        }

        if (lastSameRoutine) {
          for (const set of lastSameRoutine.sets) {
            if (!set.exercise_id || !set.exercises) continue;
            if (!exerciseMap.has(set.exercise_id)) {
              exerciseMap.set(set.exercise_id, {
                exercise: set.exercises,
                sets: [],
                history: null,
              });
              exerciseOrder.push(set.exercise_id);
            }
          }
        }

        // Cross-routine history (AND-25): for every exercise on the plan,
        // fetch the most recent prior performance regardless of routine.
        const historyByExercise = await fetchLastSetsForExercises(exerciseOrder).catch((e) => {
          console.error('Failed to fetch cross-routine history:', e);
          return new Map<string, ExerciseHistoryEntry>();
        });
        // Drop "history" entries that point at the current session itself.
        for (const exId of exerciseOrder) {
          const entry = historyByExercise.get(exId);
          if (entry && entry.session.id !== sessionId) {
            exerciseMap.get(exId)!.history = entry;
          }
        }

        const result = exerciseOrder.map(id => exerciseMap.get(id)!);
        setExercises(result);

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
      .catch((e) => console.error('Failed to load session data:', e))
      .finally(() => setLoading(false));
  }, [sessionId, routineId]);

  const addExercise = useCallback((exercise: Exercise) => {
    setExercises(prev => {
      const existing = prev.findIndex(e => e.exercise.id === exercise.id);
      if (existing !== -1) {
        setActiveIndex(existing);
        return prev;
      }
      const next = [...prev, { exercise, sets: [], history: null }];
      // Lazy-load history for the newly added exercise.
      fetchLastSetsForExercises([exercise.id])
        .then(map => {
          const entry = map.get(exercise.id);
          if (!entry || entry.session.id === sessionId) return;
          setExercises(curr => curr.map(e =>
            e.exercise.id === exercise.id ? { ...e, history: entry } : e,
          ));
        })
        .catch(() => {});
      setActiveIndex(next.length - 1);
      return next;
    });
  }, [sessionId]);

  const removeExercise = useCallback((index: number) => {
    setExercises(prev => prev.filter((_, i) => i !== index));
    setActiveIndex(null);
  }, []);

  const logSet = useCallback(async (
    exerciseIndex: number,
    data: {
      reps: number;
      weight_kg: number;
      set_type: 'warmup' | 'working';
      set_duration_seconds: number | null;
      started_at: string | null;
      completed_at: string | null;
    },
    restSecondsForPrev: number | null,
    createdAt?: string,
  ) => {
    if (restSecondsForPrev !== null && lastSetId) {
      await updateSetRest(lastSetId, restSecondsForPrev);
    }

    const exercise = exercises[exerciseIndex];
    const input: CreateSetInput = {
      session_id: sessionId,
      exercise_id: exercise.exercise.id,
      set_order: setOrder,
      set_type: data.set_type,
      reps: data.reps,
      weight_kg: data.weight_kg,
      set_duration_seconds: data.set_duration_seconds,
      started_at: data.started_at,
      completed_at: data.completed_at,
    };
    if (createdAt) input.created_at = createdAt;

    const newSet = await createSet(input);
    setExercises(prev => prev.map((e, i) =>
      i === exerciseIndex ? { ...e, sets: [...e.sets, newSet] } : e,
    ));
    setSetOrder(prev => prev + 1);
    setLastSetId(newSet.id);
  }, [sessionId, exercises, setOrder, lastSetId]);

  const editSet = useCallback(async (
    exerciseIndex: number,
    setId: string,
    updates: { reps?: number; weight_kg?: number },
  ) => {
    await apiUpdateSet(setId, updates);
    setExercises(prev => prev.map((e, i) => {
      if (i !== exerciseIndex) return e;
      return {
        ...e,
        sets: e.sets.map(s => s.id === setId ? { ...s, ...updates } : s),
      };
    }));
  }, []);

  const deleteSet = useCallback(async (exerciseIndex: number, setId: string) => {
    await apiDeleteSet(setId);
    setExercises(prev => prev.map((e, i) => {
      if (i !== exerciseIndex) return e;
      return { ...e, sets: e.sets.filter(s => s.id !== setId) };
    }));
    if (lastSetId === setId) setLastSetId(null);
  }, [lastSetId]);

  const finish = useCallback(async (finishedAt?: string) => {
    await finishSession(sessionId, finishedAt);
  }, [sessionId]);

  return {
    exercises,
    activeIndex,
    setActiveIndex,
    addExercise,
    removeExercise,
    logSet,
    editSet,
    deleteSet,
    finish,
    loading,
    lastSetId,
    retroactive: opts.retroactive ?? false,
  };
}
