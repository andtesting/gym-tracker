# Health Sync Shortcut: build recipe

Companion to `docs/HEALTH_SYNC_PLAN.md` (sections 5-6). The server side is live: `health` schema applied, `ingest-health` deployed, token seeded. This is the action-by-action build for the phone-side Shortcut. Budget ~20-30 minutes once.

Action names below are from iOS 18-era Shortcuts; minor renames across iOS versions are possible — match by meaning.

## 0. Get the token (2 min, at a computer)

The ingest token was generated inside the database and never written down anywhere else. Fetch it once:

1. Supabase Dashboard → SQL Editor → run:

   ```sql
   select value from health.config where key = 'INGEST_TOKEN';
   ```

2. Paste the value into `.secrets.local.json` as `"health_ingest_token"` (lets `docs/fixtures/health-ingest/run.ps1` run the full curl suite).
3. Have it handy for step 4 of the build (AirDrop/Notes to the phone, delete after pasting).

Rotation, any time: `update health.config set value = translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_'), updated_at = now() where key = 'INGEST_TOKEN';` then re-fetch and re-paste into the one Shortcut action.

## 1. The probe — DONE 2026-07-04

Andy ran the probe: **Heart Rate Variability and Sleep Analysis are both available** in Shortcuts' Find Health Samples type picker (along with everything else in scope). All sections below apply; no fallback needed.

Scope note (2026-07-04 addendum, see HEALTH_SYNC_PLAN section 13): the hot path was widened from 6 to 12 signals. The everything-archive lives in the separate bulk path (Apple Health `export.zip` → local lake), NOT in this Shortcut — do not add high-volume types (all-day heart rate, steps, active energy) here; they kill Shortcuts runs and duplicate what the bulk path captures with full history.

## 2. Build the `Health Sync` Shortcut

Endpoint: `https://fvgussmhzuiihhrhnymq.supabase.co/functions/v1/ingest-health`

Notation: `→ Variable` means tap the action's output and **Rename** it (or use Add to Variable) so later steps can select it.

### 2.1 Window

1. **Date** → Current Date
2. **Adjust Date**: subtract **3 days** from `Current Date` → rename output `WindowStart`

### 2.2 Workouts (with per-workout HR window)

1. **Find Workouts where**: All Workouts, add filter **Start Date** is **after** `WindowStart`, Sort by Start Date, Limit **15** → `RecentWorkouts`
2. **List** (empty) → **Add to Variable** `WorkoutDicts` (creates the variable)
3. **Repeat with Each** item in `RecentWorkouts` (this is the *outer* loop; its item is `Repeat Item`):
   1. **List** (empty) → **Set Variable** `HrPoints`. This reset is REQUIRED as the first action of every iteration: **Add to Variable** only appends, so without it workout #2's series would contain workout #1's points too, and the server computes avg/max HR from whatever series it receives.
   2. **Find Health Samples where**: Type **Heart Rate**, add filters **Start Date is after** `Repeat Item → Start Date` and **Start Date is before** `Repeat Item → End Date`, Sort by **Start Date**, Oldest First → `WorkoutHR`
   3. **Repeat with Each** item in `WorkoutHR` (nested *inner* loop; Shortcuts names its item `Repeat Item 2`):
      - **Dictionary**: `t` = `Repeat Item 2 → Start Date` (Format: ISO 8601, include time + offset), `bpm` = `Repeat Item 2 → Value` (as Number)
      - **Add to Variable** `HrPoints`
   4. **Dictionary**:
      - `workout_type` = `Repeat Item → Workout Type` (as Text)
      - `started_at` = `Repeat Item → Start Date` (Format: ISO 8601 with time + offset)
      - `ended_at` = `Repeat Item → End Date` (ISO 8601 with time + offset)
      - `active_energy_kcal` = `Repeat Item → Active Energy` (as Number, kcal)
      - `hr_series` = `HrPoints` (as Array)
   5. **Add to Variable** `WorkoutDicts`

   > Notes: avg/max HR are computed server-side from `hr_series`; the Shortcut never does math. Dates must be full ISO 8601 **with time and offset** (e.g. `2026-07-03T06:02:11+10:00`) — the server rejects date-only or offset-less strings by design, so a format drift fails loud with a 400 naming the field.

### 2.3 Weight

1. **Find Health Samples where**: Type **Weight**, Start Date after `WindowStart` → `WeightSamples`
2. **Repeat with Each** in `WeightSamples`:
   - **Dictionary**: `sample_type` = `body_mass`, `measured_at` = `Repeat Item → Start Date` (ISO 8601 with time + offset — same requirement as 2.2 for every date in this Shortcut; date-only strings are rejected server-side), `value` = `Repeat Item → Value` (as Number, **kg**)
   - **Add to Variable** `SampleDicts`

   (No `source` key needed: the server defaults `body_mass` to `withings-via-health` and everything else to `apple-watch-shortcut`.)

### 2.4 Resting heart rate

1. Same shape as 2.3: Type **Resting Heart Rate**, `sample_type` = `resting_hr`, value in bpm. Append to `SampleDicts`.

### 2.5 HRV

1. Same shape: Type **Heart Rate Variability**, `sample_type` = `hrv_sdnn`, value in ms. Append to `SampleDicts`.

### 2.6 Sleep

1. **Find Health Samples where**: Type **Sleep Analysis**, Start Date after `WindowStart` → `SleepSegments`
2. **Repeat with Each** in `SleepSegments`:
    - **Dictionary**: `sample_type` = `sleep`, `measured_at` = `Repeat Item → Start Date` (ISO 8601 with time + offset), `ended_at` = `Repeat Item → End Date` (ISO 8601 with time + offset), `value` = `Repeat Item → Duration` (as Number, **minutes**), `detail` = `Repeat Item → Value` (the stage string, as Text)
    - **Add to Variable** `SampleDicts`

### 2.7 Body composition (Withings)

Same three-action shape as 2.3 (Find Health Samples in window → Repeat → Dictionary → Add to `SampleDicts`), once per type:

1. Type **Body Fat Percentage** → `sample_type` = `body_fat_pct`, value as Number (**percent**, e.g. 18.4)
2. Type **Lean Body Mass** → `sample_type` = `lean_body_mass`, value as Number (**kg**)

### 2.8 Vitals (Watch)

Same shape again, once per type:

1. Type **Blood Oxygen** (Oxygen Saturation) → `sample_type` = `spo2`, value as Number (**percent**, e.g. 97)
2. Type **Respiratory Rate** → `sample_type` = `respiratory_rate`, value as Number (**breaths/min**)
3. Type **Wrist Temperature** → `sample_type` = `wrist_temp`, value as Number (**°C**)
4. Type **Walking Heart Rate Average** → `sample_type` = `walking_hr_avg`, value as Number (**bpm**)

Every one of these needs only `sample_type`, `measured_at` (ISO 8601 with time + offset), and `value` — no `ended_at`, no `detail`, no `source` (the server defaults body composition to `withings-via-health` and the rest to `apple-watch-shortcut`).

### 2.9 Assemble and POST

1. **Dictionary** → `Payload`:
    - `batch_kind` = `daily` (Text)
    - `workouts` = `WorkoutDicts` (Array)
    - `samples` = `SampleDicts` (Array)
2. **Get Contents of URL**:
    - URL: `https://fvgussmhzuiihhrhnymq.supabase.co/functions/v1/ingest-health`
    - Method: **POST**
    - Headers: `Authorization` = `Bearer <paste the token>` (one space after "Bearer")
    - Request Body: **JSON** = `Payload`
    - → `IngestResponse`

### 2.10 Result handling

1. **Get Dictionary Value**: key `ok` from `IngestResponse` → `OkFlag`
2. **If** `OkFlag` **is not** `1`. One positive condition only — the server returns `ok` on every response (`true` on success, `false` on 400/401/500, coerced by Shortcuts to `1`/`0`), and a missing-value test would stay silent on `false`. This single condition catches success=false, an absent key, and a non-JSON error body alike:
    - **Show Notification**: title `Health Sync failed`, body = `IngestResponse` (as Text)
3. **Otherwise** (optional): **Show Notification** with `IngestResponse → counts` while building trust in the pipeline; delete the success branch once bored of it.

## 3. First run

Run manually. iOS prompts for Health read access per type — **grant all requested**. Expect the counts notification; then cross-check in the SQL Editor:

Units check on the first run: confirm `spo2` rows store ~97, not ~0.97 (HealthKit sometimes hands oxygen saturation back as a 0–1 fraction). If you see fractions, add a ×100 **Calculate** step to that one section:

```sql
select sample_type, value, measured_at from health.samples order by measured_at desc limit 20;
```

```sql
select batch_kind, received_at, counts from health.ingest_log order by received_at desc limit 5;
```

Compare counts against the Health app's own numbers for the same 3-day window (workouts count, weight entries).

## 4. Automation

Shortcuts → **Automation** → **+** → **Time of Day**: 09:00, Daily → **Run Immediately** (no confirmation) → action: run `Health Sync`. 09:00 lands after the Withings morning weigh-in and the overnight sleep write.

## 5. When it breaks

Per HEALTH_SYNC_PLAN section 8: every failure is either visible in a notification (POST/shape/token errors) or as a gap in `ingest_log` (didn't run — the next run's 3-day window backfills it). After an iOS update renames an action, the 400 notification's `reasons` array names the exact field that drifted.
