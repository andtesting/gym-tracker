# HANDOFF.md

Snapshot of where the project is. Replace every session, never append.

## Current state — 2026-07-03

Branch: `main` (clean). Housekeeping changes sit on `chore/verify-setup-docs` (PR open, unmerged).

Shipped this session (PR #12, merged to `main`, auto-deployed to Pages):

- **AND-37** — rest model flipped from "rest after this set" to "rest **before** this set" so the first set of a new exercise shows its rest. Touched capture (`ActiveWorkout`), storage (`useWorkout.logSet` + `createSet`), and 5 display sites. Removed dead `updateSetRest`/`recordRest`.
- **AND-38** — heatmap bucketed by UTC date while cells are local; added unit-tested `src/lib/date.ts` `localDateKey()`, used in `ActivityHeatmap` + `HomeScreen`.

Both went through an adversarial review pass; 3 findings fixed (migration idempotency guard, log-set ref race, fetch-window skew). Build/lint/tests green (34/34).

## Next steps (do these first)

1. **Run the AND-37 migration — NOT yet applied.** `sql/migrations/2026-07-02-rest-before-set.sql`. Until it runs, historical rest displays are shifted by one (new workouts are already correct). It's idempotent + guarded. Two ways:
   - Supabase MCP is now configured (hosted HTTP, OAuth, project-scoped, `database,docs`, **write-capable**). Run `/mcp` → authenticate `supabase` → then Claude can apply it and verify.
   - Or paste it into the Supabase SQL Editor yourself (back up `sets` first).
   - After it's applied, consider re-adding the MCP with `&read_only=true` (or revoke the OAuth grant).

2. **UI verification is still blindspotted.** No Supabase creds were available this session, so AND-37/38 were verified via build/lint/unit tests only, not a live Chrome run. `.env` now exists locally (public anon key, gitignored). To let Claude self-verify the UI next time: create an RLS-isolated test user in the Supabase dashboard and drop its email/password into `.secrets.local.json` (see `.secrets.local.example.json`). Manual check worth doing regardless: log 3 sets on exercise A → switch to B → rest → log B's first set (should show its rest; A's first set stays blank); confirm an early-AM workout colours the correct local day.

## Notes

- Linear AND-37 and AND-38 are marked Done.
- Export `date` column still uses the UTC split (deliberately out of scope; it carries full `started_at` too). Flag as a follow-up if the export day ever matters.
