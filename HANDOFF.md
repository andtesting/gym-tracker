# HANDOFF.md

Snapshot of where the project is. Replace every session, never append.

## Current state — 2026-07-06

`main` clean through PR #51, auto-deployed. This session was driven by Andy's real-device feedback (4 phone screenshots) plus a routine-variants feature request. Shipped, each browser-verified on the test account and adversarially reviewed:

- **#47 SessionDetail add-set crash** — the `Me.notes.trim` crash when adding a set to a finished session (a mid-edit-added set had no edit-state entry → partial object on save). Fixed via `lib/sessionEdit.ts` (fallback so a set is never blank/partial) + an elegant per-exercise "+ Add set" that prefills and inserts adjacent.
- **#48 Logging UX** — third RPE box in QuickCapture (default 7, resets after log; ±buttons drive it; 7–10 chip row + "tap reps or kg" hint removed); logged-row trash → **edit (pencil)**, delete now lives inside the editor; header overlap fixed (two-column right side widened, numeric cells right-aligned).
- **#49 Plan view** — superset icon Link2 → **lightning bolt**; new **eye/skip** button sends an exercise to the plan bottom (`useWorkout.moveExerciseToEnd`); "N sets today" now a consistent two-line block.
- **#50 Finish flow** — Finish button off the fixed bottom bar to end-of-page; tapping it opens a **confirmation with a summary** (exercises/sets/kg/duration) + "Are you sure?" Yes/No (neutral, not green/red).
- **#51 Routine variants — DATA LAYER + design** (`docs/ROUTINE_VARIANTS_PLAN.md`). Migration applied to live DB: `routines` gains `category/variant_label/variant_order`; existing routines auto-grouped by approved prefix mapping (Back A/B, Chest A/B multi-variant; Abs/Legs/Shoulder single). `lib/routineCategories.ts` + api helpers. **No UI reads the columns yet.**

Tests 115/115; lint at the 2-error pre-existing baseline. Note: the code-reviewer agent must be spawned with `isolation: "worktree"` — run without it once this session and it switched the shared working tree to `main` mid-review (recovered, no loss).

## Next steps — finish routine variants (decisions all confirmed 2026-07-05)

Build per `docs/ROUTINE_VARIANTS_PLAN.md` §7, each its own PR through the loop:

1. **PickRoutineScreen**: list categories (via `groupIntoCategories`); tapping a category starts a workout on **variant A** (Q1 = always A).
2. **ActiveWorkout variant switcher**: cycle variants (A ‹ B › C) while `activeIndex===null` and no set logged; **lock after the first set**. Switching reloads that variant's routine_id + template.
3. **Finish save-as-variant**: on finish, if today's exercises **differed** from the started variant's template (Q2), the #50 confirmation offers "save as a new variant" — mints a routine in the same category (`nextVariantLabel`/`nextVariantOrder`), template seeded from today (Q3 = seed target reps/weight from each exercise's top set), and repoints the session.
4. **Edit-screen category management** (Q4 = in scope): rename/reorder/recolor categories and variants.

When building the create-flow (steps 1/4): the create-flow must route "add within an existing category" through explicit `variant_label`/`variant_order` (not the bare `createRoutine` default, which is null order) — see #51 review notes. Null-label-ordering and case-sensitivity are latent notes in the review, not blockers.

## Still owed from earlier (unchanged)

- **Andy, phone ~45 min**: build the 12-signal Health Sync Shortcut (`docs/health-sync-shortcut-recipe.md`; token + probe done, curl suite 7/7). Then the 09:00 automation. `health.*` tables empty until it runs.
- Flip Supabase MCP back to `read_only=true` in `~/.claude.json`.
- Mark AND-49 Done in Linear (agent permission-blocked).
- `health-lake` build session (`docs/HEALTH_LAKE_PLAN.md`) after a week of ingests.

## Notes

- Deletion is soft at both set and session level; export exposes `deleted_at` + `session_deleted_at`, all other readers filter.
- Plan **order** isn't persisted (sets persist by set_order; buildPlan re-derives order on resume), so the eye/skip doesn't survive a PWA kill mid-workout — same pre-existing limitation as reorder. Persisting plan order is a candidate improvement.
- Test account (jchx.agent) holds fixture sessions + this session's verification data; `test push A` is now category "test push"/variant A. Kept deliberately.
