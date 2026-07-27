/**
 * Every query against the job store lives here.
 *
 * This is the swap point for deployment: today it opens the SQLite file the
 * Python workers write (shared/db/jobs.py in the seesaw repo), which only
 * works while this app and the workers share a host. Moving to Turso or
 * Postgres means rewriting this module and nothing else — routes and
 * components never touch a driver.
 *
 * Paths come from the environment because this app lives in its own repo and
 * can't assume where seesaw is checked out. See .env.example.
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

import { STAGES, STATUS, type Job, type Stage } from "./types";

export { STAGES, STATUS, type Job } from "./types";

/** Where the Python side writes plans, bundles, critiques, and plots. */
export const OUTPUTS_DIR = path.resolve(
  process.env.SEESAW_OUTPUTS_DIR ??
    path.join(process.cwd(), "..", "seesaw", "outputs"),
);

const DB_PATH = path.resolve(
  process.env.SEESAW_DB_PATH ?? path.join(OUTPUTS_DIR, "jobs.db"),
);

let handle: Database.Database | null = null;

function db(): Database.Database {
  if (!handle) {
    if (!fs.existsSync(DB_PATH)) {
      throw new Error(
        `No job store at ${DB_PATH}. Point SEESAW_DB_PATH and SEESAW_OUTPUTS_DIR ` +
          `at your seesaw checkout — see .env.example. The file is created the ` +
          `first time the Python side runs a job.`,
      );
    }
    handle = new Database(DB_PATH);
    // Workers hold write locks while a stage runs; wait rather than throw.
    handle.pragma("busy_timeout = 5000");
  }
  return handle;
}

/** Seconds since the epoch — Python writes time.time(), so match it. */
function now(): number {
  return Date.now() / 1000;
}

export function listJobs(limit = 100): Job[] {
  return db()
    .prepare("SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?")
    .all(limit) as Job[];
}

export function getJob(id: string): Job | null {
  const row = db().prepare("SELECT * FROM jobs WHERE id = ?").get(id);
  return (row as Job) ?? null;
}

export function createJob(
  question: string,
  model: string,
  autoApprove: boolean,
): Job {
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const ts = now();
  db()
    .prepare(
      `INSERT INTO jobs (id, question, model, status, stage, auto_approve, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'scout', ?, ?, ?)`,
    )
    .run(id, question.trim(), model, STATUS.QUEUED, autoApprove ? 1 : 0, ts, ts);
  return getJob(id)!;
}

/**
 * Clear the human gate. Guarded on the current status so a stale button click
 * can't re-queue a job a worker is already running.
 */
export function approveJob(id: string): boolean {
  const res = db()
    .prepare(
      "UPDATE jobs SET status = ?, error = NULL, updated_at = ? WHERE id = ? AND status = ?",
    )
    .run(STATUS.QUEUED, now(), id, STATUS.AWAITING);
  return res.changes > 0;
}

/** Retry a failed stage — same stage, back to queued for a worker to claim. */
export function retryJob(id: string): boolean {
  const res = db()
    .prepare(
      "UPDATE jobs SET status = ?, error = NULL, updated_at = ? WHERE id = ? AND status = ?",
    )
    .run(STATUS.QUEUED, now(), id, STATUS.FAILED);
  return res.changes > 0;
}

/**
 * Ask a job to stop. Sets the flag the worker checks between stages; we can't
 * signal the process because it may not be on this host.
 */
export function cancelJob(id: string): void {
  db()
    .prepare(
      "UPDATE jobs SET cancel_requested = 1, status = ?, pid = NULL, updated_at = ? WHERE id = ?",
    )
    .run(STATUS.CANCELLED, now(), id);
}

export function deleteJob(id: string): void {
  db().prepare("DELETE FROM jobs WHERE id = ?").run(id);
}
