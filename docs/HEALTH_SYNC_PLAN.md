# Health Sync Plan: replacing Health Auto Export with a DIY pipeline

Date: 2026-07-03. Companion to `docs/LAYER2_PLAN.md`; this document supersedes its "Health Auto Export" ingestion section. Goal: get Apple Health data (Watch workouts and vitals, Withings weight) into the Layer 2 `health` schema without buying a third-party app.

## 1. The decision and its hard constraints

Apple Health data is readable only by software running ON the iPhone with HealthKit entitlements. That leaves exactly three extraction agents:

| Agent | Verdict |
| --- | --- |
| Native app (Expo/EAS) | Full fidelity, but a rewrite-scale project already rejected in the V2 plan |
| Health Auto Export (buy) | Works, ~AUD$10/yr, but a black-box dependency; the thing this plan replaces |
| **iOS Shortcuts (build)** | **Chosen.** Free, no Mac, scriptable, supports Health reads and HTTP POST, runs on a daily automation |

The PWA itself can never do this; no web API for HealthKit exists. The Shortcut is therefore a permanent component of the architecture, not a stopgap: phone-side extraction agent, Supabase edge function as the receiving dock, `health` schema as the landing zone.

**What "knowing our data" buys us.** HAE is a generic exporter; it ships everything. We need exactly six signals, and the expensive one (in-workout heart rate) can be windowed per workout instead of exported wholesale, which is what makes Shortcuts viable at all.

## 2. Data inventory: what, where from, how much

| Signal | HealthKit type | Producer | Cadence | Est. volume | Layer 2 use |
| --- | --- | --- | --- | --- | --- |
| Body weight | Body Mass | Withings scale → Health | ~1/day | 1 row/day | Relative strength, weight-vs-volume trend |
| Workout envelopes | Workouts | Apple Watch | 3-5/wk | 5 rows/wk | Join to gym-tracker sessions by time overlap |
| In-workout heart rate | Heart Rate (windowed) | Watch during workout | ~1 per 5s while recording | 400-900 samples per workout | HR curve per session, effort correlation |
| Resting heart rate | Resting Heart Rate | Watch (daily) | 1/day | 1 row/day | Readiness |
| HRV | Heart Rate Variability (SDNN) | Watch (few/day) | 2-5/day | few rows/day | Readiness |
| Sleep | Sleep Analysis (category) | Watch | nightly, multi-segment | 5-30 rows/night | Readiness vs performance |

Deliberately excluded: continuous background heart rate (low value, high volume; the killer for a Shortcuts pipeline), steps/energy/stand data (no coaching use identified), body composition beyond weight (add later if the Withings payload in Health proves reliable).

**Verify-on-device flags.** Shortcuts' "Find Health Samples" reliably covers quantity types (Weight, Heart Rate, Resting Heart Rate) and workouts. Two types need confirmation on Andy's iOS version before being promised: HRV (SDNN) and Sleep Analysis segments. The build recipe (section 6) starts with a 2-minute probe step for each; if either is missing, it is dropped from v1 with HAE remaining the documented fallback for just that signal. Do not assume; check.

## 3. Target schema (concretising LAYER2_PLAN)

As specified in `LAYER2_PLAN.md`, with the in-workout HR decision resolved: HR series ride inside the workout row as JSONB, not a per-sample table. One workout = one row = one upsert; Layer 2 can explode the array in SQL when needed.

```sql
create schema if not exists health;

create table if not exists health.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  source text not null,                        -- 'apple-watch-shortcut'
  workout_type text not null,                  -- Shortcuts' workout type string
  started_at timestamptz not null,
  ended_at timestamptz not null,
  active_energy_kcal numeric,
  avg_hr numeric,
  max_hr numeric,
  hr_series jsonb,                             -- [{"t": iso8601, "bpm": n}, ...]
  created_at timestamptz default now(),
  unique (user_id, source, started_at)
);

create table if not exists health.samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  source text not null,                        -- 'withings-via-health', 'apple-watch-shortcut'
  sample_type text not null,                   -- 'body_mass' | 'resting_hr' | 'hrv_sdnn' | 'sleep'
  measured_at timestamptz not null,
  ended_at timestamptz,                        -- sleep segments have duration
  value numeric not null,                      -- kg, bpm, ms; sleep: minutes
  detail text,                                 -- sleep stage ('core','rem','deep','awake') else null
  created_at timestamptz default now(),
  unique (user_id, source, sample_type, measured_at)
);

create table if not exists health.ingest_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  received_at timestamptz default now(),
  batch_kind text not null,                    -- 'daily' | 'manual'
  counts jsonb not null                        -- {"workouts": 2, "samples": 41, "rejected": 0}
);

alter table health.workouts enable row level security;
alter table health.samples enable row level security;
alter table health.ingest_log enable row level security;
-- Owner-only read policies (same pattern as public schema). Writes come only
-- from the edge function's service role, which bypasses RLS by design.
```

Idempotency is carried entirely by the two unique constraints: re-sending any window is a no-op upsert. That removes all client-side watermark state; the Shortcut just always sends "the last 3 days".

## 4. Ingestion endpoint: `ingest-health` edge function

- **Route**: `POST https://fvgussmhzuiihhrhnymq.supabase.co/functions/v1/ingest-health`
- **Auth**: static bearer token in the `Authorization` header, compared against an `INGEST_TOKEN` function secret (generated once, 32 bytes base64url). The function also holds `OWNER_USER_ID` as a secret and stamps every row with it: single-tenant by configuration, and a leaked token can only write into Andy's own health tables, never read anything (function exposes no GET).
- **Body contract** (exactly what the Shortcut can naturally assemble):

```json
{
  "batch_kind": "daily",
  "workouts": [
    {
      "workout_type": "Traditional Strength Training",
      "started_at": "2026-07-03T06:02:11+10:00",
      "ended_at": "2026-07-03T06:58:40+10:00",
      "active_energy_kcal": 412,
      "hr_series": [{ "t": "2026-07-03T06:02:15+10:00", "bpm": 91 }]
    }
  ],
  "samples": [
    { "sample_type": "body_mass", "measured_at": "2026-07-03T07:12:00+10:00", "value": 82.4, "source": "withings-via-health" },
    { "sample_type": "resting_hr", "measured_at": "2026-07-03T00:00:00+10:00", "value": 52, "source": "apple-watch-shortcut" },
    { "sample_type": "hrv_sdnn", "measured_at": "2026-07-03T05:40:00+10:00", "value": 68, "source": "apple-watch-shortcut" },
    { "sample_type": "sleep", "measured_at": "2026-07-02T22:41:00+10:00", "ended_at": "2026-07-03T05:52:00+10:00", "value": 431, "detail": "asleep", "source": "apple-watch-shortcut" }
  ]
}
```

- **Behaviour**: validate token → validate shape (reject with 400 and a reason; count rejects) → compute `avg_hr`/`max_hr` server-side from `hr_series` (keep the Shortcut dumb) → upsert workouts and samples on their unique keys → insert one `ingest_log` row → return `{ok: true, counts}`. Timestamps accepted with any offset; stored as timestamptz.
- **Size guardrail**: a 3-day window with two workouts ≈ 2k HR points ≈ 100-200 KB JSON. Edge functions accept far more; no chunking needed at this volume. If a payload ever exceeds 5 MB the function returns 413 and the log shows it.

## 5. The Shortcut: architecture

One Shortcut, `Health Sync`, run two ways: a daily personal automation (time-of-day trigger, "Run Immediately", no confirmation) and manually whenever wanted. It always covers a 3-day lookback window, so up to two consecutive missed runs lose nothing (idempotent server, overlap absorbs gaps).

Module flow:

1. **Window**: `start = now - 3 days`, `end = now`.
2. **Workouts**: Find Workouts where Start Date is in window (limit 15). For each: capture type, start, end, active energy; then Find Health Samples of type Heart Rate between THIS workout's start and end (sorted oldest first) and build the `hr_series` array from each sample's date + value.
3. **Weight**: Find Health Samples of type Weight in window; map to `body_mass` samples.
4. **Resting HR / HRV**: same per type (HRV behind the section-2 probe).
5. **Sleep**: Find Health Samples of type Sleep in window (behind the probe); map segment start/end/stage; value = minutes.
6. **Assemble + POST**: build the dictionary, Get Contents of URL (POST, JSON, `Authorization: Bearer <token>` header).
7. **Result handling**: if the response lacks `"ok":true`, Show Notification with the error body.

The exact action-by-action build recipe (every tap, every variable) ships as `docs/health-sync-shortcut-recipe.md` when the endpoint is live, because two of its steps embed the real URL and token, and the recipe should be written against the exact action names of the installed iOS version.

## 6. Setup on the phone (Andy, ~20-30 minutes, once)

1. **Probe (2 min)**: in a scratch Shortcut, add "Find Health Samples" and check the type picker for "Heart Rate Variability" and "Sleep Analysis". Report which exist; that fixes v1 scope.
2. Build `Health Sync` from the recipe. iOS will prompt to grant the Shortcut read access per Health type on first run; grant all requested.
3. Run it manually; check the notification shows ok plus counts.
4. Automation: Shortcuts → Automation → Time of Day (suggest 09:00 daily, after Withings morning weigh-in and overnight sleep write) → Run Immediately → pick `Health Sync`.
5. Nothing else recurring: no app to renew, no subscription.

## 7. Security model

- Token: 32-byte random, stored only in the Shortcut (on-device) and the function secret. Rotation = regenerate secret + edit one Shortcut action.
- Blast radius of a leaked token: write-only inserts into Andy's own `health` rows (worst case: garbage rows, visible in `ingest_log`, deletable). No read path, no access to workout data or other tables.
- The function runs service-role but touches only the `health` schema; `OWNER_USER_ID` is pinned server-side, never client-supplied.
- No PII in URLs (all data in POST bodies); TLS end to end.
- RLS keeps the app's anon-key clients read-only on `health.*` rows they own; the PWA never writes health data.

## 8. Failure modes and observability

| Failure | Detection | Recovery |
| --- | --- | --- |
| Shortcut didn't run (phone off at 9am) | Gap in `ingest_log` | Next run's 3-day window backfills automatically |
| Shortcut ran, POST failed (no signal) | iOS shows the failure notification | Run manually later; window absorbs it |
| Bad payload shape after an iOS update changes an action | 400 + notification with reason; `rejected` count in log | Fix the one Shortcut action |
| Token drift | 401 + notification | Re-paste token |
| Duplicate sends | None needed | Unique-key upserts; by design |
| Withings didn't sync to Health | Missing `body_mass` days in a weekly check query | Open Withings app (forces its Health write), re-run Shortcut |

Weekly health check (Layer 2 coach prompt includes it): `select batch_kind, received_at, counts from health.ingest_log order by received_at desc limit 10;` plus a days-with-no-weight query.

## 9. Test plan (before the phone is involved)

1. Schema applied; RLS verified with the anon key (select as test user returns zero rows of Andy's).
2. `curl` fixture suite against the deployed function: valid daily batch, duplicate resend (counts unchanged), bad token (401), malformed sample (400 + rejected count), oversized guardrail. Fixtures checked into `sql/` alongside a README? No: `docs/fixtures/health-ingest/*.json` so they are reusable.
3. Only after curl passes: build the Shortcut on-device and compare its first real payload's `ingest_log` counts against the Health app's own numbers for the same window.

## 10. Execution checklist and split

**Claude (next session, once MCP write access is live), ~half a day:**

1. Apply `health` schema migration (also add it to `sql/migrations/` and mirror in a new `sql/health_schema.sql`).
2. Write + deploy `ingest-health` edge function; set `INGEST_TOKEN` and `OWNER_USER_ID` secrets; run the curl suite.
3. Write `docs/health-sync-shortcut-recipe.md` with the live URL and token placeholder (token itself delivered out-of-band, gitignored like `.secrets.local.json`).
4. Update `LAYER2_PLAN.md` to point here; PR the lot through the usual review loop.

**Andy, ~30 minutes total:**

1. Run `/mcp` in a fresh session and re-authenticate the Supabase server if prompted (the config change may have dropped the OAuth grant).
2. Section 6 phone setup, starting with the 2-minute probe.
3. Thereafter: nothing. The automation runs itself.

## 11. Honest comparison with just buying HAE

| | DIY Shortcut | HAE |
| --- | --- | --- |
| Cost | $0 | ~AUD$10/yr |
| Fidelity | The 6 signals we chose; HR windowed per workout | Everything, incl. high-frequency background series |
| Sleep/HRV certainty | Probe-dependent (section 2) | Known good |
| Failure surface | Our own; fully inspectable; notification on error | Black box; silent failure modes unknown |
| Maintenance | One Shortcut to keep working across iOS updates | Vendor's problem |
| Fit with schema | Payload designed for our tables; zero mapping layer | Generic JSON needing a mapping layer in the function anyway |

The DIY route wins on control and fit; HAE stays documented as the per-signal fallback if the probe kills HRV or sleep, and as the wholesale fallback if Shortcuts reliability disappoints in practice. Nothing in the schema or function is Shortcut-specific, so swapping the extraction agent later costs only the mapping layer.

## 12. Out of scope, stated

- Writing anything back to Health (unnecessary: Watch dual-logging already covers the envelope; decided in the V2 plan).
- Real-time/in-workout streaming to Layer 2 (coach is cold-path by design).
- Background continuous HR, steps, stand hours: excluded from THIS pipeline (see section 13 — they live in the bulk path). Respiratory rate was promoted into the hot path by the addendum.
- Native app: unchanged gate from the V2 plan.

## 13. Addendum 2026-07-04: holistic scope, two pipes

Andy widened the goal from "coach inputs" to a holistic health engine. Decision (after rejecting Shortcut-captures-everything — the binding constraint is Shortcuts' per-sample loop limits on the phone, not Supabase storage):

- **Hot path (this document's pipeline), widened 6 → 12 signals.** Added: blood oxygen (`spo2`, %), body fat % (`body_fat_pct`), lean body mass (`lean_body_mass`, kg) — both Withings-sourced — respiratory rate (`respiratory_rate`, breaths/min), wrist temperature (`wrist_temp`, °C), walking HR average (`walking_hr_avg`, bpm). All low-frequency (≤ a handful of rows/day). Probe result: HRV and Sleep both available on Andy's iOS; no fallback needed. Mindful minutes considered and dropped (unused on his Watch).
- **Bulk path (new, separate project): Apple Health `export.zip` → local lake (DuckDB).** Periodic manual export (monthly/quarterly; each export contains the FULL history, so cadence can't lose data) parsed locally. This is where all-day heart rate, steps, active energy, stand hours, and every other type live — with complete multi-year backfill the daily pipeline can never provide. Zero Supabase volume. Parser is its own design/build session.
- Explicitly rejected: capture-everything in the Shortcut (volume kills Shortcuts runs; ~60 hand-built blocks; duplicates the bulk path without its history). HAE remains the documented fallback if a daily-everything need ever materialises.

**Correction 2026-07-07:** Shortcuts on Andy's iOS has **no `Find Workouts` action**, so the workout signal (per-workout HR series) cannot be captured in the hot path. Workouts move to the **bulk `export.zip` → lake path** (which carries them with full history anyway). The daily hot path is therefore the **10 low-frequency sample types** (body_mass, resting_hr, hrv_sdnn, sleep, body_fat_pct, lean_body_mass, spo2, respiratory_rate, wrist_temp, walking_hr_avg), all via `Find Health Samples`. Server confirmed to accept a workout-less batch. Build details: `docs/health-sync-shortcut-recipe.md` §0.5.
