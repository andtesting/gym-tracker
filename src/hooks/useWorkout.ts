import { useState, useEffect, useCallback } from 'react';
import {
  fetchLastSession,
  fetchSessionSets,
  finishSession,
  fetchExerciseHistories,
} from '../api/sessions';
import { createSet, updateSet as apiUpdateSet, deleteSet as apiDeleteSet, updateSetRest } from '../api/sets';
import type { Exercise, WorkoutSet, ExerciseHistoryEntry } from '../types';
import type { CreateSetInput } from '../api/sets';

export interface ActiveExercise {
  exercise: Exercise;
  sets: WorkoutSet[];
  // Cross-routine prior performances of this exercise across ALL routines,
  // newest first. Index 0 is the most recent; the SetLogger pages through them.
  histories: ExerciseHistoryEntry[];
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
              histories: [],
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
                histories: [],
              });
              exerciseOrder.push(set.exercise_id);
            }
          }
        }

        // Cross-routine history (AND-25/31): prior performances of each exercise
        // regardless of routine, newest first, excluding the current session.
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
      const next = [...prev, { exercise, sets: [], histories: [] }];
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

  const reorderExercise = useCallback((index: number, direction: 'up' | 'down') => {
    setExercises(prev => {
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const removeExercise = useCallback((index: number) => {
    setExercises(prev => prev.filter((_, i) => i !== index));
    setActiveIndex(null);
  }, []);

  const logSet = useCallback(async (
    exerciseIndex: number,
    data: {
      reps: number;
      weight_kg: number;
      set_duration_seconds: number | null;
      started_at: string | null;
      completed_at: string | null;
    },
    restSecondsForPrev: number | null,
    createdAt?: string,
  ): Promise<WorkoutSet> => {
    if (restSecondsForPrev !== null && lastSetId) {
      await updateSetRest(lastSetId, restSecondsForPrev);
    }

    const exercise = exercises[exerciseIndex];
    const input: CreateSetInput = {
      session_id: sessionId,
      exercise_id: exercise.exercise.id,
      set_order: setOrder,
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
    return newSet;
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
    reorderExercise,
    logSet,
    editSet,
    deleteSet,
    finish,
    loading,
    lastSetId,
    retroactive: opts.retroactive ?? false,
  };
}
