// ingest-health: receiving dock for the on-phone `Health Sync` iOS Shortcut
// (docs/HEALTH_SYNC_PLAN.md). Deployed with verify_jwt=false; auth is a static
// bearer token compared inside public.health_ingest() against health.config,
// so this function holds no secrets of its own. All DB writes happen in that
// RPC, one transaction per batch; idempotency comes from the health.* unique
// keys. This function's job: HTTP guardrails, shape validation (reject the
// whole batch with reasons — a drifted Shortcut action should be loud, not
// half-ingested), and computing avg/max HR server-side to keep the Shortcut dumb.

import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_HR_POINTS_PER_WORKOUT = 20_000;
const SAMPLE_TYPES = new Set(["body_mass", "resting_hr", "hrv_sdnn", "sleep"]);

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

type HrPoint = { t: string; bpm: number };

interface Workout {
  source: string;
  workout_type: string;
  started_at: string;
  ended_at: string;
  active_energy_kcal: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  hr_series: HrPoint[] | null;
}

interface Sample {
  source: string;
  sample_type: string;
  measured_at: string;
  ended_at: string | null;
  value: number;
  detail: string | null;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Strict ISO 8601 with time and explicit offset (what Shortcuts' ISO format
// emits). JS Date.parse alone is looser than Postgres ::timestamptz ("2026"
// parses in JS, throws in SQL — an unlogged 500 instead of a loud 400), and
// offset-less strings would be interpreted in the function's timezone.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?([+-]\d{2}:?\d{2}|Z)$/;

function parseableDate(v: unknown): v is string {
  return typeof v === "string" && ISO_DATE_RE.test(v) && !Number.isNaN(Date.parse(v));
}

// Canonical UTC instant so the SQL casts can never disagree with JS parsing.
function toUtc(v: string): string {
  return new Date(v).toISOString();
}

function finiteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function validateWorkout(raw: unknown, i: number, errors: string[]): Workout | null {
  const at = `workouts[${i}]`;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    errors.push(`${at}: not an object`);
    return null;
  }
  const w = raw as Record<string, unknown>;
  const before = errors.length;

  if (!nonEmptyString(w.workout_type)) errors.push(`${at}.workout_type: required string`);
  if (!parseableDate(w.started_at)) errors.push(`${at}.started_at: not a parseable date`);
  if (!parseableDate(w.ended_at)) errors.push(`${at}.ended_at: not a parseable date`);
  if (
    parseableDate(w.started_at) && parseableDate(w.ended_at) &&
    Date.parse(w.ended_at) < Date.parse(w.started_at)
  ) {
    errors.push(`${at}: ended_at before started_at`);
  }
  if (w.active_energy_kcal != null && !finiteNumber(w.active_energy_kcal)) {
    errors.push(`${at}.active_energy_kcal: not a number`);
  }

  let hrSeries: HrPoint[] | null = null;
  if (w.hr_series != null) {
    if (!Array.isArray(w.hr_series)) {
      errors.push(`${at}.hr_series: not an array`);
    } else if (w.hr_series.length > MAX_HR_POINTS_PER_WORKOUT) {
      errors.push(`${at}.hr_series: ${w.hr_series.length} points exceeds cap of ${MAX_HR_POINTS_PER_WORKOUT}`);
    } else {
      hrSeries = [];
      for (let j = 0; j < w.hr_series.length; j++) {
        const p = w.hr_series[j] as Record<string, unknown>;
        if (typeof p !== "object" || p === null || !parseableDate(p.t) || !finiteNumber(p.bpm) || p.bpm <= 0) {
          errors.push(`${at}.hr_series[${j}]: expected {t: iso8601, bpm: positive number}`);
          break;
        }
        hrSeries.push({ t: toUtc(p.t as string), bpm: p.bpm as number });
      }
    }
  }
  if (errors.length > before) return null;

  let avgHr: number | null = null;
  let maxHr: number | null = null;
  if (hrSeries && hrSeries.length > 0) {
    const bpms = hrSeries.map((p) => p.bpm);
    avgHr = Math.round((bpms.reduce((a, b) => a + b, 0) / bpms.length) * 10) / 10;
    maxHr = Math.max(...bpms);
  }

  return {
    source: nonEmptyString(w.source) ? w.source.trim() : "apple-watch-shortcut",
    workout_type: (w.workout_type as string).trim(),
    started_at: toUtc(w.started_at as string),
    ended_at: toUtc(w.ended_at as string),
    active_energy_kcal: w.active_energy_kcal == null ? null : (w.active_energy_kcal as number),
    avg_hr: avgHr,
    max_hr: maxHr,
    hr_series: hrSeries,
  };
}

function validateSample(raw: unknown, i: number, errors: string[]): Sample | null {
  const at = `samples[${i}]`;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    errors.push(`${at}: not an object`);
    return null;
  }
  const s = raw as Record<string, unknown>;
  const before = errors.length;

  if (!nonEmptyString(s.sample_type) || !SAMPLE_TYPES.has(s.sample_type as string)) {
    errors.push(`${at}.sample_type: expected one of ${[...SAMPLE_TYPES].join(", ")}`);
  }
  if (!parseableDate(s.measured_at)) errors.push(`${at}.measured_at: not a parseable date`);
  if (!finiteNumber(s.value) || (s.value as number) < 0) errors.push(`${at}.value: not a non-negative number`);
  if (s.ended_at != null && !parseableDate(s.ended_at)) errors.push(`${at}.ended_at: not a parseable date`);
  if (s.detail != null && typeof s.detail !== "string") errors.push(`${at}.detail: not a string`);
  if (errors.length > before) return null;

  const defaultSource = s.sample_type === "body_mass" ? "withings-via-health" : "apple-watch-shortcut";
  return {
    source: nonEmptyString(s.source) ? s.source.trim() : defaultSource,
    sample_type: s.sample_type as string,
    measured_at: toUtc(s.measured_at as string),
    ended_at: s.ended_at == null ? null : toUtc(s.ended_at as string),
    value: s.value as number,
    detail: s.detail == null ? null : (s.detail as string),
  };
}

async function callIngest(token: string, batch: Record<string, unknown>): Promise<Response> {
  const { data, error } = await supabase.rpc("health_ingest", {
    p_token: token,
    p_batch: batch,
  });
  if (error) {
    console.error("health_ingest rpc failed:", error.message);
    return json(500, { ok: false, error: "ingest failed" });
  }
  if (data?.ok !== true) {
    if (data?.error === "unauthorized") return json(401, { ok: false, error: "unauthorized" });
    console.error("health_ingest rejected:", data?.error);
    return json(500, { ok: false, error: data?.error ?? "ingest failed" });
  }
  return json(200, data);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "POST only" });

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return json(401, { ok: false, error: "unauthorized" });

  // Read before any 413: the gateway won't deliver a response written while
  // the request body is still unconsumed (curl hangs awaiting the reply).
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return json(413, { ok: false, error: "payload too large" });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    // Log the rejected batch (token permitting) so shape drift shows in ingest_log.
    const logged = await callIngest(token, { batch_kind: "manual", rejected: 1 });
    if (logged.status === 401) return logged;
    return json(400, { ok: false, error: "invalid JSON" });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return json(400, { ok: false, error: "body must be a JSON object" });
  }

  const errors: string[] = [];
  const batchKind = body.batch_kind === "daily" ? "daily" : "manual";

  const rawWorkouts = body.workouts == null ? [] : body.workouts;
  const rawSamples = body.samples == null ? [] : body.samples;
  if (!Array.isArray(rawWorkouts)) errors.push("workouts: not an array");
  if (!Array.isArray(rawSamples)) errors.push("samples: not an array");

  let rejected = 0;
  const workouts: Workout[] = [];
  const samples: Sample[] = [];
  if (Array.isArray(rawWorkouts)) {
    rawWorkouts.forEach((w, i) => {
      const valid = validateWorkout(w, i, errors);
      if (valid) workouts.push(valid);
      else rejected++;
    });
  }
  if (Array.isArray(rawSamples)) {
    rawSamples.forEach((s, i) => {
      const valid = validateSample(s, i, errors);
      if (valid) samples.push(valid);
      else rejected++;
    });
  }

  if (errors.length > 0) {
    const logged = await callIngest(token, {
      batch_kind: batchKind,
      rejected: Math.max(rejected, 1),
    });
    if (logged.status === 401) return logged;
    return json(400, { ok: false, error: "invalid batch", reasons: errors.slice(0, 10) });
  }

  return await callIngest(token, {
    batch_kind: batchKind,
    workouts: workouts as unknown as Record<string, unknown>[],
    samples: samples as unknown as Record<string, unknown>[],
    rejected: 0,
  });
});
