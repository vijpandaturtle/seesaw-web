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

import { STATUS, type Job } from "./types";

export { STAGES, STATUS, completedStages, type Job } from "./types";

const connectionString =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "";

/**
 * The jobs table, schema-qualified when SEESAW_DB_SCHEMA is set — the same
 * variable the Python side reads, so both can be pointed at an isolated copy
 * of the store (seesaw's tests, a local trial run) without touching the live
 * table. Qualified per statement rather than via search_path, which a pooled
 * endpoint doesn't reliably keep (see shared/db/jobs.py).
 */
const SCHEMA = process.env.SEESAW_DB_SCHEMA ?? "";
if (SCHEMA && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(SCHEMA)) {
  throw new Error(`SEESAW_DB_SCHEMA=${SCHEMA} is not a plain identifier`);
}
const JOBS = SCHEMA ? `"${SCHEMA}".jobs` : "jobs";

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

/** Runs `sql` with "jobs" pointed at the configured table. */
async function run(sql: string, params: unknown[] = []) {
  return db().query(sql.replace(/\bjobs\b/g, JOBS), params);
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
 * params for Scout to start its plan from; Scout picks the inputs.
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
): Promise<Job> {
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const ts = now();
  const params = pathway ? JSON.stringify({ pathway }) : null;
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
  await query("DELETE FROM jobs WHERE id = $1", [id]);
}
