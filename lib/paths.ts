/**
 * Where run artifacts are read from.
 *
 * Deployed, this app has no access to the machine that ran the jobs, so
 * anything file-based has to be bundled into the repo at `data/`. Locally,
 * a seesaw checkout is preferred so you see live results as they're written.
 */
import fs from "node:fs";
import path from "node:path";

/** Committed snapshot, always present — this is what a deployment sees. */
export const DATA_DIR = path.join(process.cwd(), "data");

/** A local seesaw checkout, when this is running next to one. */
export const OUTPUTS_DIR = path.resolve(
  process.env.SEESAW_OUTPUTS_DIR ??
    path.join(process.cwd(), "..", "seesaw", "outputs"),
);

export function hasLocalOutputs(): boolean {
  return fs.existsSync(OUTPUTS_DIR);
}

/** Prefer live local files; fall back to the committed snapshot. */
export function readDir(): string {
  return hasLocalOutputs() ? OUTPUTS_DIR : DATA_DIR;
}
