"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";

import { RunnerNotice } from "@/components/shell";
import { PATHWAYS, type Pathway } from "@/lib/pathways";

const MODELS = [
  "gpt2",
  "gpt2-medium",
  "gpt2-large",
  "gpt2-xl",
  "pythia-70m",
  "pythia-160m",
  "pythia-410m",
  "gpt-neo-125m",
];

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/**
 * The new-job composer. Plain text is a research question for Scout → Lens →
 * Quill; a leading "/" opens the pathway menu, and picking one attaches it to
 * the question as Scout's starting plan. Scout decides the pathway's inputs.
 */
export default function NewJobPage() {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { data } = useSWR<{ runner?: string }>("/api/jobs", fetcher);

  const [text, setText] = useState("");
  const [pathway, setPathway] = useState<Pathway | null>(null);
  const [model, setModel] = useState("gpt2");
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
        : PATHWAYS.filter(
            (p) => p.command.startsWith(slash) || p.name.startsWith(slash),
          ),
    [slash],
  );

  const canStart = text.trim() !== "" && slash === null;
  const models = pathway?.models ?? MODELS;

  function choose(p: Pathway) {
    setPathway(p);
    setText("");
    setError(null);
    if (p.models && !p.models.includes(model)) setModel(p.models[0]);
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
    const body = { question: text, model, autoApprove, pathway: pathway?.name };
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
              ? `What should Scout investigate with ${pathway.label.toLowerCase()}?`
              : "What attention heads mediate indirect object identification in GPT-2 Small?"
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
          <label className="sr-only" htmlFor="model">
            Model
          </label>
          <select
            id="model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-300"
          >
            {models.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
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
            {PATHWAYS.map((p) => (
              <button
                key={p.name}
                onClick={() => choose(p)}
                className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 text-left transition hover:border-zinc-700 hover:bg-zinc-900"
              >
                <div className="font-mono text-xs text-zinc-200">/{p.command}</div>
                <div className="mt-1 text-xs leading-relaxed text-zinc-500">{p.summary}</div>
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
