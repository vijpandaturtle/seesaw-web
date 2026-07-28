/**
 * Reading the eval suite's output.
 *
 * The suite runs in Python; this only reads what it wrote. Task runs land in
 * outputs/eval_runs/ as the runner finishes them, while the catalog and
 * fixture health are dumps produced on demand:
 *
 *   seesaw eval --list --json outputs/eval_catalog.json
 *   seesaw fixtures --json outputs/fixture_check.json
 *
 * Everything is optional — a fresh checkout has none of it, and the dashboard
 * says so rather than failing.
 */
import fs from "node:fs";
import path from "node:path";

import { readDir } from "./paths";

export type GraderResult = {
  criterion: string;
  agent: string;
  grader_type?: string;
  score: number | null;
  detail?: string | null;
  error?: string | null;
};

export type EvalRun = {
  file: string;
  task_id: string;
  target: string;
  started_at: number;
  scores: Record<string, number | null>;
  grader_results: GraderResult[];
  metrics: Record<string, Record<string, number | null>>;
  errors: string[];
};

export type CatalogTask = {
  id: string;
  target: string;
  question?: string;
  graders: string[];
};

export type FixtureHealth = {
  total: number;
  ran_offline: number;
  mismatches: string[];
  coverage: Record<string, string[]>;
  checked_at?: number;
};

const runsDir = () => path.join(readDir(), "eval_runs");

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Persisted task runs, newest first. */
export function listRuns(): EvalRun[] {
  const RUNS_DIR = runsDir();
  if (!fs.existsSync(RUNS_DIR)) return [];
  const runs: EvalRun[] = [];
  for (const name of fs.readdirSync(RUNS_DIR)) {
    if (!name.endsWith(".json")) continue;
    const parsed = readJson<Omit<EvalRun, "file">>(path.join(RUNS_DIR, name));
    if (parsed) runs.push({ file: name, ...parsed });
  }
  return runs.sort((a, b) => (b.started_at ?? 0) - (a.started_at ?? 0));
}

export function catalog(): CatalogTask[] {
  const parsed = readJson<{ tasks: CatalogTask[] }>(
    path.join(readDir(), "eval_catalog.json"),
  );
  return parsed?.tasks ?? [];
}

export function fixtureHealth(): FixtureHealth | null {
  return readJson<FixtureHealth>(path.join(readDir(), "fixture_check.json"));
}

/**
 * criterion × task grid of the most recent score for each pair.
 *
 * Runs are newest-first, so the first score seen for a pair wins.
 */
export function scoreMatrix(runs: EvalRun[]) {
  const criteria = new Set<string>();
  const tasks = new Set<string>();
  const cells: Record<string, Record<string, number | null>> = {};

  for (const run of runs) {
    tasks.add(run.task_id);
    for (const [criterion, score] of Object.entries(run.scores ?? {})) {
      criteria.add(criterion);
      cells[criterion] ??= {};
      if (!(run.task_id in cells[criterion])) {
        cells[criterion][run.task_id] = score;
      }
    }
  }
  return {
    criteria: [...criteria].sort(),
    tasks: [...tasks].sort(),
    cells,
  };
}

/** Mean of the scores that were actually produced (nulls need a human). */
export function meanScore(scores: Record<string, number | null>): number | null {
  const values = Object.values(scores ?? {}).filter(
    (v): v is number => typeof v === "number",
  );
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
