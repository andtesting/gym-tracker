# HANDOFF.md

Snapshot of where the project is. Replace every session, never append.

## Current state — 2026-07-04

Branch: `main`, clean, merged through PR #39, auto-deployed. This session: Phase 3 migration applied to the live DB; Health Sync server side built and live (#31/#32: `health` schema, `ingest-health` edge function v4, curl fixtures, Shortcut recipe); full Phase 3 UI adoption (#33 RPE quick-tap, #34 per-set notes, #35 templates + rest countdown, #36 supersets, #37 soft delete); rest countdown reworked to opt-in per Andy (#39: Settings toggle, 120s default target, count-up default goes large/bold/red past 3:00 in a fixed-height bar so no reflow). Every PR went through finder-review → steelman → amend → squash-merge; reviews caught real bugs pre-merge (unlogged-500 date gap, iOS Safari blur-swallowed deletes, resurrected superset links on resume, HrPoints contamination in the Shortcut recipe).

Chrome verification DONE on the test account (password restored by Andy mid-session, now current in `.secrets.local.json`): plan editor with targets, template seeding, RPE chips + column, per-set note edit/display, superset link + re-stamp + session-log tag, delete toast, countdown left/over states, count-up alarm, resume-after-reload. Not exercised end-to-end: the Undo restore tap (toast expired mid-test; logic reviewer-verified) and SessionDetail's combined A1/B1 superset rendering (unit-tested in setGroups.test.ts).

Linear: AND-54 (new), AND-9, AND-6, AND-10 all Done with PR links. AND-49 still shows In Review — flipping it was permission-blocked; mark it Done manually. Tests 91/91; lint at its 2-error baseline.

## Next steps (in order)

1. **Andy, ~30 min on phone**: `docs/health-sync-shortcut-recipe.md` — step 0 fetches the ingest token via SQL Editor (paste into `.secrets.local.json` as `health_ingest_token` AND into the Shortcut), then the 2-min probe (HRV/Sleep in "Find Health Samples"?), build, first run, 09:00 automation.
2. **After the token paste**: `powershell -File docs/fixtures/health-ingest/run.ps1` — runs the 3 token-dependent tests (valid batch / idempotent resend / malformed 400). Everything else already passed against the deployed function.
3. Flip Supabase MCP back to `read_only=true` in `~/.claude.json` (deferred on request this session; no migration work remains).
4. Mark AND-49 Done in Linear (permission-blocked for the agent).
5. Still owed from before: the real-device pass (icons, dark mode, keypad, airplane-mode drill, back gesture) — now including a glance at the new rest-timer states.

## Notes

- `deleteSession` remains a hard delete with set cascade — inconsistent with the Layer 2 keep-everything contract; candidate for a session-level soft delete later.
- Superset links made before any set is logged don't survive a PWA kill (membership rides on the sets; documented in useWorkout).
- A password-reset email was sent to the test account's inbox mid-session (mis-click during the stale-password diagnosis); ignore it.
- Sheets-close-on-back-gesture: still descoped, same reasons as before (history-state-machine refactor, own PR).
- Reps chips round to whole reps (2.5 step jumps 3); independent per-field step pairs still offered, unanswered.
