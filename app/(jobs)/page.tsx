"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";

import {
  ActionPicker,
  BehaviorDetailsEditor,
  emptyDraft,
  type Draft,
} from "@/components/behavior-details";
import { ModelPicker } from "@/components/model-picker";
import { RunnerNotice } from "@/components/shell";
import { LIBRARY, type LibraryBehavior } from "@/lib/library";
import { DEFAULT_MODEL, incompatibility } from "@/lib/models";
import { AUTO, OFFERED, pathwayByName, type Pathway } from "@/lib/pathways";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/**
 * The new-job composer. A user picks three things:
 *
 * - a mode: why they're here. Investigate a behavior they saw; Check a model
 *   for several known behaviors before it ships; or Compare two versions of a
 *   model after a change.
 * - a behavior: what the model does, in a sentence, with real cases where it
 *   does it and the closest ones where it doesn't (components/behavior-details.tsx),
 *   or one from the library (lib/library.ts).
 * - an action: monitor it, audit it, or fix it. Check and Compare always audit.
 *
 * Scout picks the method (pathway) from those; a leading "/" in Investigate
 * picks one directly. Check starts one audit job per behavior: there's no
 * combined scorecard yet. Compare runs model_diffing on the two models: it
 * doesn't rerun earlier jobs on the new one yet.
 */

type Mode = "investigate" | "check" | "compare";

const MODES: { id: Mode; label: string; when: string; heading: string }[] = [
  {
    id: "investigate",
    label: "Investigate",
    when: "You saw it do something",
    heading: "What did the model do?",
  },
  {
    id: "check",
    label: "Check",
    when: "Before you ship it",
    heading: "Which behaviors should this model be checked for?",
  },
  {
    id: "compare",
    label: "Compare",
    when: "After you changed it",
    heading: "What might have changed between the two versions?",
  },
];

const MODEL_DIFFING = pathwayByName("model_diffing") ?? null;

type Started = { title: string; id?: string; error?: string };

export default function NewJobPage() {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { data } = useSWR<{ runner?: string }>("/api/jobs", fetcher);

  const [mode, setMode] = useState<Mode>("investigate");
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  // The library entry the behavior was filled from, if any (remounts the examples open).
  const [fromLibrary, setFromLibrary] = useState<string | null>(null);
  // Check mode: the library behaviors to run.
  const [checked, setChecked] = useState<string[]>(["prompt_injection", "sycophancy"]);
  // A pathway picked with "/" (Investigate only).
  const [slashPathway, setSlashPathway] = useState<Pathway | null>(null);
  const [scoutChooses, setScoutChooses] = useState(true);
  const [search, setSearch] = useState(false);
  const [models, setModels] = useState<string[]>([DEFAULT_MODEL]);
  const [otherModel, setOtherModel] = useState<string[]>([]);
  const [autoApprove, setAutoApprove] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState<Started[] | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const pathway = mode === "compare" ? MODEL_DIFFING : mode === "investigate" ? slashPathway : null;
  const compares = mode === "compare";
  const current = MODES.find((m) => m.id === mode)!;

  // The slash menu: open while the box holds a single "/word" (Investigate only).
  const slash =
    mode === "investigate" && !slashPathway && /^\/[\w-]*$/.test(text)
      ? text.slice(1).toLowerCase()
      : null;
  const matches = useMemo(
    () =>
      slash === null
        ? []
        : OFFERED.filter((p) => p.command.startsWith(slash) || p.name.startsWith(slash)),
    [slash],
  );

  const blocked = models.map((m) => incompatibility(pathway, m)).find(Boolean) ?? null;
  const canStart =
    models.length > 0 &&
    !blocked &&
    slash === null &&
    (mode === "check" ? checked.length > 0 : text.trim() !== "") &&
    (!compares || otherModel.length === 1);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setStarted(null);
    if (next === "compare") setModels((m) => m.slice(0, 1));
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function choosePathway(p: Pathway) {
    setSlashPathway(p);
    setText("");
    setError(null);
    const kept = models.filter((m) => !incompatibility(p, m));
    setModels(kept.length ? kept : p.models ? [p.models[0]] : [DEFAULT_MODEL]);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function applyLibrary(entry: LibraryBehavior) {
    if (mode === "check") {
      setChecked((c) =>
        c.includes(entry.id) ? c.filter((id) => id !== entry.id) : [...c, entry.id],
      );
      return;
    }
    setText(entry.behavior);
    setDraft({
      examples: entry.examples.map((c) => ({ ...c })),
      nonExamples: entry.nonExamples.map((c) => ({ ...c })),
      action: mode === "investigate" ? entry.action : "audit",
    });
    setFromLibrary(entry.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function post(behavior: string, d: Draft): Promise<{ id?: string; error?: string }> {
    const body = {
      behavior,
      details: {
        examples: d.examples,
        non_examples: d.nonExamples,
        action: mode === "investigate" ? d.action : "audit",
      },
      models,
      ...(compares && { otherModel: otherModel[0] }),
      autoApprove,
      pathway: pathway?.name ?? (mode === "check" || scoutChooses ? AUTO : undefined),
      search,
    };
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) return { error: payload.error ?? `HTTP ${res.status}` };
    return { id: payload.job.id };
  }

  async function submit() {
    if (!canStart || busy) return;
    setBusy(true);
    setError(null);
    if (mode === "check") {
      const results: Started[] = [];
      for (const entry of LIBRARY.filter((e) => checked.includes(e.id))) {
        const r = await post(entry.behavior, {
          examples: entry.examples,
          nonExamples: entry.nonExamples,
          action: "audit",
        });
        results.push({ title: entry.title, ...r });
      }
      setBusy(false);
      setStarted(results);
      mutate("/api/jobs");
      return;
    }
    const r = await post(text, draft);
    setBusy(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    mutate("/api/jobs");
    router.push(`/jobs/${r.id}`);
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (slash !== null && matches.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        setHighlight((h) => (h + step + matches.length) % matches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        choosePathway(matches[Math.min(highlight, matches.length - 1)]);
        return;
      }
      if (e.key === "Escape") {
        setText("");
        return;
      }
    }
    if (e.key === "Backspace" && slashPathway && text === "") {
      e.preventDefault();
      setSlashPathway(null);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const button =
    mode === "check"
      ? `Check ${checked.length} behavior${checked.length === 1 ? "" : "s"}`
      : current.label;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
      <RunnerNotice runner={data?.runner} />

      <div role="tablist" aria-label="Mode" className="mb-6 grid grid-cols-3 gap-2">
        {MODES.map((m) => {
          const on = m.id === mode;
          return (
            <button
              key={m.id}
              role="tab"
              aria-selected={on}
              onClick={() => switchMode(m.id)}
              className={`rounded-lg border px-3 py-2 text-left transition ${
                on
                  ? "border-zinc-500 bg-zinc-900"
                  : "border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/50"
              }`}
            >
              <div className={`text-sm font-medium ${on ? "text-zinc-100" : "text-zinc-300"}`}>
                {m.label}
              </div>
              <div className="text-xs text-zinc-500">{m.when}</div>
            </button>
          );
        })}
      </div>

      <h1 className="mb-1 text-xl font-semibold tracking-tight text-zinc-100">{current.heading}</h1>
      <p className="mb-6 text-sm text-zinc-500">
        {mode === "investigate" && (
          <>
            Say what it does in a sentence and add real cases where you saw it, or start from the
            library below. Scout picks the method; type{" "}
            <kbd className="rounded border border-zinc-700 px-1 font-mono text-xs text-zinc-300">
              /
            </kbd>{" "}
            to pick one yourself.
          </>
        )}
        {mode === "check" &&
          "Pick behaviors from the library. Each runs as its own audit of the model: does it do this, and where does it come from?"}
        {mode === "compare" &&
          "Pick the version before and after the change, and the behavior you're worried about. Seesaw diffs the two models' internals on it."}
      </p>

      <div className="relative rounded-xl border border-zinc-800 bg-zinc-900/50 focus-within:border-zinc-600">
        {mode === "check" ? (
          <CheckList checked={checked} onToggle={(e) => applyLibrary(e)} />
        ) : (
          <>
            {slashPathway && (
              <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800 py-0.5 pr-1 pl-2 text-sm text-zinc-100">
                  <span className="font-mono">/{slashPathway.command}</span>
                  <button
                    onClick={() => setSlashPathway(null)}
                    aria-label="Remove the method"
                    className="rounded px-1 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200"
                  >
                    ×
                  </button>
                </span>
                <span className="text-xs text-zinc-500">{slashPathway.summary}</span>
              </div>
            )}
            <label htmlFor="behavior" className="sr-only">
              The behavior{mode === "investigate" ? ", or / for a method" : ""}
            </label>
            <textarea
              id="behavior"
              ref={inputRef}
              autoFocus
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setHighlight(0);
                setFromLibrary(null);
              }}
              onKeyDown={onKey}
              placeholder={
                mode === "compare"
                  ? "Agrees with the user more often since the fine-tune"
                  : "Gives up a correct answer when the user pushes back"
              }
              rows={2}
              role="combobox"
              aria-expanded={slash !== null}
              aria-controls="pathway-menu"
              aria-autocomplete="list"
              className="block w-full resize-none bg-transparent px-4 pt-4 pb-2 text-[15px] text-zinc-100 outline-none placeholder:text-zinc-600"
            />
            {slash !== null && (
              <ul
                id="pathway-menu"
                role="listbox"
                className="absolute inset-x-2 top-full z-10 mt-1 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl"
              >
                {matches.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-zinc-500">No method matches.</li>
                ) : (
                  matches.map((p, i) => (
                    <li
                      key={p.name}
                      role="option"
                      aria-selected={i === highlight}
                      onMouseEnter={() => setHighlight(i)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        choosePathway(p);
                      }}
                      className={`cursor-pointer px-3 py-2 ${i === highlight ? "bg-zinc-800" : ""}`}
                    >
                      <div className="font-mono text-sm text-zinc-100">/{p.command}</div>
                      <div className="text-xs text-zinc-500">{p.summary}</div>
                    </li>
                  ))
                )}
              </ul>
            )}
          </>
        )}

        {slash === null && (
          <>
            <ActionPicker
              value={mode === "investigate" ? draft.action : "audit"}
              lockedBy={
                mode === "check"
                  ? "Check audits each behavior."
                  : mode === "compare"
                    ? "Compare audits what changed."
                    : undefined
              }
              onChange={(action) => setDraft({ ...draft, action })}
            />
            {mode !== "check" && (
              <BehaviorDetailsEditor
                key={fromLibrary ?? "own"}
                draft={draft}
                onChange={setDraft}
                initiallyOpen={Boolean(fromLibrary)}
              />
            )}
          </>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-zinc-800/80 px-3 py-2.5">
          <div className={compares ? "flex w-full flex-wrap items-center gap-2" : "w-full"}>
            {compares && <span className="text-xs text-zinc-500">Before</span>}
            <div className={compares ? "min-w-48 flex-1" : ""}>
              <ModelPicker
                value={models}
                onChange={setModels}
                pathway={pathway}
                max={compares ? 1 : undefined}
                label={compares ? "Model before the change" : "Models"}
              />
            </div>
            {compares && (
              <>
                <span className="text-xs text-zinc-500">after</span>
                <div className="min-w-48 flex-1">
                  <ModelPicker
                    value={otherModel}
                    onChange={setOtherModel}
                    max={1}
                    label="Model after the change"
                  />
                </div>
              </>
            )}
          </div>
          {blocked && <span className="w-full text-xs text-amber-300">{blocked}.</span>}
          {mode === "investigate" && !slashPathway && (
            <>
              <label className="sr-only" htmlFor="pathway-mode">
                Method
              </label>
              <select
                id="pathway-mode"
                value={scoutChooses ? "auto" : "none"}
                onChange={(e) => setScoutChooses(e.target.value === "auto")}
                className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-300"
              >
                <option value="auto">Scout picks a method, or none</option>
                <option value="none">No method: Scout plans freely</option>
              </select>
            </>
          )}
          <label className="flex items-center gap-1.5 text-xs text-zinc-500">
            <input type="checkbox" checked={search} onChange={(e) => setSearch(e.target.checked)} />
            Search the literature
          </label>
          <label className="flex items-center gap-1.5 text-xs text-zinc-500">
            <input
              type="checkbox"
              checked={autoApprove}
              onChange={(e) => setAutoApprove(e.target.checked)}
            />
            Run all stages without stopping
          </label>
          <button
            onClick={submit}
            disabled={!canStart || busy}
            className="ml-auto rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 transition hover:bg-white disabled:opacity-30"
          >
            {busy ? "Starting…" : button}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {error}
        </p>
      )}

      {started && (
        <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs">
          <p className="text-zinc-400">
            Started {started.filter((s) => s.id).length} of {started.length} audits. A combined
            scorecard isn&apos;t built yet; each opens as its own job.
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {started.map((s) => (
              <li key={s.title}>
                {s.id ? (
                  <Link href={`/jobs/${s.id}`} className="text-zinc-200 hover:underline">
                    {s.title}
                  </Link>
                ) : (
                  <span className="text-amber-300">
                    {s.title}: {s.error}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {slash === null && (
        <LibraryMenu
          showLibrary={mode !== "check"}
          active={fromLibrary}
          onChoose={applyLibrary}
          onChoosePathway={(p) => {
            switchMode("investigate");
            choosePathway(p);
          }}
        />
      )}
    </main>
  );
}

const ACTION_TAG: Record<string, string> = {
  monitor: "Monitor",
  audit: "Audit",
  fix: "Fix",
  understand: "Audit",
};

/** Check mode's box: the library as a checklist. */
function CheckList({
  checked,
  onToggle,
}: {
  checked: string[];
  onToggle: (entry: LibraryBehavior) => void;
}) {
  return (
    <fieldset className="px-4 pt-3 pb-2">
      <legend className="sr-only">Behaviors to check</legend>
      <ul className="grid gap-1 sm:grid-cols-2">
        {LIBRARY.map((e) => (
          <li key={e.id}>
            <label className="flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 hover:bg-zinc-800/50">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={checked.includes(e.id)}
                onChange={() => onToggle(e)}
              />
              <span>
                <span className="block text-sm text-zinc-200">
                  {e.title}
                  {e.benchmarked && <BenchmarkedBadge />}
                </span>
                <span className="block text-xs text-zinc-500">{e.behavior}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-2 px-1.5 text-[11px] text-zinc-600">
        A starter set: only behaviors marked benchmarked have a dataset and a pass/fail rule behind
        them; the rest are illustrations.
      </p>
    </fieldset>
  );
}

function BenchmarkedBadge() {
  return (
    <span className="ml-1.5 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-px align-middle text-[10px] font-medium text-emerald-300">
      benchmarked
    </span>
  );
}

/**
 * Below the composer: the behavior library to start from (not in Check mode,
 * where the checklist in the box is the library), then the methods.
 */
function LibraryMenu({
  showLibrary,
  active,
  onChoose,
  onChoosePathway,
}: {
  showLibrary: boolean;
  active: string | null;
  onChoose: (entry: LibraryBehavior) => void;
  onChoosePathway: (p: Pathway) => void;
}) {
  return (
    <div className="mt-10 space-y-10">
      {showLibrary && (
        <section>
          <h2 className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
            Behavior library
          </h2>
          <p className="mt-1 mb-4 text-xs text-zinc-500">
            Start from a behavior someone already wrote down: it fills in the sentence, examples and
            action. A starter set: the examples are illustrations, and only entries marked
            benchmarked have a dataset and a pass/fail rule behind them.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {LIBRARY.map((e) => {
              const on = active === e.id;
              return (
                <button
                  key={e.id}
                  onClick={() => onChoose(e)}
                  aria-pressed={on}
                  className={`flex flex-col rounded-lg border p-3 text-left transition ${
                    on
                      ? "border-zinc-500 bg-zinc-900"
                      : "border-zinc-800 bg-zinc-900/30 hover:border-zinc-700 hover:bg-zinc-900"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-zinc-100">{e.title}</span>
                    <span className="flex shrink-0 gap-1">
                      {e.benchmarked && (
                        <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-px text-[10px] font-medium text-emerald-300">
                          benchmarked
                        </span>
                      )}
                      <span className="rounded border border-zinc-700 px-1.5 py-px text-[10px] text-zinc-400">
                        {ACTION_TAG[e.action]}
                      </span>
                    </span>
                  </div>
                  <div className="mt-1 text-xs leading-relaxed text-zinc-400">{e.behavior}</div>
                  <div className="mt-2 text-[11px] text-zinc-600">
                    {e.examples.length} examples · {e.nonExamples.length} where it doesn&apos;t
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-1 text-xs font-medium tracking-wide text-zinc-500 uppercase">Methods</h2>
        <p className="mb-3 text-xs text-zinc-500">
          Scout picks one for you. To run a specific method, pick it here or type / in Investigate.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {OFFERED.map((p) => (
            <button
              key={p.name}
              onClick={() => onChoosePathway(p)}
              title={p.summary}
              className="rounded-md border border-zinc-800 px-2 py-1 font-mono text-xs text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
            >
              /{p.command}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
