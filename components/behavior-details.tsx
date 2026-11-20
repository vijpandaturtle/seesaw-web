"use client";

import { useState } from "react";

import { MAX_EXAMPLES, type Action, type BehaviorCase } from "@/lib/behavior";

/**
 * The details under the behavior sentence: what to do about it (the action),
 * real cases where the model does it, and the closest ones where it doesn't.
 * All optional; blank rows are dropped when the job is created
 * (lib/behavior.ts). Collapsed, the examples say how many are filled in.
 */

export type Draft = {
  examples: BehaviorCase[];
  nonExamples: BehaviorCase[];
  action: Action | undefined;
};

export const emptyDraft: Draft = {
  examples: [{ prompt: "", output: "" }],
  nonExamples: [{ prompt: "", output: "" }],
  action: undefined,
};

/**
 * The three actions a user picks from. seesaw also accepts "understand",
 * which is an audit with no outcome to beat, so the composer folds it into
 * Audit rather than offering it.
 */
export const USER_ACTIONS = ["monitor", "audit", "fix"] as const satisfies readonly Action[];

const ACTION_LABEL: Record<Action, string> = {
  monitor: "Monitor",
  audit: "Audit",
  fix: "Fix",
  understand: "Understand",
};

/** What each action produces, and what it has to beat. */
const ACTION_HINT: Record<Action, string> = {
  monitor: "Get a detector for it, shipped only if it beats a text-only classifier.",
  audit: "Find out whether it's there, where it comes from and why.",
  fix: "Get a model without it, shipped only if it beats fixing it with a prompt.",
  understand: "Explain how the model does it.",
};

/**
 * What to do about the behavior. Optional: with none picked, Scout infers it.
 * `lockedBy` fixes it (Check and Compare always audit).
 */
export function ActionPicker({
  value,
  lockedBy,
  onChange,
}: {
  value: Action | undefined;
  lockedBy?: string;
  onChange: (action: Action | undefined) => void;
}) {
  const actionHint = (a: Action) => ACTION_HINT[a];
  return (
    <div className="border-t border-zinc-800/80 px-4 py-2.5">
      <div
        role="radiogroup"
        aria-label="What do you want to do about it?"
        className="flex flex-wrap items-center gap-1.5"
      >
        <span className="mr-1 text-xs text-zinc-400">What do you want to do?</span>
        {USER_ACTIONS.map((action) => {
          const on = value === action;
          return (
            <button
              key={action}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={Boolean(lockedBy) && !on}
              aria-label={ACTION_LABEL[action]}
              title={actionHint(action)}
              onClick={() => onChange(on ? undefined : action)}
              className={`rounded-md border px-2 py-0.5 text-xs transition disabled:opacity-30 ${
                on
                  ? "border-zinc-400 bg-zinc-100 text-zinc-900"
                  : "border-zinc-800 text-zinc-300 hover:border-zinc-600"
              }`}
            >
              {ACTION_LABEL[action]}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-zinc-600">
        {value
          ? actionHint(value) + (lockedBy ? ` ${lockedBy}` : "")
          : "Optional: Scout infers it if you leave it."}
      </p>
    </div>
  );
}

const filled = (cases: BehaviorCase[]) => cases.filter((c) => c.prompt.trim()).length;

export function BehaviorDetailsEditor({
  draft,
  onChange,
  initiallyOpen = false,
}: {
  draft: Draft;
  onChange: (draft: Draft) => void;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const shown = filled(draft.examples);
  const contrast = filled(draft.nonExamples);
  const summary = [
    shown && `${shown} example${shown === 1 ? "" : "s"}`,
    contrast && `${contrast} where it doesn't`,
  ].filter(Boolean);

  return (
    <div className="border-t border-zinc-800/80 px-4 py-2.5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left text-xs text-zinc-400 hover:text-zinc-200"
      >
        <span aria-hidden className="w-3 text-zinc-600">{open ? "▾" : "▸"}</span>
        <span>Examples</span>
        <span className="text-zinc-600">
          {summary.length
            ? summary.join(" · ")
            : "recommended: real cases pin the behavior down far better than a description"}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-5 pb-1">
          <CaseList
            title="Where the model does it"
            hint="Paste real prompts, with what the model said if you have it."
            cases={draft.examples}
            onChange={(examples) => onChange({ ...draft, examples })}
          />
          <CaseList
            title="The closest cases where it doesn't"
            hint="The same kind of prompt without the trigger, so the comparison isn't just topic or length."
            cases={draft.nonExamples}
            onChange={(nonExamples) => onChange({ ...draft, nonExamples })}
          />
        </div>
      )}
    </div>
  );
}

function CaseList({
  title,
  hint,
  cases,
  onChange,
}: {
  title: string;
  hint: string;
  cases: BehaviorCase[];
  onChange: (cases: BehaviorCase[]) => void;
}) {
  const set = (i: number, patch: Partial<BehaviorCase>) =>
    onChange(cases.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <fieldset>
      <legend className="text-xs font-medium text-zinc-300">{title}</legend>
      <p className="mt-0.5 text-xs text-zinc-600">{hint}</p>
      <ol className="mt-2 space-y-2">
        {cases.map((c, i) => (
          <li key={i} className="flex gap-2">
            <div className="grid min-w-0 flex-1 gap-1.5 sm:grid-cols-2">
              <textarea
                aria-label={`${title}: prompt ${i + 1}`}
                value={c.prompt}
                onChange={(e) => set(i, { prompt: e.target.value })}
                placeholder="Prompt"
                rows={2}
                className="w-full resize-y rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-zinc-600"
              />
              <textarea
                aria-label={`${title}: what the model said ${i + 1}`}
                value={c.output ?? ""}
                onChange={(e) => set(i, { output: e.target.value })}
                placeholder="What the model said (optional)"
                rows={2}
                className="w-full resize-y rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-zinc-600"
              />
            </div>
            {cases.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(cases.filter((_, j) => j !== i))}
                aria-label={`Remove ${title.toLowerCase()} ${i + 1}`}
                className="self-start rounded px-1.5 py-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ol>
      {cases.length < MAX_EXAMPLES && (
        <button
          type="button"
          onClick={() => onChange([...cases, { prompt: "", output: "" }])}
          className="mt-2 text-xs text-zinc-400 hover:text-zinc-200"
        >
          + Add another
        </button>
      )}
    </fieldset>
  );
}
