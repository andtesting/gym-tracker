# AGENTS.md — Gym Tracker

Stable context for any agent working in this repo. Read this first.

## What this is

A single-user PWA gym tracker. Built for Andy's phone (PWA on iOS home screen). Tracks workout sessions, sets, and trends. Deployed to GitHub Pages at <https://andtesting.github.io/gym-tracker/>.

## Stack

- React 19 + TypeScript + Vite 6
- Supabase (auth + Postgres + RLS)
- `vite-plugin-pwa` for offline shell / installability
- `lucide-react` for icons
- `vitest` + `@testing-library/react` + jsdom for tests
- No router. Screen state is a discriminated union in `src/types.ts` (`Screen`) and lives in `App.tsx` `useState`.

## Directory map

```
src/
  api/          Supabase calls (one file per table): exercises, muscleGroups, routines, sessions, sets
  components/   One screen or widget per file. Screens: HomeScreen, PickRoutineScreen, ActiveWorkout,
                SessionDetail, EditModeScreen, TrendsView, LoginScreen.
  hooks/        useAuth, useTimer, useWorkout (the active-session state machine)
  lib/          Pure helpers: timer, search, palette, export, sessionPersistence (localStorage)
  types.ts      Shared types. `Screen` discriminated union drives navigation.
  supabase.ts   Singleton client; `isSupabaseConfigured` gate.
  App.tsx       Auth gate + screen switch + cold-start active-workout resume.
sql/schema.sql  Single-file schema, RLS policies, seed data. Run in Supabase SQL Editor.
sql/health_schema.sql   Layer 2 `health` schema + ingest RPC (mirror of its migration).
supabase/functions/     Edge functions. ingest-health: Apple Health ingestion dock
                        (docs/HEALTH_SYNC_PLAN.md), deployed via Supabase MCP.
tests/lib/      Vitest unit tests (pure helpers only — no component or integration tests yet).
docs/           Per-issue requirements docs (e.g. AND-11-session-resume-requirements.md) and
                product plans: DEEP_REVIEW_AND_V2_PLAN.md (Layer 1 roadmap), LAYER2_PLAN.md
                (data platform + AI coach), HEALTH_SYNC_PLAN.md (Apple Health ingestion via
                DIY iOS Shortcut, supersedes the buy-HAE step).
```

## Data model (Supabase)

```
muscle_groups (id, user_id, name, sort_order)
routines      (id, user_id, name, color)                  # "back A", "chest A", etc.
exercises     (id, user_id, name, muscle_group_id)        # built organically as user creates them
sessions      (id, user_id, routine_id, started_at, finished_at, notes)
sets          (id, user_id, session_id, exercise_id, set_order, set_type, reps, weight_kg,
               set_duration_seconds, rest_seconds, started_at, completed_at, created_at)
```

- `set_type` is `'warmup' | 'working'`. The warmup/working UI was removed (AND-29); new sets always default to `'working'`. The column is retained for historical data and export.
- **RLS is per-user (AND-35).** Every table has a `user_id uuid not null default auth.uid()` column and an owner-only policy (`user_id = auth.uid()`). App inserts don't set `user_id` — the column default fills it from the authenticated caller, and RLS auto-scopes all reads. `unique` constraints on names are per-user (`unique(user_id, name)`). New users start with an empty library and build it via the app. Public sign-ups are disabled in the Supabase dashboard. Live DB migrated via `sql/migrations/2026-05-27-per-user-rls.sql`.
- `started_at`/`completed_at` on sets capture wall-clock UTC (AND-16); included in the CSV/JSON export (AND-36) for health-tracker sync.
- `rest_seconds` on a set is the rest taken **before** that set (since the previously logged set in the session, across exercises), captured at Start Set and stored on the set created at the next Log Set. Null for the first set of a session and for retroactive sets (AND-37). Every display shows each set's own `rest_seconds`. Historic pre-AND-37 rows are realigned by `sql/migrations/2026-07-02-rest-before-set.sql`.
- Any date bucketing of `started_at` (heatmap, day-detail) must use `lib/date.ts` `localDateKey()`, not `started_at.split('T')[0]` — the latter is the UTC day and drifts from the locally-rendered grid (AND-38).
- Retroactive set adds backdate `created_at` to the session's first set's `created_at` so grouping stays correct (see `SessionDetail.handleAddRetroactiveSet`).
- **Phase 3 data-contract columns are live and fully adopted** (applied 2026-07-03, UI shipped same day): `sets.rpe/notes/group_id/deleted_at`, `routine_exercises`, and the exercise metadata columns (equipment/bodyweight/secondary muscles, edited via the More panel in Edit mode) all have UI. **Deletion is SOFT everywhere, sets AND sessions** (`sessions.deleted_at` added 2026-07-04): sets stamp `deleted_at` via full-row outbox upsert in-workout (Undo clears it) or `api/sets.deleteSet`; `deleteSession` stamps the session and leaves its sets untouched. Every session- or set-reading query carries `.is('deleted_at', null)` (set readers joining sessions also filter `sessions.deleted_at`) EXCEPT `fetchExportSets` — export keeps all rows and exposes both `deleted_at` and `session_deleted_at`. Any new reader must add the filters. `validatePersistedSession` treats a deleted session as finished so resume can't resurrect it.
- **Layer 2 `health` schema is live** (2026-07-03): `health.workouts` / `health.samples` / `health.ingest_log` / `health.config`, written only by the `ingest-health` edge function through the service-role-locked RPC `public.health_ingest()` (token + owner id live in `health.config`, not function secrets — no CLI auth existed to set them). The PWA never reads or writes `health.*`. See `sql/health_schema.sql`, `docs/HEALTH_SYNC_PLAN.md`, `docs/health-sync-shortcut-recipe.md`.

## App architecture

**Screen state.** `App.tsx` holds the current `Screen`. Each screen component gets an `onNavigate` or `onBack`/`onFinish`. No router, no URLs.

**Active workout state (local-first, AND-8).** During a workout the phone is the source of truth; Supabase is a sync target. `useWorkout(sessionId, routineId)` hydrates the current session's sets from the localStorage active-workout record when one exists (server fetch only seeds it), and every mutation updates state + the record synchronously, then enqueues a full-row upsert/delete into the **outbox** (`lib/outbox.ts`: FIFO queue, client-minted UUIDs, idempotent replay). `hooks/useSync` drains the queue on start, queue change, `online`, and a heartbeat; permanent rejections dead-letter to `gym-tracker-outbox-dead` with a toast. Sessions are also created locally (`PickRoutineScreen` mints the UUID), so starting and finishing a workout works fully offline. Reference lists (routines/exercises/muscle groups) use `lib/cache.ts` network-first caching. Conflict policy: single user, one device at a time, phone-authoritative during an active session; editing that same session from another device mid-workout is out of contract. `lib/localOwner.ts` quarantines all local state if a different account signs in on the device.

The hook merges current sets with the last same-routine session into an ordered list of `ActiveExercise = { exercise, sets, histories }`. Exercises from the prior session that haven't been started yet still appear so the user has the plan in front of them (plan seeding needs network; offline shows logged exercises only).

**Resume.** The active-workout record also carries the sets, `startedAt`, and timer anchors (so a PWA kill mid-set keeps measuring rest/duration, capped at 1h). On cold start, `App.tsx` validates via `validatePersistedSession` which returns `active | finished | missing | unknown`, consults the outbox first (an unsynced session is not "missing"), and resumes optimistically on `unknown` (offline). See `docs/AND-11-session-resume-requirements.md`.

**Timer.** `useTimer` is a three-state machine: `idle | set | rest`. `lib/timer.ts` is the pure version (unit-tested).

## Conventions

- **Mobile-first.** Layout is constrained to `max-width: 480px`. All buttons have `min-height: 44px` (`--touch-min`). Fixed `bottom-bar` and `bottom-bar-two-row` for primary actions.
- **Settings and units.** Per-user preferences (theme, weight unit, quick-step values) persist in localStorage keyed by user id (`lib/settings.ts`, `SettingsProvider`/`useSettings`). **Weight is ALWAYS stored in kg**; the chosen unit converts only at the render/entry boundary via `lib/units.ts` (`formatWeight`/`displayToKg`, 2dp both ways for a stable round-trip). Any new weight display or input must go through these helpers, and weight columns put the unit in the header (Kg/Lb) with bare numbers in cells.
- **Styling.** Plain CSS in `src/App.css` with CSS custom properties. No CSS modules, no Tailwind, no styled-components. Inline `style={}` is fine for one-offs.
- **No comments unless WHY is non-obvious.** Don't restate what code does.
- **Error handling.** Action errors show inline via local `error` state where the user is looking (e.g. SetLogger). Load/background failures surface through the toast primitive (`hooks/useToast` + `components/Toast`, provider mounted in `main.tsx`), optionally with a retry action. Every data fetch must surface its failure one of these two ways; never swallow.
- **Confirmations.** Destructive actions use the in-app `ConfirmSheet` bottom sheet (never `window.confirm`, which renders an origin-labelled browser modal). In-workout set deletion is the exception: delete immediately and offer Undo via toast (`useWorkout.restoreSet` re-upserts the same id).
- **Imports.** Always import `import type { ... }` for types-only.
- **Tests.** Pure helpers in `lib/` are unit-tested; UI components are not (deliberate — we use Chrome dev tools for UI verification).

## Workflow

- **Branches:** `fix/and-NN-slug` or `feature/and-NN-slug`. Linear ID always present.
- **Issues:** Logged in Linear team `Andy C`, project `Gym Tracker`. Identifiers `AND-NN`.
- **Commits:** Conventional commits (`fix:`, `feat:`, `refactor:`).
- **PRs:** Merged to `main`. GitHub Actions auto-deploys to GitHub Pages on push to `main` (`.github/workflows/deploy.yml`).
- **Supabase schema changes:** Update `sql/schema.sql` AND apply via Supabase SQL Editor or migration. There is no migration runner — `schema.sql` is the source of truth for fresh installs; changes to a live DB are applied by hand.

## Running locally

```
npm install
cp .env.example .env        # fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run dev                 # vite, http://localhost:5173/gym-tracker/
npm run build               # tsc -b && vite build
npm run lint
npx vitest                  # unit tests
```

Base path is `/gym-tracker/` for both dev and prod (GitHub Pages constraint).
Another local Vite app often holds port 5173; when it does, this dev server
lands on 5174 — trust the vite banner, not the default URL.

## Verification

UI changes are verified via Claude-in-Chrome MCP, not test suites. Treat `tests/` as the contract for pure helpers only. For UI work: start the dev server, drive the flow in Chrome, screenshot if it matters.

**Local setup for agent-driven verification.** `.env` (gitignored) holds `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (the anon key is public — it ships in the deployed bundle). Auth blocks driving the real UI, so a dedicated **RLS-isolated test user** (created in the Supabase dashboard, credentials in gitignored `.secrets.local.json` — see `.secrets.local.example.json`) lets an agent log in and verify flows without touching real data. A project-scoped, OAuth **Supabase MCP server** (`database,docs`) can be added for direct DB reads/migrations; keep it `read_only` unless a migration needs writing.

## Product direction

Two-layer model (settled 2026-07-03): this app is the capture layer only (hot path: live logging, prior-performance reference, PR-at-log-time). Processing and the AI coach live at Layer 2, outside this app. The app never writes to HealthKit (Apple Watch dual-logging already gives Health the workout envelope + HR); it stays a PWA. Roadmaps: `docs/DEEP_REVIEW_AND_V2_PLAN.md` (Layer 1 phases) and `docs/LAYER2_PLAN.md` (health-data ingestion + coach).

## Things that don't yet exist

- No supersets/circuits (AND-10).
- No per-exercise rest defaults / countdown timer (AND-6).
- No notes or RPE (AND-9).

When adding features, check the Linear backlog first — there's a decent chance there's already an issue with prior thinking attached.
