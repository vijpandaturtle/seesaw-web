/**
 * Shapes and constants shared by client and server.
 *
 * Kept out of lib/db.ts on purpose: that module loads a native SQLite driver,
 * and a client component importing a value from it would pull the driver into
 * the browser bundle.
 */

export const STAGES = ["scout", "lens", "quill"] as const;

/** Models a job can target, offered by the composer and by rerun. */
export const MODELS = [
  "gpt2",
  "gpt2-medium",
  "gpt2-large",
  "gpt2-xl",
  "pythia-70m",
  "pythia-160m",
  "pythia-410m",
  "gpt-neo-125m",
];

export type Stage = (typeof STAGES)[number];

/**
 * What a job runs. "research" is Scout → Lens → Quill on a question; a
 * "pathway" job runs one of seesaw's hand-coded pathways as a single stage
 * with no human gate. Mirrors STAGES_BY_KIND in seesaw's shared/db/jobs.py.
 */
export const STAGES_BY_KIND: Record<string, readonly string[]> = {
  research: STAGES,
  pathway: ["pathway"],
};

export function stagesFor(kind: string | undefined): readonly string[] {
  return STAGES_BY_KIND[kind ?? "research"] ?? STAGES;
}

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
  /** Absent on rows written before pathway jobs existed. */
  kind?: string;
  /** JSON: a pathway job's inputs, including `pathway`. */
  params?: string | null;
  /** JSON (seesaw's shared/costs.py): spent so far, and the next stage's estimate. Set at each gate. */
  cost?: string | null;
};

/** One stage's cost, from its timeline (shared/costs.py stage_cost). */
export type StageCost = {
  stage: string;
  llm_usd: number;
  gpu_usd: number;
  gpu_seconds: number;
  runner_usd: number;
  total_usd: number;
  unpriced_models: string[];
};

/** What the stage behind a gate will likely cost (shared/costs.py estimate). */
export type CostEstimate = {
  stage: string;
  llm_usd: number;
  gpu: string | null;
  gpu_seconds: number;
  gpu_usd: number;
  runner_usd: number;
  total_usd: number;
  /** What the numbers came from, in plain words. */
  basis: string[];
};

export type JobCost = {
  computed_at: number;
  spent: { stages: StageCost[]; total_usd: number; unpriced_models: string[] };
  next: CostEstimate | null;
};

export function jobCost(job: Job): JobCost | null {
  if (!job.cost) return null;
  try {
    return JSON.parse(job.cost);
  } catch {
    return null;
  }
}

/** Dollars for a cost line: two decimals, or "<$0.01" for a fraction of a cent. */
export function usd(value: number): string {
  if (value > 0 && value < 0.005) return "<$0.01";
  return `$${value.toFixed(2)}`;
}

/**
 * One thing a job's worker did: a stage, a LangGraph node, an LLM or tool
 * call, a Lens experiment, a pathway step, a check, an error, a change of
 * status. Written by seesaw's shared/db/events.py as it happens; `parent_id`
 * is the span it happened inside. `data` is left out of the list and fetched
 * per event.
 */
export type JobEvent = {
  id: number;
  parent_id: number | null;
  ts: number;
  stage: string | null;
  kind: string;
  name: string;
  /** "running" (or a span whose worker died), "ok" or "error". */
  status: string;
  duration_ms: number | null;
  summary: string | null;
  data?: Record<string, unknown> | null;
};

export function jobParams(job: Job): Record<string, unknown> {
  if (!job.params) return {};
  try {
    return JSON.parse(job.params);
  } catch {
    return {};
  }
}

/**
 * A research job's approved pathway inputs, which a rerun runs again: present
 * once Scout's inputs passed their check (`pathway_params`), and on reruns.
 */
export function rerunnable(job: Job): boolean {
  const params = jobParams(job);
  return (job.kind ?? "research") === "research" && !!params.pathway &&
    !!params.pathway_params && !!job.plan_path;
}

/** Stages that have produced their artifact. */
export function completedStages(job: Job): string[] {
  const stages = stagesFor(job.kind);
  if (job.stage === "done") return [...stages];
  const i = stages.indexOf(job.stage);
  return i < 0 ? [] : [...stages.slice(0, i)];
}
