-- Phase 3 data-contract migration (docs/DEEP_REVIEW_AND_V2_PLAN.md, Phase 3).
-- Additive only: new nullable/defaulted columns, one new table, new indexes.
-- Safe to apply to the live DB at any time; every statement is guarded so a
-- re-run is a no-op. Apply via the Supabase SQL Editor (no migration runner).
--
-- NOTE: no app code reads or writes these columns yet. UI for RPE, notes,
-- templates and supersets ships only after this migration is applied to prod.

-- Provenance: which capture surface wrote the row (Layer 2 joins sources).
alter table sessions add column if not exists source text not null default 'gym-tracker-pwa';

-- Soft delete: Layer 2 must never silently lose rows it already processed.
-- IMPORTANT: the same PR that starts WRITING deleted_at must add
-- .is('deleted_at', null) to every set-reading query (fetchSessionSets,
-- fetchExerciseHistories, fetchExerciseTrends, fetchExportSets keeps ALL
-- rows deliberately) or soft-deleted sets reappear in history and stats.
alter table sets add column if not exists deleted_at timestamptz;

-- Effort context (RPE 1-10, quarter steps allowed).
alter table sets add column if not exists rpe numeric
  check (rpe is null or (rpe >= 1 and rpe <= 10));

-- Subjective context ("left shoulder twinge") is unreconstructable later.
alter table sets add column if not exists notes text;

-- Supersets/circuits: sets sharing a group_id belong to one grouping (AND-10).
alter table sets add column if not exists group_id uuid;

-- Exercise metadata for correct per-muscle volume at Layer 2.
alter table exercises add column if not exists equipment text;
alter table exercises add column if not exists is_bodyweight boolean not null default false;
alter table exercises add column if not exists secondary_muscle_group_ids uuid[] not null default '{}';

-- Routine templates: the planned shape of a routine, independent of history.
-- This table is also the Layer 2 coach's write-back API (LAYER2_PLAN.md):
-- the coach proposes target rows, the human approves, the app renders the
-- plan and per-exercise rest targets (AND-6) from them.
create table if not exists routine_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  routine_id uuid not null references routines(id) on delete cascade,
  exercise_id uuid not null references exercises(id) on delete cascade,
  sort_order integer not null default 0,
  target_sets integer,
  target_reps integer,
  target_weight_kg numeric,
  target_rest_seconds integer,
  created_at timestamptz default now(),
  unique (routine_id, exercise_id)
);

alter table routine_exercises enable row level security;

do $$ begin
  create policy "own routine_exercises" on routine_exercises for all
    using (user_id = auth.uid()) with check (user_id = auth.uid());
exception when duplicate_object then null; end $$;

create index if not exists idx_routine_exercises_routine on routine_exercises(routine_id, sort_order);
create index if not exists idx_routine_exercises_user on routine_exercises(user_id);

-- Case-insensitive per-user name uniqueness ("Bench Press" vs "bench press").
-- The original unique(user_id, name) constraints remain. These indexes FAIL
-- if existing rows differ only by case; merge those rows manually, then
-- re-run this file.
create unique index if not exists uq_exercises_user_lower_name on exercises (user_id, lower(name));
create unique index if not exists uq_routines_user_lower_name on routines (user_id, lower(name));
create unique index if not exists uq_muscle_groups_user_lower_name on muscle_groups (user_id, lower(name));
