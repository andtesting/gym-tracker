---
name: health-check
description: Use after any change to the ingest-health edge function or health schema, and for the weekly pipeline health check once daily Shortcut ingests are live. Runs the curl fixture suite, cleans up fixture rows, and inspects ingest_log for gaps and drift.
---

# Health pipeline check

## After changing the function or schema

1. Redeploy via Supabase MCP (`deploy_edge_function`, `verify_jwt: false` — auth is the bearer token inside the RPC).
2. Run the suite: `powershell -File docs/fixtures/health-ingest/run.ps1` — expects 7/7. Token comes from `.secrets.local.json` `health_ingest_token`; without it only the 3 auth-independent tests run.
3. Verify every sample type landed: `select sample_type, count(*) from health.samples where source = 'curl-fixture' group by 1;`
4. **Always clean up** (fixture rows land in live tables):

   ```sql
   delete from health.workouts where source = 'curl-fixture';
   delete from health.samples  where source = 'curl-fixture';
   delete from health.ingest_log;  -- ONLY if all log rows are fixture batches — check first when real ingests exist
   ```

## Weekly, once the 09:00 automation is live

```sql
select batch_kind, received_at, counts from health.ingest_log order by received_at desc limit 10;
-- gaps = Shortcut didn't run (next run's 3-day window self-heals); rejected > 0 = shape drift, check the phone notification
select max(measured_at) as last_weight from health.samples where sample_type = 'body_mass';
-- stale weight = Withings didn't sync to Health; opening the Withings app forces the write
```

First-real-run extras: spo2 values must read ~97 not ~0.97 (HealthKit fraction quirk — recipe section 3 has the fix), and counts should roughly match the Health app for the same window.

## Contract reminders

- The accepted sample-type set lives ONLY in the function's `SAMPLE_TYPES` (index.ts); schema is deliberately unconstrained. High-volume types (all-day HR, steps, active energy) belong to the bulk path (docs/HEALTH_LAKE_PLAN.md), never this pipeline.
- Token rotation: `update health.config set value = translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_'), updated_at = now() where key = 'INGEST_TOKEN';` then re-paste into the Shortcut and `.secrets.local.json`. The token never appears in transcripts or files other than those two places.
