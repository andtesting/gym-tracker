-- Migration: rest_seconds "rest after" -> "rest before" this set (AND-37)
-- Run ONCE in the Supabase SQL Editor against the live database.
--
-- STATUS: APPLIED to prod 2026-07-03 (via Supabase MCP apply_migration). Marker row
--   '2026-07-02-rest-before-set' present in _migrations; 192/197 rows shifted, 0
--   mismatches vs a from-backup recompute, confirmed on mobile. Idempotent, so a
--   re-run against this DB is a guarded no-op. Kept for fresh-install / audit history.
--
-- Background:
--   Until now the app stored `sets.rest_seconds` as the rest taken AFTER a set
--   (written onto the previously-logged set when the next Start Set was pressed),
--   while every screen rendered it as the rest taken BEFORE a set. Across an
--   exercise boundary the inter-exercise rest landed on the previous exercise's
--   last set, where it was never displayed. The app now stores rest_seconds as
--   the rest taken BEFORE this set, so each set is self-describing.
--
-- Run this together with the code change. The new UI reads rest_seconds as
-- "rest before this set", so every session logged since AND-34 shipped will
-- display its rest shifted by one position until this migration runs. New
-- workouts are correct without it; historical rows are not.
--
-- What it does:
--   For each session, shifts rest_seconds forward one position by set_order so
--   historical data matches the new model:
--       new rest_seconds[set N] = old rest_seconds[set N-1]
--       new rest_seconds[first set of session] = NULL
--   Retroactive sets (rest_seconds already NULL) are unaffected.
--
-- Safety:
--   * Wrapped in a transaction.
--   * Idempotent: guarded by a `_migrations` marker row, so a second run is a
--     no-op (a bare shift would otherwise silently shift the data again).
--   * The window function reads the pre-migration snapshot, so the whole shift
--     is computed atomically (no set reads another set's already-updated value).
--   * Ordering has an explicit tiebreak (created_at, id) so the shift is
--     deterministic even if a session ever had duplicate set_order values.
--   * Still: take a backup of `sets` first (the app's export, or `select * from
--     sets`) before running.

begin;

do $$
begin
  create table if not exists _migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  );

  if exists (select 1 from _migrations where name = '2026-07-02-rest-before-set') then
    raise notice 'Migration 2026-07-02-rest-before-set already applied; skipping.';
    return;
  end if;

  with shifted as (
    select
      id,
      lag(rest_seconds) over (
        partition by session_id
        order by set_order, created_at, id
      ) as new_rest
    from sets
  )
  update sets s
  set rest_seconds = shifted.new_rest
  from shifted
  where shifted.id = s.id
    and s.rest_seconds is distinct from shifted.new_rest;

  insert into _migrations(name) values ('2026-07-02-rest-before-set');
end $$;

commit;
