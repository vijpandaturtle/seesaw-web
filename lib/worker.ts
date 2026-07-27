/**
 * Starting a worker for a job, when this app runs alongside the agents.
 *
 * Deployed away from the Python side there is nothing to spawn, and jobs are
 * picked up by `python -m orchestrator.src.worker --poll` instead. Locally
 * that second terminal is a nuisance, so setting SEESAW_REPO_DIR lets the API
 * launch a worker per job directly.
 *
 * Both modes write the same rows; this only decides who starts the process.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type RunnerMode = "local" | "queued";

/** Path to the seesaw checkout, if we've been told where it is. */
function repoDir(): string | null {
  const dir = process.env.SEESAW_REPO_DIR;
  if (!dir) return null;
  const resolved = path.resolve(dir);
  return fs.existsSync(path.join(resolved, "orchestrator")) ? resolved : null;
}

/** Interpreter to run the worker with — the checkout's venv by default. */
function pythonBin(repo: string): string {
  if (process.env.SEESAW_PYTHON) return path.resolve(process.env.SEESAW_PYTHON);
  const venv = path.join(repo, ".venv", "bin", "python");
  return fs.existsSync(venv) ? venv : "python3";
}

export function runnerMode(): RunnerMode {
  return repoDir() ? "local" : "queued";
}

/**
 * Launch a detached worker for one job.
 *
 * Output goes to the job's log file, the same place the Python side writes it,
 * so the log tab reads identically however the worker was started.
 *
 * Returns false when there's nothing to spawn — that's the deployed case, not
 * an error: the row is queued and a poller will claim it.
 */
export function startWorker(jobId: string): boolean {
  const repo = repoDir();
  if (!repo) return false;

  const outputs =
    process.env.SEESAW_OUTPUTS_DIR ?? path.join(repo, "outputs");
  const logsDir = path.join(outputs, "job_logs");
  fs.mkdirSync(logsDir, { recursive: true });
  const log = fs.openSync(path.join(logsDir, `${jobId}.log`), "a");

  try {
    const child = spawn(
      pythonBin(repo),
      ["-u", "-m", "orchestrator.src.worker", jobId],
      {
        cwd: repo,
        detached: true,      // outlives this request, and the dev server
        stdio: ["ignore", log, log],
        env: { ...process.env },
      },
    );
    child.unref();
    return true;
  } catch {
    return false;           // fall back to queued; a poller can still take it
  } finally {
    fs.closeSync(log);
  }
}
