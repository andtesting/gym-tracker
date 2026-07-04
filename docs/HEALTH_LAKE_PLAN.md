# Health Lake: Apple Health export.zip → local DuckDB

Date: 2026-07-04. The bulk path from `HEALTH_SYNC_PLAN.md` section 13, designed. Goal: the complete Apple Health archive — every type, full multi-year history — queryable locally, with zero cloud volume and zero phone automation. Companion to the hot path (12-signal Shortcut → Supabase), not a replacement for it.

## 1. Where it lives

Its own project: `C:\Users\andyj\ClaudeProjects\health-lake` (scaffolded in a future session). The gym tracker stays the capture layer; this plan lives here only because the two-pipe decision was made here. When the project exists, this doc moves or gets a pointer.

## 2. Input: what export.zip actually is

Health app → profile → Export All Health Data → `export.zip` containing `apple_health_export/`:

- `export.xml` — the payload. `<HealthData>` root; millions of `<Record>` elements (`type`, `sourceName`, `unit`, `startDate`, `endDate`, `creationDate`, `value`, nested `<MetadataEntry>`), `<Workout>` elements (with `<WorkoutStatistics>`, `<WorkoutEvent>` children), `<ActivitySummary>` per-day ring rows, `<Correlation>`, `<ClinicalRecord>`. Dates as `2026-07-04 06:02:11 +1000`. Size: 1–10 GB uncompressed for years of Watch data.
- `electrocardiograms/` CSVs, `workout-routes/` GPX — v2 concerns, cataloged but not parsed in v1.
- Known landmine: the file opens with an inline DTD that several iOS versions have shipped malformed; the parser must not validate against it.

Key property: **every export is a full-history snapshot.** There is no incremental format, which turns the hardest problem (merge) into a non-problem (rebuild).

## 3. Pipeline design

```
export.zip → [Python, lxml iterparse] → Parquet staging (batched) → DuckDB build → health.duckdb
```

- **Parser**: Python + `lxml.etree.iterparse`, reading `export.xml` directly out of the zip (iterparse is sequential and `ZipFile.open()` streams are readable — no 10 GB extraction to disk). Memory: `elem.clear()` alone is NOT enough — cleared elements stay attached as empty siblings of the root and still accumulate gigabytes over tens of millions of records; use the fast-iter pattern (clear + delete preceding siblings) for genuinely bounded memory.
- **DTD handling (hypothesis, proven by fixture before build)**: strip or skip the inline `<!DOCTYPE …]>` block with a small bounded filtering stream wrapper rather than trusting parser flags — `load_dtd=False` may not survive lexing of the historically malformed inline subsets, and `recover=True` is rejected outright: it would silently paper over truncation or corruption anywhere in the file, the exact quiet-wrongness this design exists to prevent. `recover=False`; real corruption aborts loudly.
- **Staging**: batches of ~100k elements → Arrow RecordBatch → Parquet part-files per element kind (`records/part-*.parquet`, `workouts/…`, `activity_summaries/…`). Staging survives independently of the DB: re-deriving the DuckDB schema never re-parses XML.
- **Build**: DuckDB `CREATE TABLE … AS SELECT FROM read_parquet(…)` plus views. Target: 1 GB of XML in single-digit minutes on the desktop — UNVERIFIED at the 10 GB end of the input range, where Python per-element overhead compounds; the build session should measure on the first real export before promising cadence.
- **Import strategy: rebuild, not merge.** Each run parses the new snapshot into a fresh `health.duckdb`, renames the previous one to `.bak`, and records an `export_manifest` row (export date, zip hash, **per-type** counts). Idempotent by construction; no merge logic to get wrong.
- **Shrinkage gate, with an escape hatch.** Exports CAN legitimately shrink — deleting a redundant source's data in Health (likely triggered by this very project spotting double-counts), uninstalling an app and purging its Health data, device migration. So the gate compares **per-type** counts against the previous manifest (total counts can mask a vanished type), reports the exact deltas, and aborts by default; `--accept-shrink` proceeds and records the acceptance in the manifest. Never a permanent block, never a silent one.

## 4. Schema (v1)

- `records` — type, source_name, source_version, device, unit, value_num (quantity types), value_text (category types like sleep stages), start_ts, end_ts, created_ts, metadata (JSON, only when present). One table for all ~100 types; type-specific views carve it up.
- `workouts` + `workout_statistics` (one row per statistic child) + `workout_events`.
- `activity_summaries` — the daily ring rows (move/exercise/stand), which is where daily activity totals come from WITHOUT sample-level double-counting.
- `export_manifest` — provenance per import.
- Skipped in v1 but **counted in the manifest** so nothing is silently ignored: `ClinicalRecord`, ECG waveforms, GPX routes, `<Correlation>` groupings (blood pressure lives here as nested Records — no BP device today; the parser must decide explicitly whether nested Records are captured flat or skipped with the group), and non-Metadata nested children like HRV beat-to-beat lists. Plus a catch-all unknown-element counter: a new element kind in a future iOS export shows up as a manifest number, not a silent drop.

**Cross-device duplication handled by views, not by mutation.** iPhone and Watch both write steps/energy; Health de-duplicates for display using source priority, and raw capture double-counts. The `records` table stays raw-first; `v_steps_daily` etc. implement the priority rule (prefer Watch over iPhone for overlapping intervals) so analysis reads the deduped view and audits can always reach the raw rows.

## 5. Workflow (Andy, ~5 min, monthly/quarterly)

1. Phone: Export All Health Data → AirDrop/iCloud the zip to the PC.
2. Drop into `health-lake/inbox/`.
3. `uv run health-lake ingest inbox/export-2026-07.zip` → parse, build, verify, manifest.
4. Ask me anything; I query `health.duckdb` directly. Cadence is forgiving: every export contains all history, so a skipped quarter loses nothing.

**The zips are retained** (moved to `health-lake/archive/`, not deleted): they are the archive of last resort — if the phone is lost, they are the only full-history copies that exist outside Apple's ecosystem. The `.bak` DuckDB keeps one prior generation; the zips keep all of them.

## 6. Verification

- Per-import: per-type manifest counts vs previous import (shrinkage gate above).
- Cross-pipe reconciliation: for overlapping windows, the lake and the hot path's `health.samples` observed the same source — but "must agree exactly" is the wrong bar, because legitimate divergence is the steady state (Withings syncing after the hot path's 3-day window closed, samples edited/deleted in Health after capture, data written post-window). The `reconcile` command therefore needs three things the naive version lacks: (a) a **normalization view layer** in v1 scope — the hot path stores normalized values (kg, %, minutes, `detail='core'`) while the export stores HealthKit-native units and strings (`HKCategoryValueSleepAnalysisAsleepCore`, spo2 possibly 0–1) and different source labels (`withings-via-health` vs `sourceName="Withings"`); (b) comparison on **UTC instants**, never day buckets (the AND-38 lesson); (c) a **drift taxonomy** — late-arrival / edited-after-capture / genuinely-missing — with only the last one alarming. Done that way it's a real verification asset instead of a cry-wolf report.
- Golden-sample tests: a small hand-built `export.xml` fixture exercising every element kind, the DTD-stripping wrapper, timezone offsets, category-vs-quantity values, nested Correlation/HRV children.

## 7. Joining with training data

DuckDB attaches the rest of the world: gym data enters via the app's CSV/JSON export (`read_csv`, known-good) or live via DuckDB's `postgres_scanner` against Supabase — the latter UNVERIFIED: Supabase direct connections are IPv6-first from a home Windows box and the pooler's compatibility with the DuckDB extension is an assumption, not a fact. If it fights back, the CSV export path already suffices. The holistic engine is then one SQL surface over lake + gym + hot path — Layer 2's analysis substrate (`LAYER2_PLAN.md`), fed locally instead of forcing everything through Postgres.

## 8. Options considered

| Option | Verdict |
| --- | --- |
| **Custom Python parser → Parquet → DuckDB** | **Chosen.** ~300 lines, full schema control, dedup-by-view, cross-pipe reconciliation built in |
| `healthkit-to-sqlite` (existing OSS, Simon Willison) | Proven and tempting; produces SQLite (DuckDB can attach it). Rejected as primary for schema control and the reconcile gate, but it is the documented fallback if the custom parser fights the XML longer than a day — pragmatism beats purity |
| DuckDB parsing the XML natively | No mature XML reader in DuckDB; dead end |
| Ship everything through the Shortcut/Supabase instead | Rejected in HEALTH_SYNC_PLAN section 13 (phone-side loop limits, no history backfill) |
| Postgres (Supabase) as the lake | Rejected: millions of rows of storage/egress for data with no always-on consumer; local analysis is the use case and DuckDB is built for exactly this shape |

## 9. Decisions resolved at plan time, and what stays open

**Resolved — timezone policy: store both.** Every timestamp column keeps the as-recorded value with its offset AND a derived UTC column. Reconciliation and joins compare UTC instants; local-day analysis (sleep dates, streaks) buckets on the as-recorded offset. This is required by §6, not optional — the AND-38 local-vs-UTC-day bug class is the most-repeated lesson in this codebase.

Open for the build session:

- Whether `ActivitySummary` daily totals fully remove the need for sample-level step/energy dedup views in v1 (probably yes — start with summaries, add dedup views on demand).
- The exact DTD-stripping wrapper implementation, proven against the golden fixture (§3 states the approach and the constraint: `recover=False`).
- uv vs plain venv; single-file script vs small package. Cosmetic; decide at scaffold time.
