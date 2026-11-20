/**
 * What a job investigates: a behavior, shown with examples, not a research
 * question. Mirrors seesaw's seesaw/behavior.py, which checks the same rules
 * again when the worker reads the job.
 *
 * The behavior sentence is stored as the job's `question` text; the rest goes
 * in params.behavior:
 *
 *   { examples: [{ prompt, output? }], non_examples: [...], action? }
 *
 * The action is what to do about the behavior: one of the use-case areas
 * (monitor, audit, fix, understand). A use case sets it to its own area.
 *
 * Kept free of server imports so the composer can use it too.
 */

export type BehaviorCase = { prompt: string; output?: string };

export const ACTIONS = ["monitor", "audit", "fix", "understand"] as const;
export type Action = (typeof ACTIONS)[number];

export type BehaviorDetails = {
  examples?: BehaviorCase[];
  non_examples?: BehaviorCase[];
  action?: Action;
};

export const MAX_TEXT = 4000;
export const MAX_EXAMPLES = 20;

function cleanCase(item: unknown, where: string): BehaviorCase | string {
  const raw = typeof item === "string" ? { prompt: item } : item;
  if (!raw || typeof raw !== "object") return `${where}: each example is a prompt`;
  const { prompt, output, ...rest } = raw as Record<string, unknown>;
  if (Object.keys(rest).length) return `${where}: an example has only a prompt and an output`;
  if (typeof prompt !== "string" || !prompt.trim()) return "";      // an empty row: skipped
  if (output !== undefined && typeof output !== "string") return `${where}: an output is text`;
  const out: BehaviorCase = { prompt: prompt.trim() };
  if (typeof output === "string" && output.trim()) out.output = output.trim();
  if (out.prompt.length > MAX_TEXT || (out.output?.length ?? 0) > MAX_TEXT) {
    return `${where}: an example is over ${MAX_TEXT} characters`;
  }
  return out;
}

/**
 * The examples, non-examples and action, cleaned: blank rows and fields
 * dropped, text trimmed. Returns an error message for anything seesaw would
 * refuse.
 */
export function cleanBehavior(
  input: unknown,
): { details: BehaviorDetails } | { error: string } {
  if (input === undefined || input === null) return { details: {} };
  if (typeof input !== "object") return { error: "behavior details must be an object" };
  const { examples, non_examples, action, ...rest } = input as Record<string, unknown>;
  if (Object.keys(rest).length) {
    return { error: "behavior details take only examples, non_examples and action" };
  }
  const details: BehaviorDetails = {};
  for (const [key, items] of [["examples", examples], ["non_examples", non_examples]] as const) {
    if (items === undefined || items === null) continue;
    if (!Array.isArray(items)) return { error: `${key} must be a list` };
    const cases: BehaviorCase[] = [];
    for (const item of items) {
      const c = cleanCase(item, key);
      if (typeof c === "string") {
        if (c) return { error: c };
        continue;
      }
      cases.push(c);
    }
    if (cases.length > MAX_EXAMPLES) return { error: `at most ${MAX_EXAMPLES} ${key}` };
    if (cases.length) details[key] = cases;
  }
  if (action !== undefined && action !== null && action !== "") {
    if (!ACTIONS.includes(action as Action)) {
      return { error: `action is one of ${ACTIONS.join(", ")}` };
    }
    details.action = action as Action;
  }
  return { details };
}

/** params.behavior off a job's params, if it has any. */
export function behaviorOf(params: Record<string, unknown>): BehaviorDetails | null {
  const b = params.behavior;
  return b && typeof b === "object" ? (b as BehaviorDetails) : null;
}
