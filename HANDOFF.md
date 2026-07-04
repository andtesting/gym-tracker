# HANDOFF.md

Snapshot of where the project is. Replace every session, never append.

## Current state — 2026-07-04 (end of session)

`main` clean through PR #46, auto-deployed. This marathon session shipped: Phase 3 migration applied; Health Sync server side live and fully verified (#31/#32, function at v5); complete Phase 3 UI adoption (#33 RPE, #34 per-set notes, #35 templates + rest countdown, #36 supersets, #37 set soft delete, #42 exercise metadata); rest countdown reworked to opt-in with a 3:00 count-up alarm (#39, #41); session-level soft delete (#43, migration applied 2026-07-04); hot path widened to 12 signals for the holistic scope (#45, curl suite 7/7 against v5, all types verified, tables left empty); README + parser plan + project skills (#46). Chrome verification of the UI batch done on the test account. Every PR went through the pr-loop (now a skill).

New this session, structural: **holistic two-pipe decision** (HEALTH_SYNC_PLAN §13) — 12-signal daily Shortcut + periodic Apple Health export.zip into a local DuckDB lake (design: `docs/HEALTH_LAKE_PLAN.md`, build is its own future project/session). Project skills exist now: `pr-loop`, `health-check` (`.claude/skills/`). Deliberately skipped: hooks, custom agents, loops (reasons in README).

Linear: AND-54/9/6/10 Done with PR links. AND-49 still needs a manual flip to Done (agent permission-blocked). Tests 91/91; lint at the 2-error pre-existing baseline.

## Next steps (in order)

1. **Andy, ~45 min on phone**: build the 12-signal Shortcut — `docs/health-sync-shortcut-recipe.md` sections 2.1–2.10 (probe done, token done). First run: grant all Health prompts, check counts vs the Health app, and the spo2 fraction-vs-percent check (recipe §3). Then the 09:00 automation.
2. After ~a week of clean ingests (`health-check` skill has the queries): L2.1 — correlation views, session HR on SessionDetail.
3. **health-lake build session**: scaffold `ClaudeProjects/health-lake` per `docs/HEALTH_LAKE_PLAN.md` (open questions listed in §9); first export.zip import backfills all history; wire the cross-pipe reconcile against `health.samples`.
4. Flip Supabase MCP back to `read_only=true` in `~/.claude.json` — no migration work remains.
5. Mark AND-49 Done in Linear.
6. Real-device pass still owed: icons, dark mode, keypad, airplane-mode drill, back gesture, plus the new rest-timer states and exercise More panel.

## Notes

- Deletion is soft at BOTH levels (sets #37, sessions #43); export exposes `deleted_at` + `session_deleted_at`; any new reader must filter both.
- Superset links made before any set is logged don't survive a PWA kill (membership rides on the sets).
- Sheets-close-on-back-gesture: still deferred by Andy (2026-07-04), needs the history-state-machine refactor, own PR.
- Reps chips rounding up (2.5 → 3): Andy confirmed fine as-is — closed question.
- Test account holds fixture sessions + this session's verification workout ("test push A" with a superset/RPE/note set) — kept deliberately.
