"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";

import { ModelPicker } from "@/components/model-picker";
import { RunnerNotice } from "@/components/shell";
import { DEFAULT_MODEL, incompatibility } from "@/lib/models";
import { AUTO, OFFERED, pathwayByName, type Pathway } from "@/lib/pathways";
import { AREAS, STATUS_LABEL, USE_CASES, type UseCase } from "@/lib/use-cases";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/**
 * The new-job composer. It leads with AI safety use cases (monitor, audit,
 * fix): a job to do with a model, scored by an outcome metric and compared
 * with a baseline that uses no interpretability. Picking one attaches its main pathway, which Scout
 * chooses the inputs for. A leading "/" picks a pathway (a method) directly.
 * With neither, Scout chooses a pathway itself (or none), unless the user asks
 * for no pathway at all.
 */
export default function NewJobPage() {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { data } = useSWR<{ runner?: string }>("/api/jobs", fetcher);

  const [text, setText] = useState("");
  const [pathway, setPathway] = useState<Pathway | null>(null);
  // The use case the job is for, when it was started from one.
  const [useCase, setUseCase] = useState<UseCase | null>(null);
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

  function choose(p: Pathway, forUseCase: UseCase | null = null) {
    setPathway(p);
    setUseCase(forUseCase);
    setText("");
    setError(null);
    // Keep the models this pathway can run; fall back to one it can.
    const kept = models.filter((m) => !incompatibility(p, m));
    const next = kept.length ? kept : p.models ? [p.models[0]] : [DEFAULT_MODEL];
    setModels(p.comparesModels ? next.slice(0, 1) : next);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function chooseUseCase(u: UseCase) {
    const p = pathwayByName(u.pathways[0]);
    if (p) choose(p, u);
  }

  function clearPathway() {
    setPathway(null);
    setUseCase(null);
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
      ...(useCase && { useCase: useCase.name }),
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
        Pick a safety use case below, or ask a question and Scout, Lens and Quill research it. Type{" "}
        <kbd className="rounded border border-zinc-700 px-1 font-mono text-xs text-zinc-300">/</kbd>{" "}
        to pick a method (pathway) directly; Scout picks the prompts and inputs either way.
      </p>

      <div className="relative rounded-xl border border-zinc-800 bg-zinc-900/50 focus-within:border-zinc-600">
        {pathway && (
          <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800 py-0.5 pr-1 pl-2 text-sm text-zinc-100">
              {useCase ? (
                <>
                  {useCase.title}
                  <span className="font-mono text-xs text-zinc-400">/{pathway.command}</span>
                </>
              ) : (
                <span className="font-mono">/{pathway.command}</span>
              )}
              <button
                onClick={clearPathway}
                aria-label={useCase ? "Remove the use case" : "Remove the pathway"}
                className="rounded px-1 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200"
              >
                ×
              </button>
            </span>
            {useCase ? (
              <span className="text-xs text-zinc-500">
                Scored by {useCase.metric}; compared with {useCase.baseline}.
              </span>
            ) : (
              <span className="text-xs text-zinc-500">{pathway.summary}</span>
            )}
            {useCase && useCase.status !== "runnable" && (
              <span className="basis-full text-xs text-amber-300/80">
                Not measured yet: {useCase.gap}.
              </span>
            )}
            {text === "" && (
              <button
                onClick={() => {
                  setText(useCase?.example || pathway.example);
                  inputRef.current?.focus();
                }}
                className="basis-full text-left text-xs text-zinc-400 hover:text-zinc-200"
              >
                Try: <span className="italic">{useCase?.example || pathway.example}</span>
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
              ? useCase?.example || pathway.example
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
        <UseCaseMenu onChoose={chooseUseCase} onChoosePathway={(p) => choose(p)} />
      )}
    </main>
  );
}

const STATUS_STYLE: Record<UseCase["status"], string> = {
  runnable: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  partial: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  planned: "border-zinc-700 bg-zinc-800/60 text-zinc-400",
};

function StatusPill({ status }: { status: UseCase["status"] }) {
  return (
    <span className={`shrink-0 rounded border px-1.5 py-px text-[10px] font-medium ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

/**
 * The home page's menu: safety use cases grouped by what they do (monitor,
 * audit, fix), then understanding a model, then the pathways as methods.
 */
function UseCaseMenu({
  onChoose,
  onChoosePathway,
}: {
  onChoose: (u: UseCase) => void;
  onChoosePathway: (p: Pathway) => void;
}) {
  const jobs = AREAS.filter((a) => a.name !== "understand");
  const understandArea = AREAS.find((a) => a.name === "understand");
  const understand = USE_CASES.filter((u) => u.area === "understand");

  return (
    <div className="mt-10 space-y-10">
      <section>
        <h2 className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
          Safety use cases
        </h2>
        <p className="mt-1 mb-4 text-xs text-zinc-500">
          Each is a safety job to do with a model, scored by an outcome and compared with the best
          way to do it without interpretability.
        </p>
        <div className="space-y-6">
          {jobs.map((area) => {
            const [name, what] = splitLabel(area.label);
            return (
              <div key={area.name}>
                <h3 className="mb-2 text-xs">
                  <span className="font-medium text-zinc-200">{name}</span>
                  {what && <span className="text-zinc-500"> · {what}</span>}
                </h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {USE_CASES.filter((u) => u.area === area.name).map((u) => (
                    <UseCaseCard key={u.name} useCase={u} onChoose={onChoose} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
          Understanding a model
        </h2>
        <p className="mt-1 mb-4 text-xs text-zinc-500">
          {understandArea ? splitLabel(understandArea.label)[1] : ""}
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {understand.map((u) => (
            <button
              key={u.name}
              onClick={() => onChoose(u)}
              className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 text-left transition hover:border-zinc-700 hover:bg-zinc-900"
            >
              <div className="text-sm text-zinc-200">{u.title}</div>
              <div className="mt-1 text-xs leading-relaxed text-zinc-500">{u.question}</div>
              <div className="mt-2 font-mono text-[11px] text-zinc-600">/{commandFor(u.pathways[0])}</div>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-medium tracking-wide text-zinc-500 uppercase">Methods</h2>
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

/** "Monitor: catch unsafe behavior at runtime" → ["Monitor", "catch unsafe behavior at runtime"]. */
function splitLabel(label: string): [string, string] {
  const i = label.indexOf(":");
  return i < 0 ? [label, ""] : [label.slice(0, i), label.slice(i + 1).trim()];
}

function commandFor(pathway: string | undefined): string {
  return (pathway && pathwayByName(pathway)?.command) || pathway || "";
}

function UseCaseCard({ useCase: u, onChoose }: { useCase: UseCase; onChoose: (u: UseCase) => void }) {
  const planned = u.status === "planned";
  const how = planned ? u.tools.join(" · ") : u.pathways.map((p) => `/${commandFor(p)}`).join(" · ");
  return (
    <button
      onClick={() => !planned && onChoose(u)}
      aria-disabled={planned}
      title={planned ? `Not runnable yet: ${u.gap}` : undefined}
      className={`flex flex-col rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 text-left transition ${
        planned ? "cursor-default opacity-60" : "hover:border-zinc-700 hover:bg-zinc-900"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-zinc-100">
          {u.title}
          {u.modality === "vision" && (
            <span className="ml-1.5 align-middle text-[10px] font-normal text-zinc-500">vision</span>
          )}
        </span>
        <StatusPill status={u.status} />
      </div>
      <div className="mt-1 text-xs leading-relaxed text-zinc-400">{u.question}</div>
      <dl className="mt-3 space-y-1 text-xs leading-relaxed">
        <div>
          <dt className="inline text-zinc-600">Scored by </dt>
          <dd className="inline text-zinc-400">{u.metric}</dd>
        </div>
        <div>
          <dt className="inline text-zinc-600">Compared with </dt>
          <dd className="inline text-zinc-400">{u.baseline}</dd>
        </div>
      </dl>
      {u.gap && <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">{planned ? "Needs: " : "Missing: "}{u.gap}</p>}
      {how && <div className="mt-auto pt-2 font-mono text-[11px] text-zinc-600">{how}</div>}
    </button>
  );
}
