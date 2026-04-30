-- Gym Tracker v2 schema
-- Run this in the Supabase SQL Editor for a fresh install

-- Muscle groups: user-editable exercise categories
create table muscle_groups (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  sort_order integer not null default 0,
  created_at timestamptz default now()
);

-- Routines: user-defined workout labels (e.g. "back A", "chest B")
create table routines (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  color text default '#2563eb',
  created_at timestamptz default now()
);

-- Exercises: built organically from usage
create table exercises (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  muscle_group_id uuid references muscle_groups(id) on delete set null,
  created_at timestamptz default now()
);

-- Sessions: one per workout
create table sessions (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid references routines(id) on delete set null,
  started_at timestamptz default now(),
  finished_at timestamptz,
  notes text
);

-- Sets: individual sets within a session
create table sets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  exercise_id uuid references exercises(id) on delete set null,
  set_order integer not null,
  set_type text not null check (set_type in ('warmup', 'working')),
  reps integer not null,
  weight_kg numeric not null,
  set_duration_seconds integer,
  rest_seconds integer,
  created_at timestamptz default now()
);

-- Indexes
create index idx_sessions_routine on sessions(routine_id, started_at desc);
create index idx_sets_session on sets(session_id, set_order);
create index idx_sets_exercise on sets(exercise_id);

-- RLS
alter table muscle_groups enable row level security;
alter table routines enable row level security;
alter table exercises enable row level security;
alter table sessions enable row level security;
alter table sets enable row level security;

create policy "authenticated access" on muscle_groups for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated access" on routines for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated access" on exercises for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated access" on sessions for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated access" on sets for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Seed default muscle groups
insert into muscle_groups (name, sort_order) values
  ('Back', 1), ('Chest', 2), ('Shoulders', 3),
  ('Legs', 4), ('Arms', 5), ('Core', 6), ('Cardio', 7);

-- Seed initial routine labels
insert into routines (name, color) values
  ('back A', '#2563eb'),
  ('back B', '#dc2626'),
  ('chest A', '#16a34a'),
  ('chest B', '#f59e0b'),
  ('shoulders', '#7c3aed'),
  ('legs', '#ec4899');
