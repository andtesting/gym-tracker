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

- **Parser**: Python + `lxml.etree.iterparse` with `elem.clear()` after each element — constant memory regardless of file size, DTD ignored (`load_dtd=False`, `recover=True`). Reads `export.xml` directly out of the zip (no 10 GB extraction to disk).
- **Staging**: batches of ~100k elements → Arrow RecordBatch → Parquet part-files per element kind (`records/part-*.parquet`, `workouts/…`, `activity_summaries/…`). Staging survives independently of the DB: re-deriving the DuckDB schema never re-parses XML.
- **Build**: DuckDB `CREATE TABLE … AS SELECT FROM read_parquet(…)` plus views. Target: 1 GB of XML in single-digit minutes on the desktop.
- **Import strategy: rebuild, not merge.** Each run parses the new snapshot into a fresh `health.duckdb`, renames the previous one to `.bak`, and records an `export_manifest` row (export date, zip hash, per-table counts). Idempotent by construction; no merge logic to get wrong. Sanity gate: counts must be ≥ previous import's counts minus a small tolerance, else abort loudly (a shrunken export means a bad export, not deleted history).

## 4. Schema (v1)

- `records` — type, source_name, source_version, device, unit, value_num (quantity types), value_text (category types like sleep stages), start_ts, end_ts, created_ts, metadata (JSON, only when present). One table for all ~100 types; type-specific views carve it up.
- `workouts` + `workout_statistics` (one row per statistic child) + `workout_events`.
- `activity_summaries` — the daily ring rows (move/exercise/stand), which is where daily activity totals come from WITHOUT sample-level double-counting.
- `export_manifest` — provenance per import.
- Skipped in v1: `ClinicalRecord`, ECG waveforms, GPX routes (cataloged in the manifest so nothing is silently ignored).

**Cross-device duplication handled by views, not by mutation.** iPhone and Watch both write steps/energy; Health de-duplicates for display using source priority, and raw capture double-counts. The `records` table stays raw-first; `v_steps_daily` etc. implement the priority rule (prefer Watch over iPhone for overlapping intervals) so analysis reads the deduped view and audits can always reach the raw rows.

## 5. Workflow (Andy, ~5 min, monthly/quarterly)

1. Phone: Export All Health Data → AirDrop/iCloud the zip to the PC.
2. Drop into `health-lake/inbox/`.
3. `uv run health-lake ingest inbox/export-2026-07.zip` → parse, build, verify, manifest.
4. Ask me anything; I query `health.duckdb` directly. Cadence is forgiving: every export contains all history, so a skipped quarter loses nothing.

## 6. Verification

- Per-import: manifest counts vs previous import (monotonic growth gate above).
- Cross-pipe reconciliation — the design's best trick: for any overlapping window, the lake's records must agree with the hot path's `health.samples` (weight, resting HR, HRV…). Two independent pipelines from the same source; disagreement means one of them is wrong. A `reconcile` command compares a 30-day window and reports drift.
- Golden-sample tests: a small hand-built `export.xml` fixture exercising every element kind, DTD weirdness, timezone offsets, category-vs-quantity values.

## 7. Joining with training data

DuckDB attaches the rest of the world: gym data enters either via the app's CSV/JSON export (`read_csv`) or live via DuckDB's `postgres_scanner` against Supabase. The holistic engine is then one SQL surface over lake + gym + hot path — which is Layer 2's analysis substrate (`LAYER2_PLAN.md`), fed locally instead of forcing everything through Postgres.

## 8. Options considered

| Option | Verdict |
| --- | --- |
| **Custom Python parser → Parquet → DuckDB** | **Chosen.** ~300 lines, full schema control, dedup-by-view, cross-pipe reconciliation built in |
| `healthkit-to-sqlite` (existing OSS, Simon Willison) | Proven and tempting; produces SQLite (DuckDB can attach it). Rejected as primary for schema control and the reconcile gate, but it is the documented fallback if the custom parser fights the XML longer than a day — pragmatism beats purity |
| DuckDB parsing the XML natively | No mature XML reader in DuckDB; dead end |
| Ship everything through the Shortcut/Supabase instead | Rejected in HEALTH_SYNC_PLAN section 13 (phone-side loop limits, no history backfill) |
| Postgres (Supabase) as the lake | Rejected: millions of rows of storage/egress for data with no always-on consumer; local analysis is the use case and DuckDB is built for exactly this shape |

## 9. Open questions for the build session

- Timezone policy: store timestamps as recorded (with offset) AND a UTC column, or UTC-only? Leaning both — the AND-38 lesson says local-day bucketing bugs are real.
- Whether `ActivitySummary` daily totals fully remove the need for sample-level step/energy dedup views in v1 (probably yes — start with summaries, add dedup views on demand).
- uv vs plain venv; single-file script vs small package. Cosmetic; decide at scaffold time.
