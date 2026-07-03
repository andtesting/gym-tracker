# Deep Review + V2 Plan: Gym Tracker

Date: 2026-07-03, revised same day after product discussion. Scope: full-project review against the stated purpose (mobile gym logger on iOS, rich data, downstream health-data integration), followed by a plan for a more elegant product.

**Companion doc:** `docs/LAYER2_PLAN.md` (the data platform + AI coach layer).

---

## Part 0: Product architecture (settled)

Two layers, decided 2026-07-03:

1. **Layer 1 (this app): capture.** The highest-fidelity strength-capture instrument available. Logging happens live, set by set, during the workout; never retrospectively as the primary path.
2. **Layer 2 (separate from this app): processing + coaching.** All capture sources (this app, Apple Watch via Health, Withings scale via Health, future devices) land in a unified store and are processed together. The AI coach lives there. See `LAYER2_PLAN.md`.

The dividing line is **hot path vs cold path**, not capture vs analytics:

- **Hot path (stays in the app):** anything consumed mid-workout or lost if not captured within seconds. Prior-performance reference, PR detection at log time, session summary on finish, RPE/notes quick-capture.
- **Cold path (Layer 2):** anything that improves with more sources and more time. e1RM trends, weekly tonnage per muscle group, HR correlation, readiness, programming decisions.

Consequences:

- Andy starts workouts on both the Watch and this app, so **Health already owns the workout envelope and heart rate. This app never writes to HealthKit.** No native app is needed for Health; the PWA remains the right platform indefinitely.
- Watch workouts and app sessions join at Layer 2 by time overlap (trivial, since both start together).
- Body weight arrives via Withings → Apple Health → the Layer 2 ingestion pipeline. No in-app weight logging needed.
- The app's **data contract matters more than its UI**: provenance, honest timestamps, append-only bias (see Phase 2).
- The coach's output flows back into the app through one table: routine templates (`routine_exercises`). That is the entire coach-to-logger interface; the app itself never contains AI.

**Parked for future consideration (explicitly not now):** voice notes mid-workout; video/form checks.

---

## Part 1: Review

### 1.1 What is genuinely good (keep it)

- **Discipline.** AGENTS.md/HANDOFF.md, Linear-tracked issues, conventional commits, migration files annotated with verification notes.
- **Data capture foundation.** Per-set `started_at`/`completed_at`/`set_duration_seconds`/`rest_seconds` is the hard part of "rich data" and it is already flowing. Most trackers never capture rest.
- **Security posture.** Per-user RLS via `user_id default auth.uid()` + owner-only policies, per-user unique constraints, signups disabled, forced password reset on recovery links.
- **Small surface.** 4 runtime dependencies, no router, plain CSS, pure helpers unit-tested. ~5k lines, fully comprehensible in one sitting.
- **Smart product details.** Cross-routine exercise history paging, plan view seeded from last session, resume-on-cold-start with server validation, race-aware ref snapshotting in `ActiveWorkout.onLogSet`.

### 1.2 Apple Health reality (context for the settled architecture)

Two hard facts that shaped Part 0:

1. **A PWA cannot touch HealthKit.** No web API exists or is coming.
2. **HealthKit has no schema for strength detail.** Sets × reps × weight cannot be stored in Health; only the workout envelope can. The rich data this app captures has nowhere to go inside Health.

Since the Watch already logs the envelope + HR for every session, the write direction is not just unnecessary but harmful (double-counted exercise minutes). The read direction is the rich one and belongs to Layer 2.

### 1.3 The biggest product gap: offline reliability

Every write goes synchronously to Supabase; in a basement gym with one bar of signal, "Log Set" fails and the workout stalls (known: AND-8). Latency compounds it: `await createSet` completes before the UI updates, putting a network round trip in the critical path of every set.

Under the two-layer model this is a **data-quality defect in the warehouse**, not just a UX blemish: a dropped `rest_seconds` or null `started_at` from an iOS PWA kill silently degrades the dataset both layers exist to build. Every UX improvement is secondary to "logging never blocks, capture never drops."

### 1.4 Concrete defects and risks found in code

Correctness / data:

1. **Export is an N+1 avalanche** (`HomeScreen.handleExport`): 1 request for sessions + 1 per session, sequential; 1,000-session cap is silent. One joined query does it in a single round trip.
2. **Export is not a faithful backup.** No session id; the JSON grouping key `date|routine` merges two same-routine sessions on one day; `date` is the UTC split of `started_at`; session `notes` and `finished_at` absent. It should be lossless: `session_id`, ISO `started_at`/`finished_at`, local date via `localDateKey`, notes.
3. **Reorder is non-transactional** (`SessionDetail.handleSwapExercises`): N parallel `set_order` updates; a mid-flight failure leaves interleaved orders in the DB. The refetch in `finally` hides it visually, not in the data. An RPC (single SQL statement) makes it atomic.
4. **In-memory timer state dies with the page.** iOS kills backgrounded PWAs aggressively. Mid-workout kill loses: set timer, pending rest, `setStartedAtRef`; result is silently null `rest_seconds`/`started_at` on the next set. Persist timer anchors (mode + epoch ms) to localStorage and rehydrate.
5. **Session elapsed clock is wrong after resume** (`ActiveWorkout`: `sessionStart = Date.now()` at mount). Resumed sessions show minutes-since-remount. Derive from `started_at`.
6. **Unbounded history fetches.** `fetchExerciseHistories` pulls every set ever for the exercise list and sorts client-side; `fetchExerciseTrends` same. Fine at hundreds of rows, degrading by year two or three. Needs a DB-side limit (RPC with `row_number()`) eventually; not urgent.
7. **Case-sensitive uniqueness.** `unique(user_id, name)` lets "Bench Press" and "bench press" coexist. A unique index on `(user_id, lower(name))` matches intent.

iOS/PWA experience:

1. **No apple-touch-icon.** Only an SVG favicon exists; iOS ignores SVG manifest icons, so the home-screen icon is a letterboxed screenshot or blank tile. A 180×180 PNG `apple-touch-icon` + 192/512 PNG manifest icons (incl. maskable) is a one-hour fix.
2. **No safe-area handling.** `viewport-fit=cover` is set but `.bottom-bar`/`.bottom-bar-two-row` never use `env(safe-area-inset-bottom)`; on Face ID iPhones the primary buttons collide with the home indicator.
3. **No dark mode.** Gyms are dark. The CSS variable structure makes `prefers-color-scheme` support nearly free.
4. **No history/URL integration.** iOS edge-swipe does nothing or exits. Minimal fix: `history.pushState` on screen change + `popstate` handling; no router library needed.
5. **`window.confirm` in a standalone PWA** renders as a bare modal with the origin string; functional, but the ugliest surface in the app.

Error handling:

1. Silent failure paths: `SessionDetail` fetch `.catch(() => {})`, `TrendsView` has no error state, `ExerciseSearch` load errors vanish, `useWorkout` load errors go to `console.error` while the user sees an empty plan. A toast/banner primitive plus consistent surfacing covers all of these.

### 1.5 UX friction audit of the core loop (log a set)

Current happy path per set: tap exercise → Start Set → do set → Log Set → type reps → type weight, with empty fields every time. In a 20-set workout that is up to 40 re-typings of mostly-unchanged numbers. Reported on-device: the full QWERTY keyboard appears despite `inputMode="numeric"/"decimal"` on the inputs (worth one screenshot check, but moot under the Phase 2 redesign, which removes the OS keyboard from the loop entirely).

The trends chart is per-set bars, which answers "what did set 3 look like across sessions" but not "am I progressing" (e1RM), "am I balanced" (tonnage per muscle group), or "did I PR". Under the two-layer model those move to Layer 2, except PR detection and the finish-screen summary, which are hot-path motivation.

---

## Part 2: The V2 plan (Layer 1)

Priorities follow from the app's narrowed job: (1) never lose or block a data point, (2) reduce cost-per-data-point (friction), (3) emit a clean contract for Layer 2, (4) polish. Each phase ships independently; no big-bang rewrite.

### Phase 0: Quick wins (a weekend, no architecture)

1. PNG app icons + apple-touch-icon + maskable manifest icons (finding 8).
2. `env(safe-area-inset-bottom)` on both bottom bars (9).
3. Dark mode via `prefers-color-scheme` on the existing CSS variables (10).
4. Prefill reps/weight from the previous set of the exercise (else last session's corresponding set). This alone makes the majority of logs zero-typing.
5. Fix export: single joined query, lossless columns, local date, session id (1, 2).
6. Error toast primitive; kill the silent catches (13).
7. Session elapsed from `started_at`, not mount time (5).
8. `history.pushState`/`popstate` so the iOS back gesture navigates instead of exiting (11).

### Phase 1: Local-first logging (the architectural change; AND-8 done properly)

Goal: **the phone is the source of truth during a workout; Supabase is a sync target.**

- Thin local store (IndexedDB via Dexie, or localStorage at current scale) holding the active session's sets plus an **outbox** of pending mutations `{op, table, payload, client_id, created_at}`.
- UI reads/writes local state synchronously (instant Log Set, zero spinner); a sync loop drains the outbox with retry/backoff; client mints UUIDs so retries are idempotent upserts.
- Persist timer anchors (mode, started-epoch, pending rest) alongside, fixing finding 4 in the same stroke.
- Conflict policy: single user, one device at a time, last-write-wins. No sync framework (PowerSync/ElectricSQL); a ~200-line outbox is the right altitude for n=1.
- Definition of done: airplane mode, full workout logged, land, everything syncs.

### Phase 2: Quick-capture logging redesign (kill the OS keyboard)

The core interaction, redesigned around the fact that most sets repeat the previous set's numbers:

```
┌─────────────────────────────────┐
│  Incline DB Press        set 3  │
│                                 │
│   REPS            WEIGHT       │
│  ┌───────┐      ┌───────────┐  │
│  │   8   │      │  32.5 kg  │  │   ← prefilled from previous set
│  └───────┘      └───────────┘  │
│  [ -1 ] [ +1 ]  [ -2.5 ][ +2.5 ]│   ← one-tap nudges
│                                 │
│  ┌─────────────────────────────┐│
│  │      Log Set · 8 × 32.5     ││   ← single confirm, majority case
│  └─────────────────────────────┘│      = one tap, zero typing
└─────────────────────────────────┘
```

- Tapping the reps or weight value opens an **in-app calculator-style pad** (big buttons: `1-9`, `.`, `0`, backspace), not the OS keyboard. Inputs are non-focusable (`readonly`/buttons), so iOS never raises its keyboard: no viewport jump, no QWERTY, targets sized for a shaking post-set hand.
- Increment chips cover the common deltas (+1 rep, +2.5 kg plate step); make the weight step configurable per exercise later if needed (dumbbell racks step 2.5, cables step 5).
- Optional RPE quick-capture as a single tap row (`7 · 8 · 9 · 10`, tap again to clear) under the pad; friction budget ~1 second, skippable, never required (schema in Phase 3).
- Keep Start Set / Log Set two-phase (it is what produces the timing data); the redesign removes typing, not the phases.

### Phase 3: Data-contract migrations (Layer 2 readiness + capture depth)

Additive migrations, each independently shippable:

| Addition | Schema | Why |
| --- | --- | --- |
| Provenance | `sessions.source text default 'gym-tracker-pwa'`, ditto on future tables; app version optional | When sources disagree at Layer 2, know who said what |
| Append-only bias | `sets.deleted_at timestamptz` (soft delete); hard delete only via maintenance | Layer 2 must never silently lose rows it already processed |
| RPE (AND-9) | `sets.rpe numeric` | Effort context; captured via the Phase 2 quick row |
| Set + session notes (AND-9) | `sets.notes text`; sessions.notes exists, add UI | Subjective context is unreconstructable later |
| Routine templates | `routine_exercises (routine_id, exercise_id, sort_order, target_sets, target_reps, target_weight_kg, target_rest_seconds)` | Replaces "plan = last session"; **this is the coach write-back API** (see LAYER2_PLAN.md); also drives per-exercise rest targets (AND-6) |
| Supersets (AND-10) | `sets.group_id uuid` (nullable) | Rest semantics currently break for supersets |
| Exercise metadata | `exercises.equipment text, is_bodyweight bool, secondary_muscle_group_ids uuid[]` | Enables correct per-muscle volume at Layer 2 |
| Case-insensitive names | unique index on `(user_id, lower(name))` | Finding 7 |

In-app derived features (hot path only): **PR detection with a badge at log time**, and a **session summary screen on Finish** (duration, tonnage, PRs, vs last time). All other analytics (e1RM trends, weekly tonnage, balance) move to Layer 2; the in-app Trends view stays as-is until Layer 2 supersedes it, then gets simplified rather than expanded.

### Phase 4: Layer 2 build

Separate plan: see `docs/LAYER2_PLAN.md`. Layer 1's only obligations to it are the Phase 3 contract migrations and continued capture fidelity.

### Phase 5: Elegance pass (deliberately last)

- Rest countdown with per-exercise targets (from `routine_exercises`) + push notification on rest complete (installed-PWA Web Push, iOS 16.4+; no vibration API on iOS Safari).
- Replace `window.confirm` with an in-app action sheet; undo-toast (5s) instead of confirm-first for set deletion.
- Visual refresh within the existing plain-CSS system: bigger numerals for weight/reps (glanceable from a bench), routine color as accent through the active workout, subtle set-logged animation.
- Home screen: "next workout" suggestion (least-recently-trained routine), current streak, this-week volume vs last.

### What this plan explicitly does NOT do

- No rewrite to Next.js/Tailwind/shadcn or framework churn; zero user value.
- No HealthKit writes, no native app, no Capacitor/Expo. Revisit native only if a Watch companion or Live Activities ever becomes a real want.
- No multi-user/social features.
- No sync framework or CRDTs for a single-user outbox problem.
- No AI in the app, ever; the coach lives at Layer 2 and speaks through routine templates.
- Parked features (future consideration, not scheduled): voice notes mid-workout; video/form checks.

### Sequencing and effort (rough)

| Phase | Effort | Risk |
| --- | --- | --- |
| 0 Quick wins | 1–2 days | Trivial |
| 1 Local-first | 3–5 days | Moderate; airplane-mode test is the gate |
| 2 Quick-capture pad | 2–3 days | Low; isolated component |
| 3 Contract migrations | 1–2 days per row, independent | Low (additive) |
| 4 Layer 2 | See LAYER2_PLAN.md | Low-moderate |
| 5 Elegance | Ongoing, slice by slice | Low |

Order matters for 0 → 1 → 2 (reliability before friction, friction before depth). 3 can interleave; 4 starts any time after the provenance/template rows of Phase 3 land.
