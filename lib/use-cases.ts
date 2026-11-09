/**
 * What seesaw is for, as AI safety use cases: a job to do with a model, the
 * outcome metric it's scored by, and the baseline without interpretability it
 * has to beat. Each sits in an area: monitor, audit, fix, or understand.
 * Pathways are the methods a use case runs.
 *
 * The catalog lives in seesaw (seesaw/use_cases.py). data/use-cases.json is a
 * copy, refreshed with scripts/sync-use-cases.sh; don't edit it by hand.
 *
 * No server imports: the composer (a client component) reads this too.
 */
import catalog from "@/data/use-cases.json";

export type UseCaseStatus = "runnable" | "partial" | "planned";

/** What a use case does for safety. "understand" has no outcome to beat. */
export type Area = "monitor" | "audit" | "fix" | "understand";

export type UseCase = {
  name: string;
  title: string;
  /** The question someone brings, in their words. */
  question: string;
  /** How a result is scored (for the understand area, what the pathway reports). */
  metric: string;
  /** The best way to do the job without interpretability. */
  baseline: string;
  status: UseCaseStatus;
  modality: "text" | "vision";
  /** The pathways that do the job, the main one first. Empty when planned. */
  pathways: string[];
  /** lever tools a vision use case would run. */
  tools: string[];
  /** What stands between the use case and runnable. Empty when runnable. */
  gap: string;
  example: string;
  area: Area;
};

export const USE_CASES = catalog.use_cases as UseCase[];

/** The areas in display order, with seesaw's label for each ("Monitor: catch unsafe …"). */
export const AREAS = catalog.areas as { name: Area; label: string }[];

export const STATUS_LABEL: Record<UseCaseStatus, string> = {
  runnable: "Runnable",
  partial: "Baseline missing",
  planned: "Planned",
};

export function useCaseByName(name: unknown): UseCase | undefined {
  return USE_CASES.find((u) => u.name === name);
}

/** The use case a pathway serves: the one that lists it first, else any that lists it. */
export function useCaseForPathway(pathway: unknown): UseCase | undefined {
  if (typeof pathway !== "string" || !pathway) return undefined;
  if (pathway === "attribute_audit") return useCaseForPathway("concept_direction");
  return (
    USE_CASES.find((u) => u.pathways[0] === pathway) ??
    USE_CASES.find((u) => u.pathways.includes(pathway))
  );
}

/** The use case a job is for: the one it was started for, else the one its pathway serves. */
export function useCaseForJob(params: Record<string, unknown>): UseCase | undefined {
  return useCaseByName(params.use_case) ?? useCaseForPathway(params.pathway);
}
