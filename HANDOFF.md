# HANDOFF.md

Snapshot of where the project is. Replace every session, never append.

## Current state — 2026-07-03 (end of day)

Branch: `main`, clean, everything merged through PR #29 and auto-deployed. Marathon session: Phases 0-3 of `docs/DEEP_REVIEW_AND_V2_PLAN.md` shipped (PRs #16-22), user-feedback batch (settings/theme/units/field-first chips, #23), schema-free Phase 5 slice (session notes #24-25, delete UX with undo + ConfirmSheet #26, home glance stats #27), and the Health Sync plan (#28). Every PR went through finder-agent review, steelman, amend, merge; the reviews caught real bugs pre-merge (1000-row export cap, lb round-trip drift firing false PRs, stale-undo-closure clobbering sets, cross-tab outbox dequeue loss, cross-account outbox contamination).

Linear: AND-8, 39-53 all Done with PR links; AND-49 In Review (migration application). Tests 71/71; lint at its 2-error pre-existing baseline (App.tsx resume effect, useAuth).

## Next steps (in order)

1. **`/mcp` re-authenticate the Supabase server** (config now `database,docs,functions`, write-enabled; the URL change may have dropped the OAuth grant). Then Claude can:
2. **Apply the Phase 3 migration** (`sql/migrations/2026-07-03-phase3-data-contract.sql`) — Andy deferred doing it by hand; watch for the case-insensitive index failing on case-duplicate names.
3. **Build the Health Sync pipeline** per `docs/HEALTH_SYNC_PLAN.md`: `health` schema, `ingest-health` edge function + secrets, curl fixture suite, Shortcut recipe doc. Roughly half a day.
4. **Andy, ~30 min on phone**: the 2-minute Shortcuts probe (does "Find Health Samples" list HRV and Sleep?), then build the Health Sync Shortcut from the recipe, set the 09:00 automation. Deferred but still owed: the real-device pass (icons, dark mode, keypad, airplane-mode drill, back gesture).
5. **Post-migration UI batch** (once #2 is applied): RPE quick-tap in QuickCapture, per-set notes, routine templates + per-exercise rest targets (unlocks AND-6 countdown), supersets (AND-10), soft delete with `.is('deleted_at', null)` read filters (export keeps all rows).
6. **Flip the Supabase MCP back to `read_only=true`** in `~/.claude.json` once #2/#3 are done; standing prod write access is only justified while migration work exists.

## Notes

- Sheets-close-on-back-gesture was descoped twice with reasons: needs a history-state-machine refactor (encode screen+sheet in history.state); simple push/pop provably breaks the tap-through-day-sheet flow. Own PR when tackled.
- Review-declined items on record: PR badges can be optimistic across consecutive offline sessions (server-sourced histories; self-heals); multi-device edits to an actively open session are out of contract (phone-authoritative, in AGENTS.md); routines untrained for 12+ weeks read as never-trained in the next-up suggestion (still sorts first, comment in lib/stats).
- Reps chips round to whole reps, so a 2.5 step on reps jumps 3; Andy may want independent step pairs per field (offered, unanswered).
- Test account (jchx.agent@gmail.com) holds several test sessions; kept deliberately as fixture history for agent drills.
- Stale local branch `fix/and-10-pwa-loading-stuck` still unpruned.
