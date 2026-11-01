/**
 * seesaw's hand-coded pathways, as the composer and the jobs API see them.
 *
 * Mirrors seesaw/pathways/catalog.py: same names, same inputs, same checks.
 * The checks are repeated here because this app writes job rows itself, so a
 * malformed pathway job would otherwise only fail once a worker picked it up.
 * Change both together.
 *
 * No server imports: the composer (a client component) reads this too.
 */

export type Field = {
  key: string;
  label: string;
  help: string;
  required: boolean;
  /** One entry per prompt. */
  aligned: boolean;
};

export type Pathway = {
  name: string;
  /** What you type after "/" in the composer. */
  command: string;
  label: string;
  summary: string;
  fields: Field[];
  /** feature_explain uses a GPT-2 small SAE, so it can't target other models. */
  models?: string[];
  /** The known-answer case from seesaw's scripts/run_pathways.py. */
  example: { label: string; model: string; params: Record<string, string[]> };
};

const prompts: Field = {
  key: "prompts",
  label: "Prompts",
  help: "One per line. The behaviour under study, at the position the model predicts next.",
  required: true,
  aligned: false,
};
const positive: Field = {
  key: "positive_tokens",
  label: "Correct answer",
  help: "One token per prompt, with its leading space (e.g. “ Mary”).",
  required: true,
  aligned: true,
};
const negative: Field = {
  key: "negative_tokens",
  label: "Wrong answer",
  help: "One token per prompt: the alternative the logit difference is measured against.",
  required: true,
  aligned: true,
};

const NAMES = [
  ["Mary", "John"], ["Alice", "Bob"], ["Sarah", "Tom"], ["Anna", "James"],
  ["Kate", "Mark"], ["Lisa", "David"], ["Emma", "Paul"], ["Rachel", "Steve"],
];
const IOI = NAMES.map(([a, b]) => `When ${a} and ${b} went to the store, ${b} gave a drink to`);
const IOI_EXAMPLE = {
  prompts: IOI,
  positive_tokens: NAMES.map(([a]) => ` ${a}`),
  negative_tokens: NAMES.map(([, b]) => ` ${b}`),
};
const FEMALE = ["nurse", "secretary", "nanny", "librarian", "dancer", "maid", "teacher", "cashier"];
const MALE = ["engineer", "mechanic", "carpenter", "plumber", "pilot", "farmer", "soldier", "driver"];

export const PATHWAYS: Pathway[] = [
  {
    name: "circuit_discovery",
    command: "circuit-discovery",
    label: "Circuit discovery",
    summary:
      "What mechanism does the model use? Nominates heads, verifies them by patching, and checks the circuit is faithful.",
    fields: [
      prompts,
      positive,
      negative,
      {
        key: "corrupted_prompts",
        label: "Corrupted prompts",
        help: "Optional, one per prompt: the same prompt with the answer-deciding detail changed. Enables patching.",
        required: false,
        aligned: true,
      },
      {
        key: "reference_prompts",
        label: "Reference prompts",
        help: "Optional, one per prompt: a neutral version (e.g. a third name) for mean-ablation baselines.",
        required: false,
        aligned: true,
      },
    ],
    example: {
      label: "Indirect object identification",
      model: "gpt2",
      params: {
        ...IOI_EXAMPLE,
        corrupted_prompts: NAMES.map(([a, b]) => `When ${a} and ${b} went to the store, ${a} gave a drink to`),
        reference_prompts: NAMES.map(([a, b]) => `When ${a} and ${b} went to the store, Mike gave a drink to`),
      },
    },
  },
  {
    name: "attribute_audit",
    command: "attribute-audit",
    label: "Attribute audit",
    summary:
      "Does the model use an attribute, and does removing its direction remove the behaviour?",
    fields: [
      prompts,
      {
        key: "counterfactual_prompts",
        label: "Counterfactual prompts",
        help: "One per prompt: the same prompt with only the attribute swapped.",
        required: true,
        aligned: true,
      },
      positive,
      negative,
      {
        key: "control_prompts",
        label: "Control prompts",
        help: "Optional: neutral prompts the direction shouldn't affect.",
        required: false,
        aligned: false,
      },
      {
        key: "control_texts",
        label: "Control texts",
        help: "Optional: unrelated text, to check removing the direction doesn't damage the model.",
        required: false,
        aligned: false,
      },
    ],
    example: {
      label: "Occupation → pronoun bias",
      model: "gpt2",
      params: {
        prompts: FEMALE.map((o) => `The ${o} said that`),
        counterfactual_prompts: MALE.map((o) => `The ${o} said that`),
        positive_tokens: FEMALE.map(() => " she"),
        negative_tokens: FEMALE.map(() => " he"),
        control_prompts: ["The person said that", "The student said that", "The worker said that"],
        control_texts: [
          "The weather today is mild and the park was full of people walking their dogs.",
          "Stock prices rose sharply after the central bank announced its decision.",
        ],
      },
    },
  },
  {
    name: "feature_explain",
    command: "feature-explain",
    label: "Feature explain",
    summary:
      "Which SAE features drive this output, and what are they? Uses a GPT-2 small SAE.",
    fields: [prompts, positive, negative],
    models: ["gpt2"],
    example: { label: "Indirect object identification", model: "gpt2", params: IOI_EXAMPLE },
  },
];

export function pathwayByName(name: unknown): Pathway | undefined {
  return PATHWAYS.find((p) => p.name === name);
}

/** Everything wrong with these inputs, or [] when the job can run. */
export function validatePathway(
  name: unknown,
  params: Record<string, unknown>,
  model: string,
): string[] {
  const pathway = pathwayByName(name);
  if (!pathway) return [`unknown pathway ${JSON.stringify(name)}`];

  const errors: string[] = [];
  const isList = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every((x) => typeof x === "string");
  const known = new Set(pathway.fields.map((f) => f.key));
  for (const key of Object.keys(params)) {
    if (!known.has(key)) errors.push(`${pathway.label} does not take ${key}`);
  }

  const n = isList(params.prompts) ? params.prompts.length : 0;
  for (const field of pathway.fields) {
    const value = params[field.key];
    if (value === undefined || value === null) {
      if (field.required) errors.push(`${field.label} is required`);
      continue;
    }
    if (!isList(value)) {
      errors.push(`${field.label} must be a list of strings`);
      continue;
    }
    if (field.required && value.length === 0) {
      errors.push(`${field.label} is required`);
    } else if (field.aligned && value.length && n && value.length !== n) {
      errors.push(`${field.label} has ${value.length} entries but there are ${n} prompts`);
    }
  }

  if (pathway.models && !pathway.models.includes(model)) {
    errors.push(`${pathway.label} only runs on ${pathway.models.join(", ")}`);
  }
  return errors;
}

/** Textarea text → list, one entry per non-empty line. Leading spaces matter for tokens. */
export function linesOf(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/\r$/, ""))
    .filter((l) => l.trim() !== "");
}

/** A default title for a pathway job, from its first prompt. */
export function pathwayTitle(pathway: Pathway, params: Record<string, unknown>): string {
  const first = Array.isArray(params.prompts) ? String(params.prompts[0] ?? "") : "";
  const clipped = first.length > 60 ? `${first.slice(0, 57)}…` : first;
  return clipped ? `${pathway.label}: ${clipped}` : pathway.label;
}
