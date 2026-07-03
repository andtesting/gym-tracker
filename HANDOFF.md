# HANDOFF.md

Snapshot of where the project is. Replace every session, never append.

## Current state — 2026-07-04

Branch: `main`, clean, merged through PR #44, auto-deployed. This session: Phase 3 migration applied to the live DB; Health Sync server side built, live, and fully curl-verified with the real token (7/7, #31/#32, tables wiped clean after); full Phase 3 UI adoption (#33 RPE, #34 per-set notes, #35 templates + rest countdown, #36 supersets, #37 set soft delete, #42 exercise metadata More panel); rest countdown reworked to opt-in per Andy (#39, alarm via transform:scale after #41); session-level soft delete (#43, `sessions.deleted_at` migration applied 2026-07-04). Every PR went through finder-review → steelman → amend → squash-merge; reviews caught real bugs pre-merge (unlogged-500 date gap, iOS Safari blur-swallowed deletes, resurrected superset links, secondary-muscle lost-update race, orphaned-primary double-count).

Chrome verification DONE on the test account (password restored by Andy mid-session, now current in `.secrets.local.json`): plan editor with targets, template seeding, RPE chips + column, per-set note edit/display, superset link + re-stamp + session-log tag, delete toast, countdown left/over states, count-up alarm, resume-after-reload. Not exercised end-to-end: the Undo restore tap (toast expired mid-test; logic reviewer-verified) and SessionDetail's combined A1/B1 superset rendering (unit-tested in setGroups.test.ts).

Linear: AND-54 (new), AND-9, AND-6, AND-10 all Done with PR links. AND-49 still shows In Review — flipping it was permission-blocked; mark it Done manually. Tests 91/91; lint at its 2-error baseline.

## Next steps (in order)

1. **Andy, ~25 min on phone**: `docs/health-sync-shortcut-recipe.md` from step 1 (token already fetched and in `.secrets.local.json` + the curl suite passed 7/7 against the deployed function on 2026-07-04) — the 2-min probe (HRV/Sleep in "Find Health Samples"?), build, first run, 09:00 automation. `health.*` tables are empty and waiting.
2. Flip Supabase MCP back to `read_only=true` in `~/.claude.json` (deferred on request; no migration work remains).
3. Mark AND-49 Done in Linear (permission-blocked for the agent).
4. Still owed from before: the real-device pass (icons, dark mode, keypad, airplane-mode drill, back gesture) — now including a glance at the new rest-timer states and the exercise More panel.
5. After a week of clean daily ingests (`select * from health.ingest_log`): L2.1 correlation views / session HR on SessionDetail.

## Notes

- Deletion is now soft at BOTH levels (sets #37, sessions #43); export exposes `deleted_at` + `session_deleted_at`, everything else filters.
- Superset links made before any set is logged don't survive a PWA kill (membership rides on the sets; documented in useWorkout).
- A password-reset email was sent to the test account's inbox mid-session (mis-click during the stale-password diagnosis); ignore it.
- Sheets-close-on-back-gesture: still descoped, same reasons as before (history-state-machine refactor, own PR).
- Reps chips round to whole reps (2.5 step jumps 3); independent per-field step pairs still offered, unanswered.
