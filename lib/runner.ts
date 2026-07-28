/**
 * Starting a stage, and finding what it produced.
 *
 * Three ways a job can be executed, picked by configuration:
 *
 *   MODAL_RUN_STAGE_URL  a deployed Modal function, spawned per stage. This is
 *                        production — the call returns immediately while the
 *                        stage runs for minutes, which is why a serverless
 *                        dashboard can drive hour-long work.
 *   SEESAW_REPO_DIR      a local worker process (see lib/worker.ts).
 *   neither              queue-only; something else has to claim the row.
 */
import { runnerMode as localRunnerMode, startWorker } from "./worker";

export type RunnerMode = "modal" | "local" | "queued";

const MODAL_URL = process.env.MODAL_RUN_STAGE_URL ?? "";
const MODAL_TOKEN = process.env.MODAL_INVOKE_TOKEN ?? "";

/** Base URL of the Modal artifact endpoint, when artifacts live on a volume. */
export const ARTIFACT_BASE_URL = process.env.MODAL_ARTIFACT_URL ?? "";

export function runnerMode(): RunnerMode {
  if (MODAL_URL) return "modal";
  return localRunnerMode() === "local" ? "local" : "queued";
}

/**
 * Ask the configured runner to pick this job up.
 *
 * Never throws: a runner that's down should leave the row queued for a retry,
 * not fail the request that created it.
 */
export async function startStage(jobId: string): Promise<boolean> {
  if (!MODAL_URL) return startWorker(jobId);

  try {
    const response = await fetch(MODAL_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ job_id: jobId, key: MODAL_TOKEN }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
