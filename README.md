# Gym Tracker

A single-user, offline-first PWA gym tracker that doubles as the capture layer of a personal health data platform. Built for one person (Andy), one phone, real gym conditions: no OS keyboard mid-set, no network dependency mid-workout, no data ever silently lost.

Live at <https://andtesting.github.io/gym-tracker/> (GitHub Pages, auto-deployed from `main`).

## The shape of the system

Two layers, two pipes:

```
CAPTURE (this repo)                          ANALYSIS (Layer 2, outside this app)
┌─────────────────────────────┐
│ PWA: live workout logging   │──Supabase──▶  coach / correlation views
│ iOS Shortcut: 12 health     │   (Postgres)  (reads, never blocks capture)
│ signals daily → edge fn *   │
└─────────────────────────────┘
  Apple Health export.zip ────▶ local DuckDB lake (full history, every type) **
  (monthly/quarterly, manual)    docs/HEALTH_LAKE_PLAN.md

*  server side live and verified; the phone-side Shortcut is not built yet
   (HANDOFF step 1) — health tables are empty until it runs
** designed, not built — future separate project
```

The app is deliberately **capture-only**: hot-path logging, prior-performance reference, PR detection at log time. Processing, trends-across-domains, and the AI coach live at Layer 2 (`docs/LAYER2_PLAN.md`) and must never add friction to logging.

## Features

**Workout capture** (the hot path):

- Start a workout offline, log sets with an in-app numpad (no OS keyboard, no viewport jumps), finish offline — everything syncs later through an idempotent outbox.
- Per-set: reps, weight, RPE (quick-tap chips), notes, rest time (measured automatically, credited to the set it preceded), set duration, wall-clock timestamps.
- Supersets: link exercises in the plan; history renders them as one group with A1/B1/A2 labels.
- Routine templates: planned exercises with target sets/reps/weight/rest per routine; the plan seeds from the template, then last session's leftovers.
- Rest timer: count-up by default (goes large/bold/red past 3:00); optional countdown mode against per-exercise rest targets (120s default).
- Prefill from your last comparable set; PR badges computed at log time; cross-routine exercise history paging.
- Cold-start resume: a PWA kill mid-set restores sets, timers, and pending rest.

**Reference & analysis surfaces**: home heatmap + weekly glance stats (streak, tonnage vs last week, next-up routine), session detail with full editing, trends per exercise, CSV/JSON export (append-only column contract for downstream consumers).

**Health ingestion** (`supabase/functions/ingest-health`): a DIY iOS Shortcut posts 12 daily signals (weight, body fat, lean mass, workouts with windowed HR series, resting HR, HRV, sleep stages, SpO₂, respiratory rate, wrist temp, walking HR) to an edge function. Static-token auth, transactional idempotent upserts, loud whole-batch rejection on shape drift. Status: server side deployed and curl-verified 7/7; the Shortcut itself is built by hand on the phone and is **pending** — build guide: `docs/health-sync-shortcut-recipe.md`.

**Data contract**: weight always stored in kg (display converts at the edge); deletes are soft at both set and session level (`deleted_at`; export keeps everything, every other reader filters); per-user RLS; provenance columns for Layer 2.

## Getting started

```bash
npm install
cp .env.example .env        # VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run dev                 # → http://localhost:5173/gym-tracker/ (or 5174 if 5173 is taken — trust the vite banner)
npm run build && npm run lint && npx vitest
```

Fresh backend: run `sql/schema.sql` then `sql/health_schema.sql` in the Supabase SQL editor (they are the source of truth for new installs; `sql/migrations/` is the applied-by-hand history for the live DB). Seed `health.config` per the comments in `health_schema.sql`. Public sign-ups stay disabled; this is a single-user system by configuration.

## Assumptions this system leans on

- **One user, one device at a time.** The phone is authoritative during an active workout; editing that session from a second device mid-workout is out of contract.
- **Local-first means the server is a sync target**, not a dependency: every mutation lands in state + localStorage synchronously and replays through a FIFO outbox with client-minted UUIDs.
- **Downstream consumers never lose rows**: soft deletes everywhere, append-only export columns, raw-first storage.
- **The phone can't be scripted beyond Shortcuts**, and Shortcuts can't loop over tens of thousands of samples — which is why the health pipeline is two pipes (small daily hot path, bulk manual archive) instead of one.

## Roads not taken (and why)

| Considered | Chosen instead | Where argued |
| --- | --- | --- |
| Native app (Expo/EAS) for HealthKit access | PWA + Shortcut extraction | `docs/DEEP_REVIEW_AND_V2_PLAN.md` |
| Health Auto Export (~AUD$10/yr) | DIY Shortcut (fallback: still HAE) | `docs/HEALTH_SYNC_PLAN.md` §1, §11 |
| Capture every Health type daily | 12-signal hot path + export.zip bulk lake | `HEALTH_SYNC_PLAN.md` §13, `HEALTH_LAKE_PLAN.md` |
| Router + URLs | `Screen` discriminated union in App state | `AGENTS.md` |
| Component/E2E test suites | Unit tests for pure `lib/` + agent-driven Chrome verification | `AGENTS.md` |
| Separate Supabase project for health data | Separate schema, same project | `docs/LAYER2_PLAN.md` |

## Working on this repo (humans and agents)

Read **`AGENTS.md` first** — stable conventions, architecture, data contracts. **`HANDOFF.md`** is the current-state snapshot (replaced every session). Plan docs under `docs/` hold the decision history; per-issue requirement docs capture prior thinking (check Linear team `Andy C`, project `Gym Tracker`, before building anything — an issue with context probably exists).

Project skills (in `.claude/skills/`, auto-discovered by Claude Code):

- **`pr-loop`** — the mandatory shipping workflow: branch → implement → verify → finder-agent review → steelman findings → amend → squash-merge → Linear. Every PR, even docs.
- **`health-check`** — curl fixture suite + cleanup after touching the ingest function; weekly `ingest_log` inspection once daily syncs are live.

Deliberately **not** built (reflection 2026-07-04): no hooks (nothing event-driven to guard yet), no custom agents (the generic `code-reviewer` with a well-fed prompt has caught real bugs in ~10 consecutive PRs), no polling loops (nothing to poll until ingests flow — at which point a weekly scheduled health-check run is the natural next tool). Tooling gets built when a repetition earns it, not before.

Verification setup for agents: an RLS-isolated test user (credentials in gitignored `.secrets.local.json`, template in `.secrets.local.example.json`) lets an agent drive the real UI in Chrome without touching real data. The Supabase MCP server handles DB reads/migrations — keep it `read_only=true` except when a migration is in flight.

## Doc map

| File | What it is |
| --- | --- |
| `AGENTS.md` | Conventions, architecture, data model — read first |
| `HANDOFF.md` | Current state + next steps, replaced each session |
| `docs/DEEP_REVIEW_AND_V2_PLAN.md` | Layer 1 roadmap (phases 0–3, shipped) |
| `docs/LAYER2_PLAN.md` | Data platform + AI coach roadmap |
| `docs/HEALTH_SYNC_PLAN.md` | Daily health ingestion: decision, contract, security, §13 holistic addendum |
| `docs/health-sync-shortcut-recipe.md` | Tap-by-tap iOS Shortcut build guide |
| `docs/HEALTH_LAKE_PLAN.md` | Bulk path design: export.zip → local DuckDB |
| `docs/fixtures/health-ingest/` | Curl test suite for the ingest function |
| `docs/AND-*.md` | Per-issue requirement docs |
