import type { WorkoutSet, ExerciseHistoryEntry } from '../types';

// Heaviest weight this exercise has ever been lifted for, across all prior
// sessions. Zero when there is no history, so any first-ever set is a PR.
export function maxHistoricalWeight(histories: ExerciseHistoryEntry[]): number {
  let max = 0;
  for (const entry of histories) {
    for (const set of entry.sets) {
      if (set.weight_kg > max) max = set.weight_kg;
    }
  }
  return max;
}

// A set is a weight PR when it beats every prior session's weight for the
// exercise. History-less exercises don't badge: everything would be a "PR"
// and the signal would mean nothing.
export function isWeightPr(set: WorkoutSet, histories: ExerciseHistoryEntry[]): boolean {
  if (histories.length === 0) return false;
  return set.weight_kg > maxHistoricalWeight(histories);
}

export interface ExerciseSummary {
  name: string;
  sets: number;
  topWeightKg: number;
  topWeightReps: number;
  isPr: boolean;
}

export interface WorkoutSummary {
  totalSets: number;
  tonnageKg: number;
  prCount: number;
  exercises: ExerciseSummary[];
}

interface SummarisableExercise {
  exercise: { name: string };
  sets: WorkoutSet[];
  histories: ExerciseHistoryEntry[];
}

export function summariseWorkout(exercises: SummarisableExercise[]): WorkoutSummary {
  let totalSets = 0;
  let tonnageKg = 0;
  let prCount = 0;
  const rows: ExerciseSummary[] = [];

  for (const entry of exercises) {
    if (entry.sets.length === 0) continue;
    let top: WorkoutSet = entry.sets[0];
    for (const set of entry.sets) {
      totalSets += 1;
      tonnageKg += set.reps * set.weight_kg;
      if (set.weight_kg > top.weight_kg) top = set;
    }
    const isPr = isWeightPr(top, entry.histories);
    if (isPr) prCount += 1;
    rows.push({
      name: entry.exercise.name,
      sets: entry.sets.length,
      topWeightKg: top.weight_kg,
      topWeightReps: top.reps,
      isPr,
    });
  }

  return { totalSets, tonnageKg: Math.round(tonnageKg), prCount, exercises: rows };
}
