"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";

import { RunnerNotice } from "@/components/shell";
import {
  PATHWAYS,
  linesOf,
  validatePathway,
  type Field,
  type Pathway,
} from "@/lib/pathways";

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
 * Quill; a leading "/" opens the pathway menu, and picking one swaps the box
 * for that pathway's inputs.
 */
export default function NewJobPage() {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { data } = useSWR<{ runner?: string }>("/api/jobs", fetcher);

  const [text, setText] = useState("");
  const [pathway, setPathway] = useState<Pathway | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
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

  const params = useMemo(() => {
    if (!pathway) return {};
    const out: Record<string, string[]> = {};
    for (const f of pathway.fields) {
      const lines = linesOf(fields[f.key] ?? "");
      if (lines.length) out[f.key] = lines;
    }
    return out;
  }, [pathway, fields]);

  const problems = pathway ? validatePathway(pathway.name, params, model) : [];
  const canStart = pathway ? problems.length === 0 : text.trim() !== "" && slash === null;
  const models = pathway?.models ?? MODELS;

  function choose(p: Pathway) {
    setPathway(p);
    setText("");
    setFields({});
    setError(null);
    if (p.models && !p.models.includes(model)) setModel(p.models[0]);
  }

  function loadExample(p: Pathway) {
    setFields(
      Object.fromEntries(
        Object.entries(p.example.params).map(([k, v]) => [k, v.join("\n")]),
      ),
    );
    setModel(p.example.model);
  }

  function clearPathway() {
    setPathway(null);
    setFields({});
    setError(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function submit() {
    if (!canStart || busy) return;
    setBusy(true);
    setError(null);
    const body = pathway
      ? { pathway: pathway.name, params, model }
      : { question: text, model, autoApprove };
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
        Ask a question and Scout, Lens and Quill research it, or type{" "}
        <kbd className="rounded border border-zinc-700 px-1 font-mono text-xs text-zinc-300">/</kbd>{" "}
        to run a pathway: a fixed, checked recipe with no LLM in the loop.
      </p>

      <div className="relative rounded-xl border border-zinc-800 bg-zinc-900/50 focus-within:border-zinc-600">
        {pathway ? (
          <PathwayForm
            pathway={pathway}
            fields={fields}
            setField={(k, v) => setFields((f) => ({ ...f, [k]: v }))}
            onClear={clearPathway}
            onExample={() => loadExample(pathway)}
            onSubmit={submit}
          />
        ) : (
          <>
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
              placeholder="What attention heads mediate indirect object identification in GPT-2 Small?"
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
          </>
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
          {!pathway && (
            <label className="flex items-center gap-1.5 text-xs text-zinc-500">
              <input
                type="checkbox"
                checked={autoApprove}
                onChange={(e) => setAutoApprove(e.target.checked)}
              />
              Run all stages without stopping
            </label>
          )}
          <span className="ml-auto hidden text-[11px] text-zinc-600 sm:inline">
            {pathway ? "⌘↵ to start" : "↵ to start · ⇧↵ new line"}
          </span>
          <button
            onClick={submit}
            disabled={!canStart || busy}
            className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 transition hover:bg-white disabled:opacity-30 max-sm:ml-auto"
          >
            {busy ? "Starting…" : pathway ? "Run pathway" : "Start research"}
          </button>
        </div>
      </div>

      {pathway && problems.length > 0 && Object.keys(params).length > 0 && (
        <ul className="mt-3 space-y-0.5 text-xs text-amber-300/80">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
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

function PathwayForm({
  pathway,
  fields,
  setField,
  onClear,
  onExample,
  onSubmit,
}: {
  pathway: Pathway;
  fields: Record<string, string>;
  setField: (key: string, value: string) => void;
  onClear: () => void;
  onExample: () => void;
  onSubmit: () => void;
}) {
  const nPrompts = linesOf(fields.prompts ?? "").length;

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSubmit();
    }
  }

  return (
    <div className="space-y-4 p-4" onKeyDown={onKey}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800 py-0.5 pr-1 pl-2 font-mono text-sm text-zinc-100">
          /{pathway.command}
          <button
            onClick={onClear}
            aria-label="Back to a research question"
            className="rounded px-1 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200"
          >
            ×
          </button>
        </span>
        <button
          onClick={onExample}
          className="ml-auto text-xs text-sky-300 hover:text-sky-200"
        >
          Load example: {pathway.example.label}
        </button>
      </div>
      <p className="text-xs text-zinc-500">{pathway.summary}</p>

      {pathway.fields.map((f, i) => (
        <FieldInput
          key={f.key}
          field={f}
          value={fields[f.key] ?? ""}
          onChange={(v) => setField(f.key, v)}
          nPrompts={nPrompts}
          autoFocus={i === 0}
        />
      ))}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  nPrompts,
  autoFocus,
}: {
  field: Field;
  value: string;
  onChange: (v: string) => void;
  nPrompts: number;
  autoFocus?: boolean;
}) {
  const n = linesOf(value).length;
  const mismatch = field.aligned && n > 0 && nPrompts > 0 && n !== nPrompts;
  const id = `field-${field.key}`;

  return (
    <div>
      <div className="mb-1 flex items-baseline gap-2">
        <label htmlFor={id} className="text-xs font-medium text-zinc-300">
          {field.label}
        </label>
        {!field.required && <span className="text-[11px] text-zinc-600">optional</span>}
        <span
          className={`ml-auto text-[11px] tabular-nums ${mismatch ? "text-amber-300/80" : "text-zinc-600"}`}
        >
          {n} {n === 1 ? "line" : "lines"}
          {field.aligned && nPrompts > 0 ? ` / ${nPrompts}` : ""}
        </span>
      </div>
      <textarea
        id={id}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={field.key === "prompts" ? 4 : field.aligned ? 3 : 2}
        spellCheck={false}
        className={`block w-full resize-y rounded-md border bg-zinc-950 px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre text-zinc-200 outline-none focus:border-zinc-600 ${
          mismatch ? "border-amber-500/40" : "border-zinc-800"
        }`}
      />
      <p className="mt-1 text-[11px] text-zinc-600">{field.help}</p>
    </div>
  );
}
