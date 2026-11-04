/**
 * Every query against the job store lives here.
 *
 * Postgres, shared with the Python side (shared/db/jobs.py) — the two write
 * the same table, which is what lets this app be deployed away from the
 * machines that run the agents.
 *
 * A module-level pool is deliberate: serverless functions reuse the module
 * between warm invocations, so connections are reused rather than opened per
 * request. Against a hosted database that's the difference between a snappy
 * dashboard and a several-second one.
 */
import { Pool } from "pg";

import { pathwayByName } from "./pathways";
import { STATUS, jobParams, rerunnable, type Job, type JobEvent } from "./types";

export { STAGES, STATUS, completedStages, type Job, type JobEvent } from "./types";

const connectionString =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "";

/**
 * The jobs (and job_events) tables, schema-qualified when SEESAW_DB_SCHEMA is set — the same
 * variable the Python side reads, so both can be pointed at an isolated copy
 * of the store (seesaw's tests, a local trial run) without touching the live
 * table. Qualified per statement rather than via search_path, which a pooled
 * endpoint doesn't reliably keep (see shared/db/jobs.py).
 */
const SCHEMA = process.env.SEESAW_DB_SCHEMA ?? "";
if (SCHEMA && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(SCHEMA)) {
  throw new Error(`SEESAW_DB_SCHEMA=${SCHEMA} is not a plain identifier`);
}
const table = (name: string) => (SCHEMA ? `"${SCHEMA}".${name}` : name);

let pool: Pool | null = null;

function db(): Pool {
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. The dashboard reads the job store the Python " +
        "workers write; see .env.example.",
    );
  }
  pool ??= new Pool({
    connectionString,
    max: 5,
    // Neon terminates idle connections; don't hold them long in serverless.
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  return pool;
}

/** Seconds since the epoch — Python writes time.time(), so match it. */
function now(): number {
  return Date.now() / 1000;
}

/** Runs `sql` with "jobs" and "job_events" pointed at the configured tables. */
async function run(sql: string, params: unknown[] = []) {
  return db().query(sql.replace(/\b(jobs|job_events)\b/g, table), params);
}

async function query<T = Job>(sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await run(sql, params);
  return result.rows as T[];
}

export async function listJobs(limit = 100): Promise<Job[]> {
  return query("SELECT * FROM jobs ORDER BY created_at DESC LIMIT $1", [limit]);
}

export async function getJob(id: string): Promise<Job | null> {
  const rows = await query("SELECT * FROM jobs WHERE id = $1", [id]);
  return rows[0] ?? null;
}

/**
 * Insert a queued research job at Scout. A pathway, if given, is stored in
 * params for Scout to start its plan from; Scout picks the inputs. "auto"
 * has Scout choose the pathway (or none). `search` turns on Scout's
 * literature search; seesaw's jobs.create takes only these two keys.
 *
 * The kind and params columns are added by the Python side, which owns the
 * table's schema; on a store no current worker has opened yet, this insert
 * fails and the API says to start one.
 */
export async function createJob(
  question: string,
  model: string,
  autoApprove: boolean,
  pathway?: string,
  search = false,
): Promise<Job> {
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const ts = now();
  const fields = { ...(pathway && { pathway }), ...(search && { search: true }) };
  const params = Object.keys(fields).length ? JSON.stringify(fields) : null;
  await query(
    `INSERT INTO jobs (id, question, model, status, stage, auto_approve,
                       created_at, updated_at, kind, params)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [id, question.trim(), model, STATUS.QUEUED, "scout", autoApprove ? 1 : 0,
     ts, ts, "research", params],
  );
  return (await getJob(id))!;
}

/**
 * A new job that runs a job's pathway again on its approved inputs, queued at
 * Lens with the source's plan (seesaw's jobs.rerun does the same). Scout never
 * runs again, so the same pathway, model and inputs give the same verdict.
 *
 * Only the inputs' shape is known here; whether each answer is one token for
 * a new model needs its tokenizer, so the worker checks that when Lens starts.
 */
export async function rerunJob(
  id: string,
  model: string | undefined,
  autoApprove: boolean,
): Promise<{ job: Job } | { error: string }> {
  const source = await getJob(id);
  if (!source) return { error: "not found" };
  const params = jobParams(source);
  const name = params.pathway as string | undefined;
  if (!rerunnable(source) || !name) {
    return { error: "this job has no approved pathway inputs to rerun" };
  }
  const target = model || source.model;
  const allowed = pathwayByName(name)?.models;
  if (allowed && !allowed.includes(target)) {
    return { error: `${name} only runs on ${allowed.join(", ")}, not ${target}` };
  }

  const newId = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const ts = now();
  await query(
    `INSERT INTO jobs (id, question, model, status, stage, auto_approve, plan_path,
                       created_at, updated_at, kind, params)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [newId, source.question, target, STATUS.QUEUED, "lens", autoApprove ? 1 : 0,
     source.plan_path, ts, ts, "research",
     JSON.stringify({ pathway: name, pathway_params: params.pathway_params, rerun_of: source.id })],
  );
  return { job: (await getJob(newId))! };
}

/**
 * Clear the human gate. Guarded on the current status inside the UPDATE, so a
 * click on a stale page can't re-queue something a worker already holds.
 */
export async function approveJob(id: string): Promise<boolean> {
  const result = await run(
    "UPDATE jobs SET status = $1, error = NULL, updated_at = $2 WHERE id = $3 AND status = $4",
    [STATUS.QUEUED, now(), id, STATUS.AWAITING],
  );
  return (result.rowCount ?? 0) > 0;
}

/** Retry a failed stage — same stage, back to queued for a worker to claim. */
export async function retryJob(id: string): Promise<boolean> {
  const result = await run(
    "UPDATE jobs SET status = $1, error = NULL, updated_at = $2 WHERE id = $3 AND status = $4",
    [STATUS.QUEUED, now(), id, STATUS.FAILED],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Ask a job to stop. A flag rather than a signal: the worker is on another
 * machine entirely, so there's no process here to interrupt.
 */
export async function cancelJob(id: string): Promise<void> {
  await query(
    "UPDATE jobs SET cancel_requested = 1, status = $1, pid = NULL, updated_at = $2 WHERE id = $3",
    [STATUS.CANCELLED, now(), id],
  );
}

export async function deleteJob(id: string): Promise<void> {
  await missingTableIsEmpty(query("DELETE FROM job_events WHERE job_id = $1", [id]), []);
  await query("DELETE FROM jobs WHERE id = $1", [id]);
}

/**
 * A job's agent trace, oldest first, without each event's `data` (the dashboard
 * polls this while the job runs; getEvent fetches one event's data).
 *
 * The table is created by the Python side the first time a current worker
 * opens the store; before that there is no trace, so this returns null.
 */
export async function listEvents(jobId: string): Promise<JobEvent[] | null> {
  const rows = await missingTableIsEmpty(
    query<JobEvent>(
      `SELECT id, parent_id, ts, stage, kind, name, status, duration_ms, summary
         FROM job_events WHERE job_id = $1 ORDER BY id LIMIT 5000`,
      [jobId],
    ),
    null,
  );
  return rows && rows.map(normalizeEvent);
}

export async function getEvent(jobId: string, eventId: number): Promise<JobEvent | null> {
  const rows = await missingTableIsEmpty(
    query<JobEvent & { data: string | null }>(
      "SELECT * FROM job_events WHERE job_id = $1 AND id = $2",
      [jobId, eventId],
    ),
    [],
  );
  const row = rows?.[0];
  if (!row) return null;
  let data: Record<string, unknown> | null = null;
  try {
    data = row.data ? JSON.parse(row.data) : null;
  } catch {
    data = { unparsed: row.data };
  }
  return { ...normalizeEvent(row), data };
}

/** BIGSERIAL ids arrive as strings from pg; the page wants numbers. */
function normalizeEvent<T extends JobEvent>(row: T): T {
  return {
    ...row,
    id: Number(row.id),
    parent_id: row.parent_id == null ? null : Number(row.parent_id),
  };
}

/** Postgres's "undefined_table": a store no current worker has opened yet. */
async function missingTableIsEmpty<T, F>(pending: Promise<T>, fallback: F): Promise<T | F> {
  try {
    return await pending;
  } catch (error) {
    if ((error as { code?: string }).code === "42P01") return fallback;
    throw error;
  }
}
