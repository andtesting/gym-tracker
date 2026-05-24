# HANDOFF.md

Snapshot of where the project is. Replace every session, never append.

## Current state — 2026-05-24

Active branch: `fix/and-10-pwa-loading-stuck` (already merged AND-10 PWA fix).

Recently shipped (last few PRs):

- AND-10: PWA stuck on "Loading..." on iOS home screen — fixed
- AND-20: retroactive add preserves reps/weight between adds
- AND-21: trends Y-axis labels
- AND-16, AND-17: set timestamps and retroactive session edit

## In flight

User raised four live-workout UX issues during real gym use. Logged as a new batch this session; see Linear team `Andy C` for AND-22 → AND-25 (and any AND-26+ found during audit).

1. Active workout shows only one prior session and not all exercises from it. Need multi-session history visible during the live workout, plus ability to plan exercises upfront. (AND-22)
2. No way to edit a typo'd set during the live workout. Only `SessionDetail` has edit. (AND-23)
3. No way to create a brand-new retroactive session (currently can only edit existing sessions). Needed for "forgot phone" days. (AND-24)
4. Exercise history during active workout is filtered to the current routine, so the same exercise across different routines shows no history. (AND-25)

## Next steps

1. Finish exploratory Chrome audit for any AND-26+ issues.
2. Confirm Linear issues for all four user-reported items.
3. Implementation order (lowest-dependency first):
   - AND-25 cross-routine history (small API change in `fetchLastSession` flow)
   - AND-23 live edit/delete sets (extend `SetLogger` + reuse `updateSet`/`deleteSet`)
   - AND-22 multi-session history viewer (new component + API for last N sessions)
   - AND-24 retroactive session create (new "Log past workout" entry from home screen)
4. Verify each flow in Chrome before moving to the next.

## Notes

- All four issues touch `ActiveWorkout` / `useWorkout` / `SetLogger` / `LastSessionRef`. Plan them together — one round trip through that code path beats four.
- Don't forget to update `sql/schema.sql` if any table needs new columns. None expected for this batch; everything is composition of existing data.
