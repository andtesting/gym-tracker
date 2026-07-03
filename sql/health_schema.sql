-- Layer 2 health schema (docs/HEALTH_SYNC_PLAN.md). Landing zone for Apple
-- Health data extracted by the on-phone `Health Sync` iOS Shortcut and POSTed
-- to the `ingest-health` edge function.
--
-- Mirrored in sql/migrations/2026-07-03-health-schema.sql (the copy applied to
-- the live DB). Every statement is guarded; re-running this file is a no-op.
--
-- Write path: ONLY the edge function, via public.health_ingest() (security
-- definer, execute granted to service_role alone). The PWA never writes
-- health data. Read path: owner-only RLS select policies (the schema is not
-- exposed through PostgREST yet; policies are in place for when it is).
--
-- health.config replaces edge-function secrets: setting real function secrets
-- needs the Supabase CLI or dashboard, neither scriptable from this repo's
-- MCP setup, and a service-role-only table makes rotation a one-line update.
-- Seed it out-of-band after applying (values are secrets, never committed):
--   insert into health.config (key, value) values
--     ('INGEST_TOKEN',  '<32-byte base64url token>'),
--     ('OWNER_USER_ID', '<auth.users.id the pipeline writes as>');

create schema if not exists health;

create table if not exists health.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,                        -- 'apple-watch-shortcut'
  workout_type text not null,                  -- Shortcuts' workout type string
  started_at timestamptz not null,
  ended_at timestamptz not null,
  active_energy_kcal numeric,
  avg_hr numeric,                              -- computed server-side from hr_series
  max_hr numeric,
  hr_series jsonb,                             -- [{"t": iso8601, "bpm": n}, ...]
  created_at timestamptz default now(),
  unique (user_id, source, started_at)
);

create table if not exists health.samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
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
  user_id uuid not null references auth.users(id) on delete cascade,
  received_at timestamptz default now(),
  batch_kind text not null,                    -- 'daily' | 'manual'
  counts jsonb not null                        -- {"workouts": 2, "samples": 41, "rejected": 0, ...}
);

create table if not exists health.config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table health.workouts enable row level security;
alter table health.samples enable row level security;
alter table health.ingest_log enable row level security;
-- config: RLS on, NO policies, deliberately. Only the service role (which
-- bypasses RLS) and security-definer functions can read the ingest token.
alter table health.config enable row level security;

do $$ begin
  create policy "own health workouts" on health.workouts for select
    using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "own health samples" on health.samples for select
    using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "own health ingest_log" on health.ingest_log for select
    using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

create index if not exists idx_health_workouts_user_started on health.workouts (user_id, started_at desc);
create index if not exists idx_health_samples_user_type_measured on health.samples (user_id, sample_type, measured_at desc);
create index if not exists idx_health_ingest_log_received on health.ingest_log (received_at desc);

-- Ingestion RPC. Lives in public (PostgREST only serves exposed schemas, and
-- health is not exposed); execute is locked to service_role, so the only
-- caller is the ingest-health edge function. Auth = token compare against
-- health.config; one transaction per batch; idempotency via the two unique
-- constraints ("*_new" counts distinguish inserts from re-delivered rows).
create or replace function public.health_ingest(p_token text, p_batch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected text;
  v_owner uuid;
  w jsonb;
  s jsonb;
  v_workouts int := 0;
  v_workouts_new int := 0;
  v_samples int := 0;
  v_samples_new int := 0;
  v_rejected int;
  v_inserted boolean;
  v_counts jsonb;
begin
  select value into v_expected from health.config where key = 'INGEST_TOKEN';
  if v_expected is null or p_token is distinct from v_expected then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select value::uuid into v_owner from health.config where key = 'OWNER_USER_ID';
  if v_owner is null then
    return jsonb_build_object('ok', false, 'error', 'misconfigured: OWNER_USER_ID missing');
  end if;

  v_rejected := coalesce((p_batch->>'rejected')::int, 0);

  -- Duplicate keys WITHIN one batch: separate INSERTs, so the second upserts
  -- over the first (last write wins) and the plain counts overstate distinct
  -- rows; *_new counts stay honest. Acceptable at n=1.
  for w in select * from jsonb_array_elements(coalesce(p_batch->'workouts', '[]'::jsonb)) loop
    insert into health.workouts
      (user_id, source, workout_type, started_at, ended_at, active_energy_kcal, avg_hr, max_hr, hr_series)
    values (
      v_owner,
      coalesce(w->>'source', 'apple-watch-shortcut'),
      w->>'workout_type',
      (w->>'started_at')::timestamptz,
      (w->>'ended_at')::timestamptz,
      (w->>'active_energy_kcal')::numeric,
      (w->>'avg_hr')::numeric,
      (w->>'max_hr')::numeric,
      nullif(w->'hr_series', 'null'::jsonb)   -- JSON null would defeat `hr_series is null` reads
    )
    on conflict (user_id, source, started_at) do update set
      workout_type = excluded.workout_type,
      ended_at = excluded.ended_at,
      active_energy_kcal = excluded.active_energy_kcal,
      avg_hr = excluded.avg_hr,
      max_hr = excluded.max_hr,
      hr_series = excluded.hr_series
    returning (xmax = 0) into v_inserted;
    v_workouts := v_workouts + 1;
    if v_inserted then v_workouts_new := v_workouts_new + 1; end if;
  end loop;

  for s in select * from jsonb_array_elements(coalesce(p_batch->'samples', '[]'::jsonb)) loop
    insert into health.samples
      (user_id, source, sample_type, measured_at, ended_at, value, detail)
    values (
      v_owner,
      coalesce(s->>'source', 'apple-watch-shortcut'),
      s->>'sample_type',
      (s->>'measured_at')::timestamptz,
      (s->>'ended_at')::timestamptz,
      (s->>'value')::numeric,
      s->>'detail'
    )
    on conflict (user_id, source, sample_type, measured_at) do update set
      ended_at = excluded.ended_at,
      value = excluded.value,
      detail = excluded.detail
    returning (xmax = 0) into v_inserted;
    v_samples := v_samples + 1;
    if v_inserted then v_samples_new := v_samples_new + 1; end if;
  end loop;

  v_counts := jsonb_build_object(
    'workouts', v_workouts, 'workouts_new', v_workouts_new,
    'samples', v_samples, 'samples_new', v_samples_new,
    'rejected', v_rejected
  );

  insert into health.ingest_log (user_id, batch_kind, counts)
  values (v_owner, coalesce(p_batch->>'batch_kind', 'manual'), v_counts);

  return jsonb_build_object('ok', true, 'counts', v_counts);
end;
$$;

revoke execute on function public.health_ingest(text, jsonb) from public, anon, authenticated;
grant execute on function public.health_ingest(text, jsonb) to service_role;
