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
  // Variant grouping (docs/ROUTINE_VARIANTS_PLAN.md): routines sharing a
  // `category` are variants of it; `variant_label` (A/B/C) + `variant_order`
  // drive display and cycling. All three null on a legacy/ungrouped routine.
  category: string | null;
  variant_label: string | null;
  variant_order: number | null;
  created_at: string;
}

// A category and its ordered variants, derived from the flat routine list.
export interface RoutineCategory {
  // The grouping key: `category` when set, else the routine's own name.
  name: string;
  variants: Routine[];
}

export interface Exercise {
  id: string;
  name: string;
  muscle_group_id: string | null;
  muscle_groups: MuscleGroup | null;
  // Layer 2 metadata: correct per-muscle volume needs to know what else an
  // exercise hits and whether the load is external. No in-app behaviour
  // depends on these.
  equipment: string | null;
  is_bodyweight: boolean;
  secondary_muscle_group_ids: string[];
  created_at: string;
}

// Routine template row: the planned shape of a routine, independent of
// history. Also the Layer 2 coach's write-back surface (LAYER2_PLAN.md).
export interface RoutineExercise {
  id: string;
  routine_id: string;
  exercise_id: string;
  sort_order: number;
  target_sets: number | null;
  target_reps: number | null;
  target_weight_kg: number | null;
  target_rest_seconds: number | null;
  created_at: string;
}

export interface RoutineExerciseWithExercise extends RoutineExercise {
  exercises: Exercise | null;
}

export interface Session {
  id: string;
  routine_id: string | null;
  started_at: string;
  finished_at: string | null;
  notes: string | null;
  // Soft delete: the app never hard-deletes sessions (Layer 2 contract).
  deleted_at: string | null;
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
  // Subjective per-set context ("left shoulder twinge"); unreconstructable later.
  notes: string | null;
  // Sets sharing a group_id belong to one superset/circuit grouping (AND-10).
  group_id: string | null;
  // Soft delete: Layer 2 must never silently lose rows it already processed.
  // Every set-reading query except the export filters .is('deleted_at', null).
  deleted_at: string | null;
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
