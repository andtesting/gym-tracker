# HANDOFF.md

Snapshot of where the project is. Replace every session, never append.

## Current state — 2026-07-06

`main` clean through PR #56, auto-deployed. **Routine variants is now complete end-to-end** (data layer #51 shipped last session; the four UI PRs shipped this session, each browser-verified on the test account and adversarially reviewed):

- **#53 PickRoutine → categories.** Routines are grouped via `groupIntoCategories`; a multi-variant category shows its name + an `A / B / C` subtitle, and tapping starts **variant A** (Q1). Single-variant categories render as the routine's own name (legacy routines unchanged).
- **#54 Pre-first-set switcher.** In the active workout, a >1-variant category shows an `A ‹ B ›` switcher above the plan while `activeIndex === null` and no set is logged. Switching rebinds `routine` (local state → `useWorkout` reloads that variant's template), updates the persisted record (resume-safe), and upserts the session `routine_id`. Locks after the first set. `useWorkout` now gates `loading` during the switch reload (folds `loadedRoutineId !== routineId`) so the stale plan can't be interacted with mid-reload.
- **#55 Save-as-variant on finish.** When today's exercises deviated from the started variant's template (Q2), the finish confirmation offers an opt-in checkbox to save today as a **new variant** — mints a routine in the same category (next label/order, inherited colour), seeds its template from each exercise's **top set** (Q3), and repoints the session. Pure helpers `lib/variantFromSession.ts` (`sessionDeviatesFromTemplate` + `buildVariantSeed`) are unit-tested. The summary notes upsert follows the new variant via a ref (review fix).
- **#56 Edit-screen management (Q4).** Routines section grouped by category: editable category header (renames across variants + their names), **+ Variant** (explicit label/order; promotes a bare standalone to A first), per-variant reorder + label badge, existing colour/name/Plan/Delete. Reorder reindexes-by-position; rename blocks merging onto an existing category.

Tests **123/123**; lint at the 2-error pre-existing baseline. `variant_order`/`category`/`variant_label` are additive columns; sessions/sets/routine_exercises are unchanged, so nothing downstream moved. Note: the code-reviewer agent must be spawned with `isolation: "worktree"`.

## Verification note (test account)

The fixture account's "test push" category was used to exercise every path and, via #55/#56, became a real multi-variant category: it's now **"test press" with variants A/C/B/D** (renamed + reordered + a `+ Variant` add during Edit-screen testing). Session history for those days relabels accordingly. `test_bench_press` and `test_fly` are its exercises. Kept deliberately as a variants fixture. `routine_exercises`/`routines` creation on this feature are DIRECT (non-outbox) writes — variant creation needs the network; on failure it toasts and the workout is intact.

## Still owed (unchanged, not this feature)

- **Andy, phone ~45 min**: build the 12-signal Health Sync Shortcut (`docs/health-sync-shortcut-recipe.md`; token + probe done, curl suite 7/7). Then the 09:00 automation. `health.*` tables empty until it runs.
- Flip Supabase MCP back to `read_only=true` in `~/.claude.json` (no migration in flight; change needs a session restart to take effect).
- Mark AND-49 + the variants issues Done in Linear (agent has been permission-blocked on Linear writes).
- `health-lake` build session (`docs/HEALTH_LAKE_PLAN.md`) after a week of ingests.

## Notes

- Deletion is soft at both set and session level; export exposes `deleted_at` + `session_deleted_at`, all other readers filter.
- Plan **order** isn't persisted (buildPlan re-derives from set_order + template sort_order on resume), so eye/skip and mid-workout reorder don't survive a PWA kill — pre-existing limitation, candidate improvement.
- `docs/ROUTINE_VARIANTS_PLAN.md` holds the full design + confirmed decisions (Q1–Q4). The build sequence there is now fully shipped.
