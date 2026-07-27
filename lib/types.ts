/**
 * Shapes and constants shared by client and server.
 *
 * Kept out of lib/db.ts on purpose: that module loads a native SQLite driver,
 * and a client component importing a value from it would pull the driver into
 * the browser bundle.
 */

export const STAGES = ["scout", "lens", "quill"] as const;

export type Stage = (typeof STAGES)[number];

export const STATUS = {
  QUEUED: "queued",
  RUNNING: "running",
  AWAITING: "awaiting_approval",
  DONE: "done",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;

export type Job = {
  id: string;
  question: string;
  model: string;
  status: string;
  stage: string;
  auto_approve: number;
  plan_path: string | null;
  bundle_path: string | null;
  report_path: string | null;
  error: string | null;
  pid: number | null;
  created_at: number;
  updated_at: number;
  cancel_requested: number;
  worker_id: string | null;
  log_tail: string | null;
};

/** Stages that have produced their artifact. */
export function completedStages(job: Job): Stage[] {
  if (job.stage === "done") return [...STAGES];
  const i = STAGES.indexOf(job.stage as Stage);
  return i < 0 ? [] : [...STAGES.slice(0, i)];
}
