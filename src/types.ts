export interface Routine {
  id: string;
  name: string;
  created_at: string;
}

export interface Exercise {
  id: string;
  name: string;
  created_at: string;
}

export interface Session {
  id: string;
  routine_id: string;
  started_at: string;
  finished_at: string | null;
  notes: string | null;
}

export interface SessionWithRoutine extends Session {
  routines: Routine;
}

export interface WorkoutSet {
  id: string;
  session_id: string;
  exercise_id: string;
  set_order: number;
  set_type: 'warmup' | 'working';
  reps: number;
  weight_kg: number;
  set_duration_seconds: number | null;
  rest_seconds: number | null;
  created_at: string;
}

export interface SetWithExercise extends WorkoutSet {
  exercises: Exercise;
}

export interface LastSessionData {
  session: Session;
  sets: SetWithExercise[];
}

export type Screen =
  | { name: 'home' }
  | { name: 'sessionDetail'; sessionId: string }
  | { name: 'pickRoutine' }
  | { name: 'activeWorkout'; sessionId: string; routineId: string; routineName: string };
