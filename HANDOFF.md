# HANDOFF.md

Snapshot of where the project is. Replace every session, never append.

## Current state — 2026-07-03 (late)

Branch: `main`. Big execution session: Phase 0 through Phase 3 of `docs/DEEP_REVIEW_AND_V2_PLAN.md` are done. Every PR was reviewed by parallel finder agents, steelmanned, amended, then squash-merged.

Merged this session:

- **PR #16-18 (Phase 0 quick wins)**: prefill reps/weight, lossless paginated export, error toasts, resume elapsed clock, PNG app icons, safe-area insets, dark mode, iOS back gesture via History API. Review amendments included a real bug: un-ranged supabase-js queries cap at 1000 rows (export would have truncated silently).
- **PR #19 (Phase 1, AND-8)**: local-first logging. FIFO outbox in localStorage (full-row upserts, client UUIDs, idempotent replay), useSync drain loop, timer anchors persisted across PWA kills (capped 1h), offline session start, optimistic resume, account-switch quarantine (`lib/localOwner`), cross-tab-safe keyed dequeue. Verified end to end with an airplane-mode drill in Chrome; the drill caught that supabase-js reports fetch failures as plain objects, not Errors.
- **PR #20 (Phase 2, AND-47)**: quick-capture logging. In-app number pad (replace-on-first-digit), nudge chips, big value buttons, no OS keyboard in the log loop.
- **PR #21 (Phase 3a)**: weight-PR badge at log time + session summary overlay on Finish (duration/sets/tonnage/PRs). Pure derivation, no schema.
- **PR #22 (Phase 3b, if merged)**: schema-only data-contract migration; see gate below.

## Next steps (in order)

1. **Andy: real-device pass** on the deployed app: home-screen icon, safe area, dark mode, back gesture, number pad feel, offline drill (airplane mode in the gym), PR badge + summary.
2. **Andy: apply `sql/migrations/2026-07-03-phase3-data-contract.sql`** in the Supabase SQL Editor (additive, guarded, re-run safe). Until then no code may touch the new columns (`sessions.source`, `sets.rpe/notes/group_id/deleted_at`, `routine_exercises`, exercise metadata).
3. **After migration applied**: build the column-dependent UI: RPE quick-tap row in QuickCapture, session/set notes, routine templates (plan view + per-exercise rest targets, AND-6), soft-delete switch in deleteSet, `source` on session insert.
4. **Phase 4 = Layer 2** (`docs/LAYER2_PLAN.md`): blocked on Andy: Health Auto Export on the phone + a write path for the `health` schema migration (Supabase MCP is read-only). L2.0 ingestion is independent of all app work.
5. **Phase 5 elegance backlog**: rest countdown + push notification (needs templates), sheets-in-history for back gesture, undo-toast instead of confirm for set delete, action sheet replacing window.confirm, home streak/volume stats.

## Notes

- Review-declined items worth remembering: PR badges can be optimistic across consecutive offline sessions (histories are server-sourced; self-heals on sync). Multi-device edits to an actively open session are out of contract (phone-authoritative, documented in AGENTS.md).
- Test account (<jchx.agent@gmail.com>) now holds several finished "test push A" sessions from verification; harmless, useful as history for future drills.
- The two remaining lint errors (App.tsx resume effect, useAuth) are pre-existing set-state-in-effect findings; structural, deliberately untouched.
