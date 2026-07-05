# Routine Variants — design

Date: 2026-07-05. Andy's ask: instead of flat routines ("Legs A", "Legs B" as separate things), a **Legs category** holding **A/B/C variants**. Motivation: his last session was "Legs A" by intention, but machines were busy so he swapped exercises — he wants to capture that as a variant, cycle variants before starting, and be offered "save as a new variant" on finish.

Confirmed answers (2026-07-05): reusable variant templates; auto-group existing routines by name prefix; create-variant-on-finish saves today's exercises as a new variant.

## 1. Data model — minimal, additive

The current unit that sessions and templates reference is `routines`. Keep that; add a grouping layer and a variant label as columns, no table renames.

```sql
alter table routines add column if not exists category text;        -- "Legs"; null = ungrouped/standalone
alter table routines add column if not exists variant_label text;   -- "A" | "B" | ...; null for a single-variant category
alter table routines add column if not exists variant_order int;    -- cycle order within the category (0,1,2…)
```

- A **category** is simply the set of routines sharing `category` (per user). No new table — rename/color live per routine as today; the category name is the shared string. (Rationale: n=1, and a category has no metadata a variant doesn't already carry. A `routine_categories` table was considered and rejected as premature.)
- Each **variant is still a routine**: it keeps its own `id`, `color`, `name`, and its own `routine_exercises` template. So "each variant has its own plan" already works with zero template-layer change.
- `sessions.routine_id` still points at the specific variant. **No change to sessions or routine_exercises.** This is the whole reason to layer rather than restructure — the migration touches only `routines`, nothing downstream.
- `name` stays the display string ("Legs B"). `category`/`variant_label` are the structured grouping. On create/rename we keep them consistent (name = `category` + " " + `variant_label` when both set).

## 2. Migration — auto-group by prefix (reviewed, not silent)

A one-off backfill splits each existing routine name into `(category, variant_label)`:

- If the name ends in a short trailing token that looks like a variant label (a single letter A–Z, or a number), split there: `"Legs A"` → category `"Legs"`, label `"A"`. `"Upper Body B"` → `"Upper Body"`, `"B"`.
- Otherwise the whole name is the category and `variant_label` is null (a standalone single-variant category): `"Full Body"` → category `"Full Body"`, label null.
- `variant_order` assigned by label order (A=0, B=1…) within each category.

Because auto-detection can mis-split (e.g. a routine legitimately named "Zone 2"), the migration is **proposed, not auto-applied**: I generate the mapping, show it here / in a review query, and only apply once Andy okays it. Existing routines that shouldn't group (only "test push A" exists on the test account today; Andy's real routines are unknown to me) can be corrected in the Edit screen after.

## 3. Picking & cycling (PickRoutineScreen + ActiveWorkout)

- **PickRoutine** lists **categories** (one row per category), not individual variants. Standalone routines (label null) show as themselves.
- Tapping a category starts a workout on a **default variant** (see Q1 below), landing on the plan view.
- **Cycle before the first set**: while `activeIndex === null` and no set is logged, a small variant switcher (e.g. "Legs — A ‹ B › C") lets Andy flip variants; switching reloads that variant's template into the plan (routine_id + plan re-seed). Once the first set is logged the variant is **locked** (the session is bound to that routine_id) and the switcher disappears.

## 4. Create-variant-on-finish

- On finishing, if the session's exercises **differ** from the started variant's template (added/removed exercises — the "machines were busy" case), the finish confirmation offers: **"Today differed from Legs A — save as a new variant?"** Yes mints a new routine in the same category (next label/order, name "Legs D"), builds its `routine_exercises` template from today's actual exercises (sort_order = session order; targets left null or seeded from today's top set — Q3), and points the just-finished session at the new variant.
- If the session matched the template, no prompt (nothing new to capture). An explicit "save as variant" option can still live in the summary for the matched case if wanted (Q2).

## 5. Build order (once design is approved)

1. Migration (proposed → applied) + `sql/schema.sql`/mirror + `Routine` type gains category/variant_label/variant_order.
2. `api/routines.ts`: category-aware fetch (group), create-variant, set-variant helpers.
3. PickRoutineScreen: list categories; category → start on default variant.
4. ActiveWorkout: pre-first-set variant switcher; lock after first set.
5. Finish flow: deviation detection + "save as new variant" (extends the #50 confirmation).
6. EditModeScreen: manage categories/variants (rename, reorder, recolor) — or defer to a follow-up.
7. Tests: pure helpers (prefix-split, deviation detection, next-label) unit-tested; Chrome-verify the pick→cycle→log→finish→save-variant flow.

Each of these is its own PR through the loop; the migration PR ships first and alone.

## 6. Open decisions for Andy (before I build)

- **Q1 — default variant when picking a category**: (a) the one you did most recently in that category [recommended — matches "I usually do the last one"], (b) always A, (c) always the lowest variant_order.
- **Q2 — create-variant prompt**: (a) only when today deviated from the template [recommended — less nagging], (b) always offer on finish, (c) never auto-prompt; a manual "save as variant" button only.
- **Q3 — new variant's targets**: (a) leave targets null, capture only the exercise list + order [recommended — simplest, targets are set later], (b) seed target reps/weight from today's top set per exercise.
- **Q4 — Edit-screen category management**: (a) include basic rename/reorder/recolor in this feature, (b) defer to a follow-up; auto-migration + create-on-finish is enough for v1 [recommended — smaller first cut].
