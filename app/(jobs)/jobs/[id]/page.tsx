"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import ReactMarkdown from "react-markdown";
import useSWR, { useSWRConfig } from "swr";

import { StageBar, StatusBadge, relativeTime } from "@/components/status";
import { AgentTrace } from "@/components/agent-trace";
import { AUTO, pathwayByName } from "@/lib/pathways";
import { MODELS, STATUS, jobParams, rerunnable, type Job } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const textFetcher = (url: string) =>
  fetch(url).then((r) => (r.ok ? r.text() : ""));
const jsonFetcher = (url: string) =>
  fetch(url).then((r) => (r.ok ? r.json() : null));

const GATE_PROMPT: Record<string, string> = {
  lens: "Approve Scout's research plan and run Lens experiments?",
  quill: "Send these experiment results to Quill for critique?",
};

type Tab =
  | "plan"
  | "results"
  | "critique"
  | "result"
  | "inputs"
  | "report"
  | "trace";

const TABS: Record<string, [Tab, string][]> = {
  research: [
    ["plan", "Research plan"],
    ["results", "Experiment results"],
    ["critique", "Critique"],
    ["trace", "Agent trace"],
  ],
  pathway: [
    ["result", "Result"],
    ["inputs", "Inputs"],
    ["report", "Report"],
    ["trace", "Agent trace"],
  ],
};

/** What a pathway job's worker writes as its bundle (seesaw worker.py). */
type PathwayOutput = {
  pathway: string;
  verdict: string | null;
  evidence: string[];
  findings: Record<string, unknown>;
  stopped_early: string | null;
  steps: string[];
  plot_paths: string[];
};

type ExperimentResult = {
  name: string;
  tool: string;
  status: string;
  summary?: string;
  error?: string;
  plot_paths?: string[];
};

export default function JobDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, mutate } = useSWR<{ job: Job }>(`/api/jobs/${id}`, fetcher, {
    refreshInterval: 3000,
  });
  const [chosenTab, setTab] = useState<Tab | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const job = data?.job;

  async function act(action: string) {
    setActionError(null);
    const res = await fetch(`/api/jobs/${id}/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setActionError(body.error ?? `${action} failed (HTTP ${res.status}).`);
      return;
    }
    mutate();
  }

  if (!job) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10 text-sm text-zinc-500">
        Loading…
      </main>
    );
  }

  const active = job.status === STATUS.RUNNING || job.status === STATUS.QUEUED;
  const isPathway = job.kind === "pathway";
  const p = jobParams(job);
  // A research job shows its pathway's inputs once Scout's have been approved.
  const tabs: [Tab, string][] = isPathway
    ? TABS.pathway
    : p.pathway_params
      ? [...TABS.research.slice(0, -1), ["inputs", "Pathway inputs"], ...TABS.research.slice(-1)]
      : TABS.research;
  const tab = chosenTab && tabs.some(([k]) => k === chosenTab) ? chosenTab : tabs[0][0];
  // A research job's pathway is Scout's starting plan; a pathway job (from
  // before Scout chose the inputs) ran it directly.
  const pathwayName = typeof p.pathway === "string" ? p.pathway : undefined;
  const pathway = pathwayName ? pathwayByName(pathwayName) : undefined;
  const rerunOf = p.rerun_of as string | undefined;
  // Under "auto", Scout chose the pathway (or none) and said why.
  const scoutChose = p.pathway_request === AUTO;
  const why = typeof p.pathway_why === "string" ? p.pathway_why : undefined;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <code className="text-xs text-zinc-500">{job.id}</code>
          <StatusBadge status={job.status} />
          {(isPathway || pathway) && (
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-zinc-300">
              /{pathway?.command ?? pathwayName ?? "pathway"}
            </span>
          )}
          {scoutChose && pathwayName && (
            <span className="text-xs text-zinc-500" title={why}>
              chosen by Scout{why && <>: {why}</>}
            </span>
          )}
          {scoutChose && !pathwayName && why && (
            <span className="text-xs text-zinc-500">Scout chose no pathway: {why}</span>
          )}
          {rerunOf && (
            <Link
              href={`/jobs/${rerunOf}`}
              className="rounded border border-zinc-700 px-1.5 py-0.5 text-xs text-zinc-400 hover:text-zinc-200"
            >
              rerun of <span className="font-mono">{rerunOf}</span>
            </Link>
          )}
          {!active && <DeleteControl jobId={job.id} />}
        </div>
        <h1 className="mt-2 text-xl font-semibold">{job.question}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <StageBar job={job} />
          <span className="font-mono text-xs text-zinc-500">{job.model}</span>
          {job.auto_approve ? (
            <span className="text-xs text-zinc-500">auto-approve on</span>
          ) : null}
          <span className="text-xs text-zinc-500">
            {relativeTime(job.created_at)}
          </span>
        </div>
      </header>

      {actionError && (
        <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {actionError}
        </p>
      )}

      {job.error && (
        <pre className="mb-6 overflow-x-auto rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
          {job.error}
        </pre>
      )}

      {job.status === STATUS.AWAITING && (
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-sm text-amber-100">
            {GATE_PROMPT[job.stage] ?? `Approve and run ${job.stage}?`}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => act("approve")}
              className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-400"
            >
              Approve
            </button>
            <button
              onClick={() => act("cancel")}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
            >
              Stop here
            </button>
          </div>
        </div>
      )}

      {job.status === STATUS.FAILED && (
        <button
          onClick={() => act("retry")}
          className="mb-6 rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-400"
        >
          Retry stage
        </button>
      )}

      {active && (
        <button
          onClick={() => act("cancel")}
          className="mb-6 rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
        >
          Cancel
        </button>
      )}

      {rerunnable(job) && !active && <RerunControl job={job} />}

      <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-zinc-800">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm ${
              tab === key
                ? "border-zinc-200 text-zinc-100"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "plan" && (
        <MarkdownArtifact
          url={job.plan_path ? `/api/artifact?job=${job.id}&kind=plan` : null}
          empty="No plan yet — Scout hasn't finished."
        />
      )}
      {tab === "results" && <Results job={job} />}
      {tab === "critique" && (
        <MarkdownArtifact
          url={job.report_path ? `/api/artifact?job=${job.id}&kind=report` : null}
          empty="No critique yet — Quill hasn't finished."
        />
      )}
      {tab === "result" && <PathwayResultView job={job} />}
      {tab === "inputs" && <PathwayInputs job={job} />}
      {tab === "report" && (
        <MarkdownArtifact
          url={job.report_path ? `/api/artifact?job=${job.id}&kind=report` : null}
          empty="No report yet — the pathway hasn't finished."
        />
      )}
      {tab === "trace" && <AgentTrace jobId={job.id} active={active} />}
    </main>
  );
}

/**
 * Delete this job and its agent trace, after a second click to confirm.
 * Not offered while the job is queued or running: cancel it first.
 */
function DeleteControl({ jobId }: { jobId: string }) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? `Delete failed (HTTP ${res.status}).`);
      setBusy(false);
      return;
    }
    await mutate("/api/jobs");
    router.push("/");
  }

  return (
    <span className="ml-auto flex items-center gap-2">
      {error && <span className="text-xs text-rose-300">{error}</span>}
      {confirming ? (
        <>
          <span className="text-xs text-zinc-400">Delete this job?</span>
          <button
            onClick={remove}
            disabled={busy}
            className="rounded border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-xs text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400 hover:text-zinc-200"
          >
            Keep
          </button>
        </>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-500 hover:border-rose-500/40 hover:text-rose-300"
        >
          Delete
        </button>
      )}
    </span>
  );
}

/**
 * Run this job's pathway again on the inputs approved for it, from Lens:
 * the reproducible part of a job, or the same experiment on another model.
 */
function RerunControl({ job }: { job: Job }) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const name = jobParams(job).pathway as string;
  const models = pathwayByName(name)?.models ?? MODELS;
  const [model, setModel] = useState(models.includes(job.model) ? job.model : models[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rerun() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/jobs/${job.id}/rerun`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? `Rerun failed (HTTP ${res.status}).`);
      return;
    }
    mutate("/api/jobs");
    router.push(`/jobs/${body.job.id}`);
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-zinc-400">
        Rerun <span className="font-mono text-zinc-300">{name}</span> on the same inputs, on
      </span>
      <select
        aria-label="Model for the rerun"
        value={model}
        onChange={(e) => setModel(e.target.value)}
        className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-300"
      >
        {models.map((m) => (
          <option key={m}>{m}</option>
        ))}
      </select>
      <button
        onClick={rerun}
        disabled={busy}
        className="rounded-md border border-zinc-700 px-3 py-1 text-sm hover:bg-zinc-800 disabled:opacity-50"
      >
        {busy ? "Starting…" : "Rerun"}
      </button>
      {error && <span className="w-full text-xs text-amber-300">{error}</span>}
    </div>
  );
}

function MarkdownArtifact({
  url,
  empty,
}: {
  url: string | null;
  empty: string;
}) {
  const { data } = useSWR(url, textFetcher);
  if (!url) return <p className="text-sm text-zinc-500">{empty}</p>;
  if (data === undefined)
    return <p className="text-sm text-zinc-500">Loading…</p>;
  return (
    <article className="prose-invert max-w-none space-y-3 text-sm [overflow-wrap:anywhere] [&_pre]:overflow-x-auto [&_pre]:[overflow-wrap:normal] leading-relaxed text-zinc-300 [&_a]:text-sky-400 [&_code]:text-zinc-200 [&_h1]:mt-6 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-5 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:font-medium [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-zinc-100">
      <ReactMarkdown>{data}</ReactMarkdown>
    </article>
  );
}

function Results({ job }: { job: Job }) {
  const { data } = useSWR(
    job.bundle_path ? `/api/artifact?job=${job.id}&kind=bundle` : null,
    jsonFetcher,
  );

  if (!job.bundle_path)
    return (
      <p className="text-sm text-zinc-500">
        No results yet — Lens hasn&apos;t finished.
      </p>
    );
  if (!data) return <p className="text-sm text-zinc-500">Loading…</p>;

  const results: ExperimentResult[] = data.results ?? [];

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-400">
        <span className="text-lg font-semibold text-zinc-100">
          {data.n_success}/{data.n_total}
        </span>{" "}
        experiments succeeded
      </p>
      {results.map((r, i) => {
        const ok = r.status === "success";
        return (
          <details
            key={i}
            className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3"
          >
            <summary className="cursor-pointer text-sm">
              <span className={ok ? "text-emerald-400" : "text-rose-400"}>
                {ok ? "✓" : "✕"}
              </span>{" "}
              {r.name}{" "}
              <code className="text-xs text-zinc-500">({r.tool})</code>
            </summary>
            <div className="mt-3 space-y-3">
              {ok ? (
                <>
                  <p className="text-sm text-zinc-300">
                    {r.summary || "(no summary)"}
                  </p>
                  {(r.plot_paths ?? []).map((p) => (
                    <img
                      key={p}
                      src={`/api/artifact?file=${encodeURIComponent(p)}`}
                      alt={r.name}
                      className="w-full rounded border border-zinc-800"
                    />
                  ))}
                </>
              ) : (
                <pre className="overflow-x-auto text-xs text-rose-300">
                  {r.error || "unknown error"}
                </pre>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}

function PathwayResultView({ job }: { job: Job }) {
  const { data } = useSWR<PathwayOutput | null>(
    job.bundle_path ? `/api/artifact?job=${job.id}&kind=bundle` : null,
    jsonFetcher,
  );

  if (!job.bundle_path) {
    return (
      <p className="text-sm text-zinc-500">
        {job.status === STATUS.FAILED
          ? "The pathway failed before producing a result — see the error above and the agent trace."
          : "No result yet — the pathway is still running."}
      </p>
    );
  }
  if (data === undefined) return <p className="text-sm text-zinc-500">Loading…</p>;
  if (data === null) return <p className="text-sm text-zinc-500">The result file is missing.</p>;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="text-xs text-zinc-500">Verdict</div>
        <div className="mt-1 font-mono text-lg text-zinc-100">{data.verdict ?? "—"}</div>
        {data.stopped_early && (
          <p className="mt-2 text-xs text-amber-300/80">Stopped early: {data.stopped_early}</p>
        )}
      </div>

      {data.evidence.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-zinc-200">Evidence</h2>
          <ul className="space-y-1.5 text-sm text-zinc-300">
            {data.evidence.map((e, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden className="text-zinc-600">–</span>
                {e}
              </li>
            ))}
          </ul>
        </section>
      )}

      {Object.keys(data.findings).length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-zinc-200">Findings</h2>
          <dl className="divide-y divide-zinc-800/60 rounded-lg border border-zinc-800 text-xs">
            {Object.entries(data.findings).map(([k, v]) => (
              <div key={k} className="grid gap-1 px-3 py-2 sm:grid-cols-[12rem_1fr]">
                <dt className="font-mono text-zinc-500">{k}</dt>
                <dd className="font-mono break-words whitespace-pre-wrap text-zinc-300">
                  {typeof v === "string" ? v : JSON.stringify(v, null, 1)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {data.steps.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-zinc-200">Steps run</h2>
          <ol className="flex flex-wrap items-center gap-1.5 text-xs">
            {data.steps.map((s, i) => (
              <li key={s} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-zinc-700">→</span>}
                <span className="rounded border border-zinc-700/60 px-2 py-0.5 font-mono text-zinc-300">
                  {s}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {data.plot_paths.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-zinc-200">Plots</h2>
          {data.plot_paths.map((p) => (
            <img
              key={p}
              src={`/api/artifact?file=${encodeURIComponent(p)}`}
              alt={p.split("/").pop() ?? "plot"}
              className="w-full rounded border border-zinc-800"
            />
          ))}
        </section>
      )}
    </div>
  );
}

/** Params that say how the job runs rather than being a pathway input. */
const NOT_INPUTS = ["pathway", "pathway_request", "pathway_why", "search", "rerun_of"];

function PathwayInputs({ job }: { job: Job }) {
  const params = jobParams(job);
  // A research job keeps Scout's approved inputs under pathway_params; an
  // older pathway job stored them alongside the pathway's name.
  const inputs =
    params.pathway_params && typeof params.pathway_params === "object"
      ? (params.pathway_params as Record<string, unknown>)
      : Object.fromEntries(
          Object.entries(params).filter(([key]) => !NOT_INPUTS.includes(key)),
        );
  const fields = pathwayByName(params.pathway)?.fields ?? [];
  const field = (key: string) => fields.find((f) => f.key === key);
  const label = (key: string) => field(key)?.label ?? key;

  return (
    <div className="space-y-4">
      {Object.entries(inputs).map(([key, value]) => (
        <section key={key}>
          <h2 className="mb-1 text-xs font-medium text-zinc-400">{label(key)}</h2>
          <pre className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-300">
            {field(key)?.text && typeof value === "string"
              ? value
              : Array.isArray(value)
                ? value.map((v) => JSON.stringify(v)).join("\n")
                : JSON.stringify(value)}
          </pre>
        </section>
      ))}
    </div>
  );
}
