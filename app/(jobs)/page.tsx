"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";

import { ModelPicker } from "@/components/model-picker";
import { RunnerNotice } from "@/components/shell";
import { DEFAULT_MODEL, incompatibility } from "@/lib/models";
import { AUTO, OFFERED, type Pathway } from "@/lib/pathways";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/**
 * The new-job composer. Plain text is a research question for Scout → Lens →
 * Quill; a leading "/" opens the pathway menu, and picking one attaches it to
 * the question as Scout's starting plan. Scout decides the pathway's inputs.
 * With none picked, Scout chooses a pathway itself (or none), unless the user
 * asks for no pathway at all.
 */
export default function NewJobPage() {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { data } = useSWR<{ runner?: string }>("/api/jobs", fetcher);

  const [text, setText] = useState("");
  const [pathway, setPathway] = useState<Pathway | null>(null);
  // Without a picked pathway: let Scout choose one (AUTO), or run none.
  const [scoutChooses, setScoutChooses] = useState(true);
  const [search, setSearch] = useState(false);
  // Every model the job runs on; model_diffing compares the first with `otherModel`.
  const [models, setModels] = useState<string[]>([DEFAULT_MODEL]);
  const [otherModel, setOtherModel] = useState<string[]>([]);
  const [autoApprove, setAutoApprove] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // The slash menu: open while the box holds a single "/word".
  const slash = !pathway && /^\/[\w-]*$/.test(text) ? text.slice(1).toLowerCase() : null;
  const matches = useMemo(
    () =>
      slash === null
        ? []
        : OFFERED.filter(
            (p) => p.command.startsWith(slash) || p.name.startsWith(slash),
          ),
    [slash],
  );

  const compares = Boolean(pathway?.comparesModels);
  const blocked = models.map((m) => incompatibility(pathway, m)).find(Boolean) ?? null;
  const canStart =
    text.trim() !== "" && slash === null && models.length > 0 && !blocked &&
    (!compares || otherModel.length === 1);

  function choose(p: Pathway) {
    setPathway(p);
    setText("");
    setError(null);
    // Keep the models this pathway can run; fall back to one it can.
    const kept = models.filter((m) => !incompatibility(p, m));
    const next = kept.length ? kept : p.models ? [p.models[0]] : [DEFAULT_MODEL];
    setModels(p.comparesModels ? next.slice(0, 1) : next);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function clearPathway() {
    setPathway(null);
    setError(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function submit() {
    if (!canStart || busy) return;
    setBusy(true);
    setError(null);
    const body = {
      question: text,
      models,
      ...(compares && { otherModel: otherModel[0] }),
      autoApprove,
      pathway: pathway?.name ?? (scoutChooses ? AUTO : undefined),
      search,
    };
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(payload.error ?? `Could not start the job (HTTP ${res.status}).`);
      return;
    }
    mutate("/api/jobs");
    router.push(`/jobs/${payload.job.id}`);
  }

  function onQuestionKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (slash !== null && matches.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        setHighlight((h) => (h + step + matches.length) % matches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        choose(matches[Math.min(highlight, matches.length - 1)]);
        return;
      }
      if (e.key === "Escape") {
        setText("");
        return;
      }
    }
    if (e.key === "Backspace" && pathway && text === "") {
      e.preventDefault();
      clearPathway();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
      <RunnerNotice runner={data?.runner} />

      <h1 className="mb-1 text-xl font-semibold tracking-tight text-zinc-100">
        What do you want to find out?
      </h1>
      <p className="mb-6 text-sm text-zinc-500">
        Ask a question and Scout, Lens and Quill research it. Type{" "}
        <kbd className="rounded border border-zinc-700 px-1 font-mono text-xs text-zinc-300">/</kbd>{" "}
        to give Scout a pathway to start from; it picks the prompts and inputs itself.
        Otherwise Scout chooses a pathway that fits, or none.
      </p>

      <div className="relative rounded-xl border border-zinc-800 bg-zinc-900/50 focus-within:border-zinc-600">
        {pathway && (
          <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800 py-0.5 pr-1 pl-2 font-mono text-sm text-zinc-100">
              /{pathway.command}
              <button
                onClick={clearPathway}
                aria-label="Remove the pathway"
                className="rounded px-1 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200"
              >
                ×
              </button>
            </span>
            <span className="text-xs text-zinc-500">{pathway.summary}</span>
            {text === "" && (
              <button
                onClick={() => {
                  setText(pathway.example);
                  inputRef.current?.focus();
                }}
                className="basis-full text-left text-xs text-zinc-400 hover:text-zinc-200"
              >
                Try: <span className="italic">{pathway.example}</span>
              </button>
            )}
          </div>
        )}
        <label htmlFor="question" className="sr-only">
          Research question, or / for a pathway
        </label>
        <textarea
          id="question"
          ref={inputRef}
          autoFocus
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setHighlight(0);
          }}
          onKeyDown={onQuestionKey}
          placeholder={
            pathway
              ? pathway.example
              : "What attention heads mediate indirect object identification in Gemma-2-2B?"
          }
          rows={3}
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
              <li className="px-3 py-2 text-sm text-zinc-500">No pathway matches.</li>
            ) : (
              matches.map((p, i) => (
                <li
                  key={p.name}
                  role="option"
                  aria-selected={i === highlight}
                  onMouseEnter={() => setHighlight(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(p);
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

        <div className="flex flex-wrap items-center gap-3 border-t border-zinc-800/80 px-3 py-2.5">
          <div className={compares ? "flex w-full flex-wrap items-center gap-2" : "w-full"}>
            {compares && <span className="text-xs text-zinc-500">Base</span>}
            <div className={compares ? "min-w-48 flex-1" : ""}>
              <ModelPicker
                value={models}
                onChange={setModels}
                pathway={pathway}
                max={compares ? 1 : undefined}
                label={compares ? "Base model" : "Models"}
              />
            </div>
            {compares && (
              <>
                <span className="text-xs text-zinc-500">vs changed</span>
                <div className="min-w-48 flex-1">
                  <ModelPicker
                    value={otherModel}
                    onChange={setOtherModel}
                    max={1}
                    label="Changed model"
                  />
                </div>
              </>
            )}
          </div>
          {blocked && <span className="w-full text-xs text-amber-300">{blocked}.</span>}
          {!pathway && (
            <>
              <label className="sr-only" htmlFor="pathway-mode">
                Pathway
              </label>
              <select
                id="pathway-mode"
                value={scoutChooses ? "auto" : "none"}
                onChange={(e) => setScoutChooses(e.target.value === "auto")}
                className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-300"
              >
                <option value="auto">Scout chooses a pathway, or none</option>
                <option value="none">No pathway</option>
              </select>
            </>
          )}
          <label className="flex items-center gap-1.5 text-xs text-zinc-500">
            <input
              type="checkbox"
              checked={search}
              onChange={(e) => setSearch(e.target.checked)}
            />
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
          <span className="ml-auto hidden text-[11px] text-zinc-600 sm:inline">
            ↵ to start · ⇧↵ new line
          </span>
          <button
            onClick={submit}
            disabled={!canStart || busy}
            className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 transition hover:bg-white disabled:opacity-30 max-sm:ml-auto"
          >
            {busy ? "Starting…" : "Start research"}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {error}
        </p>
      )}

      {!pathway && slash === null && (
        <section className="mt-10">
          <h2 className="mb-3 text-xs font-medium tracking-wide text-zinc-500 uppercase">
            Pathways
          </h2>
          <div className="grid gap-2 sm:grid-cols-3">
            {OFFERED.map((p) => (
              <button
                key={p.name}
                onClick={() => choose(p)}
                className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 text-left transition hover:border-zinc-700 hover:bg-zinc-900"
              >
                <div className="font-mono text-xs text-zinc-200">/{p.command}</div>
                <div className="mt-1 text-xs leading-relaxed text-zinc-500">{p.summary}</div>
                <div className="mt-2 text-xs leading-relaxed text-zinc-400 italic">
                  e.g. {p.example}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
