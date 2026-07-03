-- Gym Tracker v3 schema (per-user isolated)
-- Run this in the Supabase SQL Editor for a fresh install.
--
-- Every row is owned by the user who created it (user_id defaults to the
-- authenticated caller via auth.uid()). RLS restricts all access to the owner,
-- so users never see each other's data. There is intentionally no seed data:
-- a new user builds their own muscle groups / routines / exercises through the
-- app (the create flows handle bootstrapping from empty).

-- Muscle groups: user-editable exercise categories
create table muscle_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz default now(),
  constraint muscle_groups_user_name_key unique (user_id, name)
);

-- Routines: user-defined workout labels (e.g. "back A", "chest B")
create table routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  color text default '#2563eb',
  created_at timestamptz default now(),
  constraint routines_user_name_key unique (user_id, name)
);

-- Exercises: built organically from usage
create table exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  muscle_group_id uuid references muscle_groups(id) on delete set null,
  equipment text,
  is_bodyweight boolean not null default false,
  secondary_muscle_group_ids uuid[] not null default '{}',
  created_at timestamptz default now(),
  constraint exercises_user_name_key unique (user_id, name)
);

-- Sessions: one per workout. `source` records the capture surface (Layer 2
-- joins multiple sources by time).
create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  routine_id uuid references routines(id) on delete set null,
  started_at timestamptz default now(),
  finished_at timestamptz,
  notes text,
  source text not null default 'gym-tracker-pwa'
);

-- Sets: individual sets within a session. Soft-deleted via deleted_at so
-- downstream consumers never lose rows they already processed. Sets sharing
-- a group_id form a superset/circuit.
create table sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id uuid not null references sessions(id) on delete cascade,
  exercise_id uuid references exercises(id) on delete set null,
  set_order integer not null,
  set_type text not null default 'working' check (set_type in ('warmup', 'working')),
  reps integer not null,
  weight_kg numeric not null,
  set_duration_seconds integer,
  rest_seconds integer,
  rpe numeric check (rpe is null or (rpe >= 1 and rpe <= 10)),
  notes text,
  group_id uuid,
  deleted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now()
);

-- Routine templates: the planned shape of a routine, independent of history.
-- Also the Layer 2 coach's write-back API (docs/LAYER2_PLAN.md).
create table routine_exercises (
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

-- Indexes
create index idx_muscle_groups_user on muscle_groups(user_id);
create index idx_routines_user on routines(user_id);
create index idx_exercises_user on exercises(user_id);
create index idx_sessions_user_routine on sessions(user_id, routine_id, started_at desc);
create index idx_sets_session on sets(session_id, set_order);
create index idx_sets_exercise on sets(exercise_id);
create index idx_sets_user on sets(user_id);
create index idx_routine_exercises_routine on routine_exercises(routine_id, sort_order);
create index idx_routine_exercises_user on routine_exercises(user_id);

-- Case-insensitive per-user name uniqueness (in addition to the exact-case
-- unique constraints above).
create unique index uq_exercises_user_lower_name on exercises (user_id, lower(name));
create unique index uq_routines_user_lower_name on routines (user_id, lower(name));
create unique index uq_muscle_groups_user_lower_name on muscle_groups (user_id, lower(name));

-- RLS: each user sees and writes only their own rows
alter table muscle_groups enable row level security;
alter table routines enable row level security;
alter table exercises enable row level security;
alter table sessions enable row level security;
alter table sets enable row level security;
alter table routine_exercises enable row level security;

create policy "own muscle_groups" on muscle_groups for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own routines" on routines for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own exercises" on exercises for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own sessions" on sessions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own sets" on sets for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own routine_exercises" on routine_exercises for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
