# HANDOFF.md

Snapshot of where the project is. Replace every session, never append.

## Current state — 2026-07-10

`main` clean through PR #60, auto-deployed. **No app-code changes this session** — the work was on the phone-side Health Sync Shortcut, now **parked** for a future build. Docs corrected to match what we learned (this PR).

Last code shipped (prior session): routine variants end-to-end (#51, #53–#56); active-workout fixes #59 ("Last Time" → "Past" header; rest timer re-anchors on set delete/undo). Tests 126/126; lint at the 2-error baseline (App.tsx:89, useAuth.ts:21). code-reviewer agent must be spawned with `isolation: "worktree"`.

## Health Sync Shortcut — parked mid-build (the finding)

Server side confirmed live first-hand: `ingest-health` edge function ACTIVE (v5, static-token auth); `health.config` token present; `health.samples`/`workouts`/`ingest_log` all **0 rows** (never run).

**Key finding: Shortcuts on Andy's iOS has no `Find Workouts` action** (only `Find Health Samples` + ~20 other `Find …`). The recipe's workout section (2.2) assumed one exists; it doesn't. So the **daily hot path drops to the 10 sample signals** (body_mass, resting_hr, hrv_sdnn, sleep, body_fat_pct, lean_body_mass, spo2, respiratory_rate, wrist_temp, walking_hr_avg), all via `Find Health Samples`. Workouts move to the bulk `export.zip` → lake path (which carries full history anyway). Server verified to accept a workout-less batch (`workouts` optional, defaults to `[]` — `ingest-health/index.ts:223`). Docs corrected: recipe §0.5 + §2.2/§2.9, `HEALTH_SYNC_PLAN` §13.

**Build progress when parked:** Phase 1 done (Shortcut created, 3-day `WindowStart`). Phase 0 (fetch `INGEST_TOKEN` via SQL Editor) still outstanding. **Next build:** create the Weight block (recipe §2.3) as the template, confirm all 10 types show in the `Find Health Samples` Type picker, repeat for the other nine, assemble `Payload` (omit `workouts`), POST, then automate 09:00 daily. ~20–30 min. Offer: I can query `ingest_log`/`samples` over MCP to verify the first run.

## Still owed (not app code)

- **Health Sync Shortcut** (above) — Andy, ~20–30 min on the phone when he picks it back up.
- Flip Supabase MCP back to `read_only=true` in `~/.claude.json` (no migration in flight; needs a session restart to take effect). **Currently write-enabled.**
- Mark the variants issues + AND-49 Done in Linear (agent has been permission-blocked on Linear writes).
- `health-lake` build session (`docs/HEALTH_LAKE_PLAN.md`) — now also the home for workout history, not just bulk archive.

## Notes

- Deletion is soft at both set and session level; export exposes `deleted_at` + `session_deleted_at`, all other readers filter.
- Plan **order** isn't persisted (buildPlan re-derives from set_order + template sort_order on resume), so eye/skip and mid-workout reorder don't survive a PWA kill — pre-existing limitation, candidate improvement.
- Test account fixture: category "test press" (variants A/C/B/D; `test_bench_press` + `test_fly`), with a few benign "test press A" sessions dated 6–7 July from #59 E2E.
