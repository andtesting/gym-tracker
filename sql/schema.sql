-- Gym Tracker schema
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New query)

-- Routines: user-defined workout labels (e.g. "back A", "chest B")
create table routines (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  created_at timestamptz default now()
);

-- Exercises: built organically from usage
create table exercises (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  created_at timestamptz default now()
);

-- Sessions: one per workout
create table sessions (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references routines(id),
  started_at timestamptz default now(),
  finished_at timestamptz,
  notes text
);

-- Sets: individual sets within a session
create table sets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  exercise_id uuid not null references exercises(id),
  set_order integer not null,
  set_type text not null check (set_type in ('warmup', 'working')),
  reps integer not null,
  weight_kg numeric not null,
  set_duration_seconds integer,
  rest_seconds integer,
  created_at timestamptz default now()
);

-- Indexes for common queries
create index idx_sessions_routine on sessions(routine_id, started_at desc);
create index idx_sets_session on sets(session_id, set_order);
create index idx_sets_exercise on sets(exercise_id);

-- RLS: permissive policies for v1 (single user, no auth)
alter table routines enable row level security;
alter table exercises enable row level security;
alter table sessions enable row level security;
alter table sets enable row level security;

create policy "allow all" on routines for all using (true) with check (true);
create policy "allow all" on exercises for all using (true) with check (true);
create policy "allow all" on sessions for all using (true) with check (true);
create policy "allow all" on sets for all using (true) with check (true);

-- Seed initial routine labels
insert into routines (name) values
  ('back A'),
  ('back B'),
  ('chest A'),
  ('chest B'),
  ('shoulders'),
  ('legs');
