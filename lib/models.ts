/**
 * The models a job can run on: the ones seesaw supports, offered as
 * suggestions, plus any TransformerLens name typed in. A job runs on every
 * model it lists (params.models), so one question can be asked of several.
 *
 * Mirrors seesaw's shared/lens_tools.py PLANNING_NOTES (supported models),
 * shared/gpus.py (which GPU a size needs) and seesaw/pathways/catalog.py
 * FEATURE_SAES (which models have SAEs).
 *
 * No server imports: the composer (a client component) reads this too.
 */

import type { Pathway } from "./pathways";
import type { Job } from "./types";

export type ModelInfo = {
  /** The name a job stores and TransformerLens loads. */
  id: string;
  family: "Gemma" | "Llama" | "Qwen";
  /** Billions of parameters. */
  size: number;
  /** Needs a Hugging Face token with the licence accepted (Gemma, Llama). */
  gated: boolean;
  /** Has published SAEs, so feature_explain can run on it. */
  saes: boolean;
};

export const SUGGESTED_MODELS: ModelInfo[] = [
  { id: "google/gemma-2-2b", family: "Gemma", size: 2.6, gated: true, saes: true },
  { id: "meta-llama/Llama-3.2-1B", family: "Llama", size: 1.2, gated: true, saes: false },
  { id: "meta-llama/Llama-3.2-3B", family: "Llama", size: 3.2, gated: true, saes: false },
  { id: "Qwen/Qwen2.5-0.5B", family: "Qwen", size: 0.5, gated: false, saes: false },
  { id: "Qwen/Qwen2.5-1.5B", family: "Qwen", size: 1.5, gated: false, saes: false },
  { id: "Qwen/Qwen2.5-3B", family: "Qwen", size: 3.1, gated: false, saes: false },
  { id: "Qwen/Qwen2.5-7B", family: "Qwen", size: 7.6, gated: false, saes: false },
  { id: "Qwen/Qwen2.5-7B-Instruct", family: "Qwen", size: 7.6, gated: false, saes: true },
];

/** The model a new job starts with: every tool works on it. */
export const DEFAULT_MODEL = "google/gemma-2-2b";

/** Most models one job may list: each one runs the whole plan. */
export const MAX_MODELS = 6;

/** 'google/gemma-2-2b' → 'gemma-2-2b', the name TransformerLens records. */
export function shortName(model: string): string {
  return model.split("/").pop() ?? model;
}

export function modelInfo(model: string): ModelInfo | undefined {
  const short = shortName(model).toLowerCase();
  return SUGGESTED_MODELS.find((m) => shortName(m.id).toLowerCase() === short);
}

/**
 * Why `pathway` can't run on `model`, or null when it can. Unknown models
 * pass: the worker checks them against the real tokenizer and config.
 */
export function incompatibility(pathway: Pathway | null | undefined, model: string): string | null {
  if (!pathway?.models) return null;
  const short = shortName(model).toLowerCase();
  if (pathway.models.some((m) => shortName(m).toLowerCase() === short)) return null;
  return `${pathway.label} needs published SAEs, which only ${pathway.models
    .map(shortName)
    .join(" and ")} have`;
}

/** Every model a job runs on, in order. Older jobs stored only one. */
export function jobModels(job: Job): string[] {
  try {
    const models = job.params ? JSON.parse(job.params).models : undefined;
    if (Array.isArray(models) && models.length && models.every((m) => typeof m === "string")) {
      return models;
    }
  } catch {
    // fall through to the single model
  }
  return [job.model];
}

/** Trimmed, de-duplicated model names, or an error saying what's wrong with them. */
export function cleanModels(value: unknown): { models: string[] } | { error: string } {
  const list = typeof value === "string" ? [value] : value;
  if (!Array.isArray(list) || !list.every((m) => typeof m === "string")) {
    return { error: "models must be a list of model names" };
  }
  const models = [...new Set(list.map((m) => m.trim()).filter(Boolean))];
  if (!models.length) return { error: "choose at least one model" };
  if (models.length > MAX_MODELS) {
    return { error: `choose at most ${MAX_MODELS} models; each one runs the whole plan` };
  }
  const bad = models.find((m) => !/^[\w.\-/]+$/.test(m));
  if (bad) return { error: `${JSON.stringify(bad)} isn't a model name` };
  return { models };
}
