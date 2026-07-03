# HANDOFF.md

Snapshot of where the project is. Replace every session, never append.

## Current state — 2026-07-03 (evening)

Branch: `main`, clean. Docs-only session; no code changes.

Done this session:

- **Deep project review + V2 plan** at `docs/DEEP_REVIEW_AND_V2_PLAN.md`. 13 concrete code findings (N+1/lossy export, non-transactional reorder, in-memory timer state lost on iOS PWA kill, missing apple-touch-icon / safe-area / dark mode, silent catches, wrong elapsed clock on resume, unbounded history fetches, case-sensitive name uniqueness). Layer 1 plan phases: 0 quick wins → 1 local-first offline → 2 quick-capture keypad (kill the OS keyboard; prefill + nudge chips + in-app pad) → 3 data-contract migrations (provenance, soft delete, RPE, notes, `routine_exercises` templates, supersets) → 5 elegance.
- **Two-layer architecture settled** (plan doc Part 0): this app = capture / hot path only; processing + AI coach = Layer 2, outside the app. No HealthKit writes ever (Andy dual-logs on Apple Watch, so Health owns the envelope + HR); PWA stays, no native app.
- **Layer 2 plan** at `docs/LAYER2_PLAN.md`: `health` schema in the same Supabase project; Health Auto Export → edge function ingestion (Watch vitals + Withings weight both arrive via Apple Health); time-overlap correlation views; coach v0 = Claude over the existing read-only Supabase MCP; write-back into the app only via `routine_exercises`, human-approved.
- AGENTS.md gained a "Product direction" section pointing at both plans.
- Parked explicitly (future consideration): voice notes, video/form checks.

## Next steps

- Layer 1 Phase 0 quick wins are the natural next session (icons, safe-area, dark mode, prefill reps/weight, lossless single-query export, error toasts, elapsed-from-`started_at`, back-gesture via History API). File Linear issues per item before starting.
- Layer 2 L2.0 (health schema + `ingest-health` edge function + HAE on phone) is independent of all app work and can start any time.
- Existing backlog absorbed into plan phases: AND-8 offline → Phase 1; AND-9 RPE/notes → Phase 3; AND-10 supersets → Phase 3; AND-6 rest targets → templates + Phase 5.
- Export UTC-date quirk previously "deferred by design" is now superseded by the Phase 0 export fix.
- Stale local branch `fix/and-10-pwa-loading-stuck` still around; prune if that approach is dead.

## Notes

- Quick-capture UX confirmed with Andy: big calculator-style in-app pad, prefilled from previous set, one-tap log for the repeat case. Reported full-QWERTY keyboard on device despite `inputMode` hints; unverified, moot after Phase 2.
