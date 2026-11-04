/**
 * seesaw's hand-coded pathways, as the composer and the jobs API see them.
 *
 * Mirrors seesaw/pathways/catalog.py (PATHWAYS, INPUTS, AUTO, SAE_MODELS):
 * same names, same inputs, same versions. The composer attaches a pathway to
 * a research question (or asks Scout to choose one, AUTO) and Scout chooses
 * its inputs; `fields` describes them so the job page can show what Scout
 * (or, on older pathway jobs, the user) supplied.
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
  /** One string rather than a list (a model name). */
  text?: boolean;
};

export type Pathway = {
  name: string;
  /** What you type after "/" in the composer. */
  command: string;
  label: string;
  summary: string;
  /** A research question this pathway answers, offered in the composer as a starting point. */
  example: string;
  fields: Field[];
  /** Bumped when a change would change the verdict on the same inputs. */
  version: string;
  /** feature_explain uses GPT-2 small SAEs, so it can't target other models. */
  models?: string[];
  /** An older name kept so earlier jobs render and rerun; not offered in the composer. */
  hidden?: boolean;
};

/** A job's pathway param that asks Scout to choose the pathway, or none. */
export const AUTO = "auto";

/** The models feature_explain's SAEs were trained on. */
export const SAE_MODELS = ["gpt2", "gpt2-small"];

// One entry per input name, as catalog.py's INPUTS describes it. Pathways
// share names, so whether an input is required is set per pathway below.
const INPUTS: Record<string, Omit<Field, "required">> = {
  prompts: {
    key: "prompts",
    label: "Prompts",
    help: "Prompts the behaviour shows up on; each ends right before the answer token.",
    aligned: false,
  },
  positive_tokens: {
    key: "positive_tokens",
    label: "Correct answer",
    help: "The correct (or attribute-consistent) next token, one per prompt.",
    aligned: true,
  },
  negative_tokens: {
    key: "negative_tokens",
    label: "Wrong answer",
    help: "The distractor (or attribute-opposite) next token, one per prompt.",
    aligned: true,
  },
  corrupted_prompts: {
    key: "corrupted_prompts",
    label: "Corrupted prompts",
    help: "The same prompt with the key information changed (e.g. IOI with the repeated name swapped), one per prompt, same token length.",
    aligned: true,
  },
  reference_prompts: {
    key: "reference_prompts",
    label: "Reference prompts",
    help: "Prompts from a neutral distribution (e.g. IOI's ABC prompts) used as ablation means, one per prompt; defaults to the prompts.",
    aligned: true,
  },
  counterfactual_prompts: {
    key: "counterfactual_prompts",
    label: "Counterfactual prompts",
    help: "The same prompt with the attribute swapped (e.g. 'nurse' -> 'engineer'), one per prompt.",
    aligned: true,
  },
  control_prompts: {
    key: "control_prompts",
    label: "Control prompts",
    help: "Attribute-free prompts ('The person said that') showing the model's baseline preference; any number.",
    aligned: false,
  },
  control_texts: {
    key: "control_texts",
    label: "Control texts",
    help: "Ordinary text for checking an edit doesn't damage the model; any number.",
    aligned: false,
  },
  contrast_prompts: {
    key: "contrast_prompts",
    label: "Contrast prompts",
    help: "Training texts without the property the probe should detect; any number.",
    aligned: false,
  },
  test_prompts: {
    key: "test_prompts",
    label: "Test prompts",
    help: "Held-out texts with the property, ideally from a different source or topic than the prompts; any number.",
    aligned: false,
  },
  test_contrast_prompts: {
    key: "test_contrast_prompts",
    label: "Test contrast prompts",
    help: "Held-out texts without it, from the same source as the test prompts; any number.",
    aligned: false,
  },
  subjects: {
    key: "subjects",
    label: "Subjects",
    help: "The subject of each factual prompt, written exactly as it appears in the prompt (e.g. 'The Eiffel Tower'), one per prompt.",
    aligned: true,
  },
  target_tokens: {
    key: "target_tokens",
    label: "Edit targets",
    help: "The new answer an edit should write in for each fact (e.g. ' Rome'), one per prompt.",
    aligned: true,
  },
  paraphrase_prompts: {
    key: "paraphrase_prompts",
    label: "Paraphrases",
    help: "A rewording of each prompt with the same subject and answer, one per prompt.",
    aligned: true,
  },
  neighborhood_prompts: {
    key: "neighborhood_prompts",
    label: "Neighbourhood prompts",
    help: "For each fact, a prompt about a different subject with the same relation (e.g. 'The Colosseum is located in the city of'), one per prompt.",
    aligned: true,
  },
  neighborhood_tokens: {
    key: "neighborhood_tokens",
    label: "Neighbourhood answers",
    help: "That neighbourhood prompt's true answer, one per prompt.",
    aligned: true,
  },
  other_model: {
    key: "other_model",
    label: "Other model",
    help: "The changed model to compare with the job's model: a TransformerLens model name with the same tokenizer (one string, not a list).",
    aligned: false,
    text: true,
  },
};

/** A pathway's fields, from its required, single-string and optional inputs (in that order). */
function fields(required: string[], optional: string[] = [], text: string[] = []): Field[] {
  return [
    ...required.map((k) => ({ ...INPUTS[k], required: true })),
    ...text.map((k) => ({ ...INPUTS[k], required: true })),
    ...optional.map((k) => ({ ...INPUTS[k], required: false })),
  ];
}

const ANSWERS = ["prompts", "positive_tokens", "negative_tokens"];
const CONCEPT = ["prompts", "counterfactual_prompts", "positive_tokens", "negative_tokens"];

export const PATHWAYS: Pathway[] = [
  {
    name: "circuit_discovery",
    command: "circuit-discovery",
    label: "Circuit discovery",
    summary:
      "What mechanism does the model use for this task? Nominates heads, verifies heads and MLPs by patching, and checks the circuit is faithful.",
    example: "Which attention heads and MLPs implement indirect object identification?",
    fields: fields(ANSWERS, ["corrupted_prompts", "reference_prompts"]),
    version: "2",
  },
  {
    name: "concept_direction",
    command: "concept-direction",
    label: "Concept direction",
    summary:
      "Is a concept a direction the model uses, and can it be steered safely? Fits the direction on half the pairs, removes and steers on the other half, and checks it can be baked into the weights.",
    example: "Is grammatical gender in occupation words a direction the model uses, and can removing it stop gendered pronoun predictions?",
    fields: fields(CONCEPT, ["control_prompts", "control_texts"]),
    version: "1",
  },
  {
    name: "attribute_audit",
    command: "attribute-audit",
    label: "Attribute audit",
    summary:
      "The concept_direction pathway under its older name, kept so earlier jobs can be rerun.",
    example: "Does the model use an occupation's stereotyped gender when predicting a pronoun?",
    fields: fields(CONCEPT, ["control_prompts", "control_texts"]),
    version: "2",
    hidden: true,
  },
  {
    name: "probe_monitor",
    command: "probe-monitor",
    label: "Probe monitor",
    summary:
      "Would a probe on the activations make a good detector for X? Trains on some texts, tests on held-out ones, and compares with text-only baselines.",
    example: "Would a linear probe on the residual stream detect sarcasm better than a bag-of-words baseline?",
    fields: fields(["prompts", "contrast_prompts", "test_prompts", "test_contrast_prompts"]),
    version: "1",
  },
  {
    name: "spurious_audit",
    command: "spurious-audit",
    label: "Spurious audit",
    summary:
      "Does the answer depend on an attribute it shouldn't, and can erasing the attribute (LEACE) remove that without breaking the task?",
    example: "Does sentiment classification depend on the reviewer's name, and can erasing it keep the task working?",
    fields: fields(CONCEPT, ["control_texts"]),
    version: "1",
  },
  {
    name: "factual_recall",
    command: "factual-recall",
    label: "Factual recall",
    summary:
      "Where does the model retrieve these facts? Causal tracing over layers and positions.",
    example: "At which layers and token positions does the model recall the city a landmark is in?",
    fields: fields(["prompts", "subjects", "positive_tokens"]),
    version: "1",
  },
  {
    name: "editing_comparison",
    command: "editing-comparison",
    label: "Editing comparison",
    summary:
      "Is the layer where a fact is traced the best layer to edit it? ROME at every layer vs tracing.",
    example: "Is the layer where causal tracing locates a landmark's city the best layer to edit it with ROME?",
    fields: fields([
      "prompts",
      "subjects",
      "positive_tokens",
      "target_tokens",
      "paraphrase_prompts",
      "neighborhood_prompts",
      "neighborhood_tokens",
    ]),
    version: "1",
  },
  {
    name: "model_diffing",
    command: "model-diffing",
    label: "Model diffing",
    summary:
      "What did a fine-tune (or quantisation, or edit) change, and in which weights? Compares the job's model with other_model.",
    example: "What changed between gpt2 and distilgpt2, and in which layers?",
    fields: fields(["prompts"], [], ["other_model"]),
    version: "1",
  },
  {
    name: "feature_explain",
    command: "feature-explain",
    label: "Feature explain",
    summary:
      "Which SAE features drive this output, and what are they? Sweeps GPT-2 small SAEs at layers 4, 6, 8 and 10 (gpt2 only).",
    example: "Which SAE features drive the model to complete a famous quote?",
    fields: fields(ANSWERS),
    version: "2",
    models: SAE_MODELS,
  },
];

/** The pathways the composer offers: every one but older names. */
export const OFFERED = PATHWAYS.filter((p) => !p.hidden);

export function pathwayByName(name: unknown): Pathway | undefined {
  return PATHWAYS.find((p) => p.name === name);
}
