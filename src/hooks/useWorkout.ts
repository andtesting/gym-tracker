import { useState, useEffect, useCallback } from 'react';
import { fetchLastSession, finishSession } from '../api/sessions';
import { createSet, updateSetRest } from '../api/sets';
import type { Exercise, WorkoutSet, SetWithExercise, LastSessionData } from '../types';
import type { CreateSetInput } from '../api/sets';

interface ActiveExercise {
  exercise: Exercise;
  sets: WorkoutSet[];
  lastSessionSets: SetWithExercise[];
}

export function useWorkout(sessionId: string, routineId: string) {
  const [exercises, setExercises] = useState<ActiveExercise[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [setOrder, setSetOrder] = useState(1);
  const [lastSetId, setLastSetId] = useState<string | null>(null);
  const [lastSessionData, setLastSessionData] = useState<LastSessionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLastSession(routineId)
      .then(data => {
        setLastSessionData(data);
        if (data) {
          const exerciseMap = new Map<string, { exercise: Exercise; sets: SetWithExercise[] }>();
          for (const set of data.sets) {
            const key = set.exercise_id;
            if (!exerciseMap.has(key)) {
              exerciseMap.set(key, { exercise: set.exercises, sets: [] });
            }
            exerciseMap.get(key)!.sets.push(set);
          }
          const prepopulated: ActiveExercise[] = Array.from(exerciseMap.values()).map(
            ({ exercise, sets }) => ({ exercise, sets: [], lastSessionSets: sets })
          );
          setExercises(prepopulated);
          if (prepopulated.length > 0) setActiveIndex(0);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [routineId]);

  const addExercise = useCallback((exercise: Exercise) => {
    setExercises(prev => {
      const exists = prev.some(e => e.exercise.id === exercise.id);
      if (exists) {
        setActiveIndex(prev.findIndex(e => e.exercise.id === exercise.id));
        return prev;
      }
      const lastSets = lastSessionData?.sets.filter(s => s.exercise_id === exercise.id) ?? [];
      const next = [...prev, { exercise, sets: [], lastSessionSets: lastSets }];
      setActiveIndex(next.length - 1);
      return next;
    });
  }, [lastSessionData]);

  const removeExercise = useCallback((index: number) => {
    setExercises(prev => prev.filter((_, i) => i !== index));
    setActiveIndex(null);
  }, []);

  const logSet = useCallback(async (
    exerciseIndex: number,
    data: { reps: number; weight_kg: number; set_type: 'warmup' | 'working'; set_duration_seconds: number | null },
    restSecondsForPrev: number | null,
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
    };

    const newSet = await createSet(input);
    setExercises(prev => prev.map((e, i) =>
      i === exerciseIndex ? { ...e, sets: [...e.sets, newSet] } : e
    ));
    setSetOrder(prev => prev + 1);
    setLastSetId(newSet.id);
  }, [sessionId, exercises, setOrder, lastSetId]);

  const finish = useCallback(async () => {
    await finishSession(sessionId);
  }, [sessionId]);

  return {
    exercises,
    activeIndex,
    setActiveIndex,
    addExercise,
    removeExercise,
    logSet,
    finish,
    loading,
    lastSetId,
  };
}
