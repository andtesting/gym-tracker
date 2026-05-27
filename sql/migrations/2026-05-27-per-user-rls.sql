-- Migration: per-user isolation (AND-35)
-- Run ONCE in the Supabase SQL Editor against the live database.
--
-- What it does:
--   * Adds user_id to every data table, backfilled to the single existing user.
--   * Makes user_id default to auth.uid() so app inserts auto-own rows.
--   * Swaps global unique(name) constraints for per-user unique(user_id, name).
--   * Replaces the permissive "authenticated access" RLS policies with
--     owner-only policies (user_id = auth.uid()).
--
-- Safety: wrapped in a transaction and guarded to abort unless EXACTLY ONE
-- auth user exists (so the blanket backfill is unambiguous). If you have more
-- than one user already, stop and assign user_id per row by hand instead.
--
-- Pre-req: disable public sign-ups in Supabase Auth settings first.

begin;

-- 0. Guard: exactly one user, or abort the whole transaction.
do $$
declare user_count int;
begin
  select count(*) into user_count from auth.users;
  if user_count <> 1 then
    raise exception
      'Expected exactly 1 auth user for the blanket backfill, found %. Aborting.',
      user_count;
  end if;
end $$;

-- 1. Add user_id columns (nullable for now so the backfill can fill them).
alter table muscle_groups add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table routines      add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table exercises     add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table sessions      add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table sets          add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- 2. Backfill every existing row to the sole user.
update muscle_groups set user_id = (select id from auth.users limit 1) where user_id is null;
update routines      set user_id = (select id from auth.users limit 1) where user_id is null;
update exercises     set user_id = (select id from auth.users limit 1) where user_id is null;
update sessions      set user_id = (select id from auth.users limit 1) where user_id is null;
update sets          set user_id = (select id from auth.users limit 1) where user_id is null;

-- 3. Default to the authenticated caller, then enforce NOT NULL.
alter table muscle_groups alter column user_id set default auth.uid();
alter table routines      alter column user_id set default auth.uid();
alter table exercises     alter column user_id set default auth.uid();
alter table sessions      alter column user_id set default auth.uid();
alter table sets          alter column user_id set default auth.uid();

alter table muscle_groups alter column user_id set not null;
alter table routines      alter column user_id set not null;
alter table exercises     alter column user_id set not null;
alter table sessions      alter column user_id set not null;
alter table sets          alter column user_id set not null;

-- 4. set_type default (the warmup/working UI was removed; new sets are 'working').
alter table sets alter column set_type set default 'working';

-- 5. Replace global unique(name) with per-user unique(user_id, name).
-- Guard: the original schema used inline `name text unique not null`, which
-- Postgres names `<table>_name_key`. If a constraint was ever renamed/recreated
-- the drop below would silently no-op and leave the OLD global-unique in place
-- (which would later block a second user from reusing a name). Abort if the
-- expected constraints aren't found exactly.
do $$
declare missing text;
begin
  select string_agg(t, ', ') into missing
  from (values ('muscle_groups_name_key'), ('routines_name_key'), ('exercises_name_key')) as v(t)
  where not exists (
    select 1 from pg_constraint
    where conname = v.t and contype = 'u'
  );
  if missing is not null then
    raise exception 'Expected unique constraints not found: %. Inspect pg_constraint and adjust the drops before running.', missing;
  end if;
end $$;

alter table muscle_groups drop constraint if exists muscle_groups_name_key;
alter table routines      drop constraint if exists routines_name_key;
alter table exercises     drop constraint if exists exercises_name_key;

alter table muscle_groups add constraint muscle_groups_user_name_key unique (user_id, name);
alter table routines      add constraint routines_user_name_key      unique (user_id, name);
alter table exercises     add constraint exercises_user_name_key     unique (user_id, name);

-- 6. Helpful indexes.
create index if not exists idx_muscle_groups_user      on muscle_groups(user_id);
create index if not exists idx_routines_user           on routines(user_id);
create index if not exists idx_exercises_user          on exercises(user_id);
create index if not exists idx_sessions_user_routine   on sessions(user_id, routine_id, started_at desc);
create index if not exists idx_sets_user               on sets(user_id);

-- 7. Swap RLS policies: drop permissive, add owner-only.
drop policy if exists "authenticated access" on muscle_groups;
drop policy if exists "authenticated access" on routines;
drop policy if exists "authenticated access" on exercises;
drop policy if exists "authenticated access" on sessions;
drop policy if exists "authenticated access" on sets;

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

commit;

-- ── Verification (run these AFTER the transaction commits) ──────────────────
-- Each should return 0:
--   select count(*) from muscle_groups where user_id is null;
--   select count(*) from routines      where user_id is null;
--   select count(*) from exercises     where user_id is null;
--   select count(*) from sessions      where user_id is null;
--   select count(*) from sets          where user_id is null;
-- Policies should list the five "own ..." policies:
--   select tablename, policyname from pg_policies
--     where tablename in ('muscle_groups','routines','exercises','sessions','sets')
--     order by tablename;
