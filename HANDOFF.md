# HANDOFF.md

Snapshot of where the project is. Replace every session, never append.

## Current state — 2026-07-07

`main` clean through PR #59, auto-deployed. Routine variants shipped end-to-end last session (data layer #51; UI #53–#56; docs de-staled #57/#58).

This session — two active-workout fixes (#59, browser-verified on the test account, adversarially reviewed):

- **"Last Time" → "Past" column header.** The old label wrapped to two lines in the narrow reference column while "Current" stayed on one, so the two headers misaligned. One word, one line, equal height now.
- **Rest timer preserved on set delete.** The rest clock restarts at every Log Set, so it's always anchored to the newest logged set. Deleting that set stranded the anchor there, so the next set's rest was measured from the delete ("reset"). `onDeleteSet` now re-anchors rest to the latest *remaining* set's `completed_at` (`lib/timer` `latestCompletedMs` + `useTimer` `resumeRest`), dropping to idle when none remain. Undo mirrors it: `onRestoreSet` re-anchors to the restored set when it's the newest, guarded by a live `timerModeRef` (the undo toast fires from a closure frozen at delete time) so it can't clobber an in-progress set.

Tests **126/126** (3 new `latestCompletedMs` cases); lint at the 2-error pre-existing baseline (App.tsx:89, useAuth.ts:21). The code-reviewer agent must be spawned with `isolation: "worktree"`.

## Verification note (test account)

The fixture account's category is **"test press" with variants A/C/B/D** (`test_bench_press` + `test_fly`), kept deliberately as a variants fixture. E2E of the #59 fixes added a few finished "test press A" sessions dated 6–7 July — benign test data. `routine_exercises`/`routines` creation on the variants feature are DIRECT (non-outbox) writes.

## Still owed (not this feature)

- **Andy, phone ~45 min**: build the 12-signal Health Sync Shortcut (`docs/health-sync-shortcut-recipe.md`; token + probe done, curl suite 7/7). Then the 09:00 automation. `health.*` tables empty until it runs.
- Flip Supabase MCP back to `read_only=true` in `~/.claude.json` (no migration in flight; needs a session restart to take effect).
- Mark the variants issues + AND-49 Done in Linear (agent has been permission-blocked on Linear writes).
- `health-lake` build session (`docs/HEALTH_LAKE_PLAN.md`) after a week of ingests.

## Notes

- Deletion is soft at both set and session level; export exposes `deleted_at` + `session_deleted_at`, all other readers filter.
- Plan **order** isn't persisted (buildPlan re-derives from set_order + template sort_order on resume), so eye/skip and mid-workout reorder don't survive a PWA kill — pre-existing limitation, candidate improvement.
