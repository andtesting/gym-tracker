# Layer 2 Plan: Data Platform + AI Coach

Date: 2026-07-03. Companion to `docs/DEEP_REVIEW_AND_V2_PLAN.md` (Part 0 defines the two-layer model).

## Purpose

One place where all capture sources land and are processed together, and where the AI coach lives. Distinct from the gym-tracker app: the app captures; Layer 2 thinks.

Sources at launch:

| Source | What it carries | Path in |
| --- | --- | --- |
| Gym Tracker app | Sessions, sets, reps, weight, rest, set timing, RPE, notes | Already in Supabase (public schema) |
| Apple Watch | Workout envelopes, heart rate during sessions, active energy, resting HR, HRV, sleep | Apple Health → Health Auto Export → edge function |
| Withings scale | Body weight, body composition | Withings app → Apple Health → same pipeline |
| Future devices | Whatever they emit | Same pipeline or new ingester; the schema is source-agnostic |

## Principles

1. **The logger stays boring.** Layer 2 experimentation must never risk breaking a workout. Blast radius is contained by schema separation and read-only access paths.
2. **Timestamps are the join key.** Every source joins on time. Andy starts the Watch and the app together, so session ↔ Watch-workout matching is a simple interval-overlap join.
3. **Land raw, derive later.** Ingestion stores what the source said (including a `raw jsonb` copy); interpretation lives in views and coach prompts that can be rewritten without re-ingesting.
4. **Idempotent ingestion.** Health Auto Export re-sends overlapping windows; unique constraints make re-delivery a no-op.
5. **The coach speaks through one table.** Coach output lands in `routine_exercises` (Layer 1's template table) and markdown reports. No other write path into the app's data.

## Architecture decision: same Supabase project, separate schema

Chosen over a second Supabase project (ETL plumbing, two auth contexts, toil for n=1) and over local files/DuckDB (no always-on ingestion endpoint for the phone; analysis ergonomics can still be had via MCP/exports). Revisit and graduate to a separate project only if ingestion volume or experimentation starts threatening the logger.

```
Supabase project
├── public schema          Layer 1 (gym tracker; untouched)
│   ├── sessions / sets / exercises / routines / muscle_groups
│   └── routine_exercises  ← coach write-back lands here (Layer 1 Phase 3)
├── health schema          Layer 2 landing zone
│   ├── workouts           Watch/Health workout envelopes
│   ├── samples            scalar time series (weight, HRV, resting HR, sleep)
│   └── ingest_log         batches received, for debugging
└── views (health schema)
    ├── session_vitals     sessions ⋈ workouts by time overlap (HR per session)
    └── weekly_training    tonnage/e1RM/volume per muscle group per week
```

### Schema sketch

```sql
create schema health;

create table health.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  source text not null,                    -- 'apple-watch', etc.
  external_id text,                        -- HealthKit UUID when provided
  workout_type text not null,              -- 'traditional_strength_training', ...
  started_at timestamptz not null,
  ended_at timestamptz not null,
  active_energy_kcal numeric,
  avg_hr numeric,
  max_hr numeric,
  raw jsonb,
  created_at timestamptz default now(),
  unique (user_id, source, started_at, workout_type)
);

create table health.samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  source text not null,                    -- 'withings', 'apple-watch', ...
  sample_type text not null,               -- 'body_mass', 'hrv_sdnn', 'resting_hr', 'sleep_asleep', ...
  measured_at timestamptz not null,
  value numeric not null,
  unit text not null,                      -- 'kg', 'ms', 'bpm', 'min'
  raw jsonb,
  created_at timestamptz default now(),
  unique (user_id, source, sample_type, measured_at)
);
```

RLS on both tables: owner-only, same pattern as Layer 1. High-resolution in-workout HR series can start as `raw jsonb` on `workouts`; promote to a `health.hr_points` table only if a real analysis needs row-level HR.

### Ingestion: DIY Shortcut → Edge Function (supersedes Health Auto Export)

**Decision changed 2026-07-03: instead of buying Health Auto Export, the extraction agent is a purpose-built iOS Shortcut. Full spec, schema, endpoint contract, security model, test plan and rollout checklist: `docs/HEALTH_SYNC_PLAN.md`. The paragraphs below are retained for the original HAE context and as the documented fallback.**

### Original HAE sketch (fallback path)

- Health Auto Export (HAE, third-party iOS app, ~AUD$10/yr) reads Apple Health and POSTs JSON to a URL on a schedule (daily) and/or on new data. Covers Watch workouts, HR, HRV, sleep, resting HR, and the Withings weight that Withings already syncs into Health. One pipe, many sources.
- A Supabase Edge Function `ingest-health` receives the POST: verifies a static bearer token (HAE supports custom headers), maps HAE's JSON to `workouts`/`samples`, upserts on the unique keys, logs the batch to `ingest_log`.
- The function runs with the service role but writes rows pinned to Andy's user id (single-tenant by config); RLS still protects reads.

Fallback if HAE proves unreliable: an iOS Shortcut with the "Find Health Samples" action posting to the same endpoint (clunkier, fewer types), or the Withings API directly for weight (OAuth; only worth it if the Health hop drops data). Do not build fallbacks pre-emptively.

### Correlation views

- `session_vitals`: join `public.sessions` to `health.workouts` where intervals overlap (same user, `tstzrange(started_at, coalesce(finished_at, started_at + interval '3 hours')) && tstzrange(w.started_at, w.ended_at)`). Yields per-session avg/max HR and energy. Since both are started together, expect near-1:1 matches; unmatched rows on either side are themselves a signal (forgot the Watch, forgot the app).
- `weekly_training`: from `public.sets` (working sets, not soft-deleted): weekly tonnage per muscle group, e1RM per exercise (Epley: `weight * (1 + reps/30)`), set counts. This is where the analytics deferred out of Layer 1 live.

## The coach

**v0 is not an app. It is Claude with SQL access and a standing prompt.**

- Access: the existing project-scoped, read-only Supabase MCP server already reaches both schemas. Zero new infrastructure.
- Artifact: a `coach/` skill or standing prompt in this repo defining the weekly review: progression check per lift (e1RM trend), volume balance per muscle group, readiness context (HRV/resting HR/sleep vs performance), body-weight trend vs strength trend, flags (stalls, unilateral imbalances, rest-time drift), and concrete next-week targets.
- Cadence: on-demand first ("run my weekly review" in Claude Code); a scheduled weekly agent once the prompt has stabilised for a few manual runs.
- Output: a markdown report per week (committable to a private location or just conversational), plus proposed template changes.

**Write-back (coach → app):** proposed `routine_exercises` rows (target sets/reps/weight/rest per exercise per routine). Path: coach proposes, Andy approves, the change is applied via a single guarded write (MCP in write mode for that one migration-style statement, or pasted into the Supabase SQL editor). Keep the approval step; an unattended agent editing next week's training plan is a second-order risk with no offsetting benefit at n=1.

## Phasing

| Step | What ships | Effort | Gate to next |
| --- | --- | --- | --- |
| L2.0 | `health` schema + `ingest-health` edge function + HAE configured on phone | 1–2 days | A week of clean daily ingests (spot-check counts vs the Health app) |
| L2.1 | Correlation views; optionally surface session HR on the app's SessionDetail (read-only, one query) | 1 day | Sessions match Watch workouts reliably |
| L2.2 | Coach v0: weekly-review prompt/skill over MCP, run manually | 1–2 days of prompt iteration | Three consecutive useful weekly reviews |
| L2.3 | Write-back loop: coach proposals → approved `routine_exercises` updates; app renders plan from templates (requires Layer 1 Phase 3) | 1 day | n/a |

Dependency on Layer 1: only the Phase 3 contract migrations (provenance, soft delete, templates, RPE). L2.0–L2.2 need nothing from Layer 1 at all and can start immediately.

## Risks and tradeoffs, stated plainly

- **HAE is a third-party dependency** for the whole read pipeline. Mitigations: raw-first storage (re-interpretation never needs re-export), idempotent upserts (gaps backfill by re-sending a window), and the Shortcut fallback. Acceptable for n=1.
- **Schema cohabitation** couples warehouse churn to the logger's DB. Mitigations: separate schema, additive-only changes to `public`, read-only MCP by default. Graduation path exists if it ever bites.
- **Insight latency**: the coach sees yesterday, not the current set. By design; hot-path feedback (PRs, last-session reference) stays in the app.
- **Half-built platform risk**: Layer 2 could stall at "ingestion works, coach never happens" because the logger is fine without it. Mitigation is the phasing gate structure: each step is independently useful (L2.0 alone gives a queryable health archive; L2.1 alone puts HR on sessions), so stalling at any gate still leaves value banked.
- **What Layer 2 is not**: not a dashboard product, not a Streamlit app, not a second codebase to maintain. Views + Claude + one edge function. Resist building UI here; the moment a chart is wanted, it is a coach-report artifact, not a web app.
