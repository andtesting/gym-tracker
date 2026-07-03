# Health ingest curl fixtures

Test suite for the `ingest-health` edge function (docs/HEALTH_SYNC_PLAN.md, section 9). Run before pointing the phone-side Shortcut at the endpoint.

```powershell
powershell -File docs/fixtures/health-ingest/run.ps1
```

| Test | Fixture | Expected |
| --- | --- | --- |
| GET method | none | 405 |
| Wrong bearer token | inline | 401 |
| Oversized payload (6 MB, generated at runtime) | none | 413 |
| Valid daily batch | `valid-daily.json` | 200, `counts` with `rejected: 0` |
| Duplicate resend of the same batch | `valid-daily.json` | 200, `workouts_new: 0`, `samples_new: 0` (idempotent upsert) |
| Malformed batch (bad `sample_type`, non-numeric `value`, workout missing `ended_at`) | `malformed-sample.json` | 400 with `reasons`; batch rejected whole, `rejected` count logged to `health.ingest_log` |

The last three need the real token in `.secrets.local.json` (`health_ingest_token`); fetch it once from the Supabase SQL Editor:

```sql
select value from health.config where key = 'INGEST_TOKEN';
```

Fixture rows land in the live `health.*` tables tagged `source = 'curl-fixture'`. Cleanup:

```sql
delete from health.workouts where source = 'curl-fixture';
delete from health.samples  where source = 'curl-fixture';
delete from health.ingest_log;
```

Status 2026-07-04: full suite run against the deployed function with the real token — 7/7 passed (including valid batch, idempotent resend with `*_new: 0`, and malformed 400). Fixture rows cleaned up afterwards; `health.*` tables left empty for the first real Shortcut sync.
