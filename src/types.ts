export interface MuscleGroup {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface Routine {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface Exercise {
  id: string;
  name: string;
  muscle_group_id: string | null;
  muscle_groups: MuscleGroup | null;
  created_at: string;
}

export interface Session {
  id: string;
  routine_id: string | null;
  started_at: string;
  finished_at: string | null;
  notes: string | null;
}

export interface SessionWithRoutine extends Session {
  routines: Routine | null;
}

export interface WorkoutSet {
  id: string;
  session_id: string;
  exercise_id: string | null;
  set_order: number;
  set_type: 'warmup' | 'working';
  reps: number;
  weight_kg: number;
  set_duration_seconds: number | null;
  rest_seconds: number | null;
  // RPE 1-10, half steps in the UI (DB allows quarter steps). Null = not rated.
  rpe: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface SetWithExercise extends WorkoutSet {
  exercises: Exercise | null;
}

export interface LastSessionData {
  session: Session;
  sets: SetWithExercise[];
}

export interface ExerciseHistoryEntry {
  session: SessionWithRoutine;
  sets: WorkoutSet[];
}

export interface RoutineSessionHistory {
  session: SessionWithRoutine;
  sets: SetWithExercise[];
}

export interface HeatmapSession {
  id: string;
  routine_id: string | null;
  started_at: string;
  routines: { name: string; color: string } | null;
}

export type Screen =
  | { name: 'home' }
  | { name: 'sessionDetail'; sessionId: string }
  | { name: 'pickRoutine' }
  | { name: 'activeWorkout'; sessionId: string; routineId: string; routineName: string }
  | { name: 'logPastWorkout'; date?: string }
  | { name: 'retroactiveWorkout'; sessionId: string; routineId: string; routineName: string; date: string }
  | { name: 'editMode' }
  | { name: 'trends' }
  | { name: 'settings' };
