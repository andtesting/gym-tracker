-- Migration: rest_seconds "rest after" -> "rest before" this set (AND-37)
-- Run ONCE in the Supabase SQL Editor against the live database.
--
-- Background:
--   Until now the app stored `sets.rest_seconds` as the rest taken AFTER a set
--   (written onto the previously-logged set when the next Start Set was pressed),
--   while every screen rendered it as the rest taken BEFORE a set. Across an
--   exercise boundary the inter-exercise rest landed on the previous exercise's
--   last set, where it was never displayed. The app now stores rest_seconds as
--   the rest taken BEFORE this set, so each set is self-describing.
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
--   * The window function reads the pre-migration snapshot, so the whole shift
--     is computed atomically (no set reads another set's already-updated value).
--   * NOT idempotent: running it twice shifts twice. Run exactly once. Take a
--     backup of `sets` first (the app's export, or a `select * from sets`).
--
-- This migration is optional: the code change is correct for all NEW workouts
-- without it. It only realigns rest logged since AND-34 shipped.

begin;

with shifted as (
  select
    id,
    lag(rest_seconds) over (partition by session_id order by set_order) as new_rest
  from sets
)
update sets s
set rest_seconds = shifted.new_rest
from shifted
where shifted.id = s.id
  and s.rest_seconds is distinct from shifted.new_rest;

commit;
