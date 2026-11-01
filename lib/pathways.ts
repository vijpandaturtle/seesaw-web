/**
 * seesaw's hand-coded pathways, as the composer and the jobs API see them.
 *
 * Mirrors seesaw/pathways/catalog.py: same names, same inputs. The composer
 * attaches a pathway to a research question and Scout chooses its inputs;
 * `fields` describes them so the job page can show what Scout (or, on older
 * pathway jobs, the user) supplied.
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
  },
  {
    name: "feature_explain",
    command: "feature-explain",
    label: "Feature explain",
    summary:
      "Which SAE features drive this output, and what are they? Uses a GPT-2 small SAE.",
    fields: [prompts, positive, negative],
    models: ["gpt2"],
  },
];

export function pathwayByName(name: unknown): Pathway | undefined {
  return PATHWAYS.find((p) => p.name === name);
}
