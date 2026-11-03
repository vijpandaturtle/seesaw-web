"use client";

import { useState } from "react";
import useSWR from "swr";

import type { JobEvent } from "@/lib/types";

/** How far each level of nesting is indented, in rem. */
const INDENT = 0.8;

const jsonFetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null));

const KIND: Record<string, { label: string; cls: string }> = {
  stage: { label: "stage", cls: "text-zinc-100 border-zinc-600 bg-zinc-800" },
  node: { label: "node", cls: "text-violet-300 border-violet-500/30 bg-violet-500/10" },
  llm: { label: "llm", cls: "text-sky-300 border-sky-500/30 bg-sky-500/10" },
  tool: { label: "tool", cls: "text-teal-300 border-teal-500/30 bg-teal-500/10" },
  experiment: { label: "experiment", cls: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10" },
  pathway: { label: "pathway", cls: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10" },
  step: { label: "step", cls: "text-lime-300 border-lime-500/30 bg-lime-500/10" },
  check: { label: "check", cls: "text-amber-300 border-amber-500/30 bg-amber-500/10" },
  status: { label: "status", cls: "text-zinc-400 border-zinc-700 bg-zinc-900" },
  error: { label: "error", cls: "text-rose-300 border-rose-500/30 bg-rose-500/10" },
};

/**
 * What the job's worker did, as a tree: each stage, and inside it the agent's
 * nodes, LLM calls, tool calls, experiments and pathway steps, each with how
 * long it took and how it ended. Click a row for its data.
 */
export function AgentTrace({ jobId, active }: { jobId: string; active: boolean }) {
  const { data } = useSWR<{ events: JobEvent[] | null } | null>(
    `/api/jobs/${jobId}/events`,
    jsonFetcher,
    { refreshInterval: active ? 2000 : 0 },
  );

  if (data === undefined) return <p className="text-sm text-zinc-500">Loading…</p>;
  if (data === null) return <p className="text-sm text-rose-300">Couldn&apos;t load the agent trace.</p>;
  if (data.events === null)
    return (
      <p className="text-sm text-zinc-500">
        This job store has no agent trace yet. It&apos;s added the first time a current seesaw worker
        opens the store.
      </p>
    );
  const events = data.events;
  if (events.length === 0)
    return (
      <p className="text-sm text-zinc-500">
        {active
          ? "Nothing recorded yet — the worker hasn't started."
          : "No agent trace for this job: it ran before traces were recorded."}
      </p>
    );

  const children = new Map<number | null, JobEvent[]>();
  const ids = new Set(events.map((e) => e.id));
  for (const e of events) {
    const parent = e.parent_id != null && ids.has(e.parent_id) ? e.parent_id : null;
    children.set(parent, [...(children.get(parent) ?? []), e]);
  }
  const t0 = events[0].ts;
  const counts = countKinds(events);

  return (
    <div className="space-y-3">
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
        {counts.map(([kind, n]) => (
          <span key={kind}>
            <span className="text-zinc-300">{n}</span> {plural(KIND[kind]?.label ?? kind, n)}
          </span>
        ))}
        {counts.length > 0 && <span>· times are from the first event</span>}
      </p>
      <ol className="rounded-lg border border-zinc-800 bg-zinc-950/60 text-sm">
        {(children.get(null) ?? []).map((e) => (
          <EventRow
            key={e.id}
            event={e}
            depth={0}
            t0={t0}
            jobId={jobId}
            active={active}
            childrenOf={children}
          />
        ))}
      </ol>
    </div>
  );
}

function EventRow({
  event,
  depth,
  t0,
  jobId,
  active,
  childrenOf,
}: {
  event: JobEvent;
  depth: number;
  t0: number;
  jobId: string;
  active: boolean;
  childrenOf: Map<number | null, JobEvent[]>;
}) {
  const [open, setOpen] = useState(false);
  const kids = childrenOf.get(event.id) ?? [];
  const kind = KIND[event.kind] ?? { label: event.kind, cls: "text-zinc-400 border-zinc-700" };
  // A span still "running" on a job nothing is running is one whose worker
  // stopped (cancelled, killed, crashed) before it could close it.
  const interrupted = event.status === "running" && !active;

  return (
    <li className="border-b border-zinc-900 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="grid w-full grid-cols-[3.25rem_1fr_auto] items-baseline gap-2 px-3 py-1.5 text-left hover:bg-zinc-900/60"
      >
        <span className="font-mono text-[11px] text-zinc-600">{clock(event.ts - t0)}</span>
        <span className="flex min-w-0 items-baseline gap-2" style={{ paddingLeft: `${depth * INDENT}rem` }}>
          <StatusIcon status={event.status} interrupted={interrupted} />
          <span className={`shrink-0 rounded border px-1.5 py-px font-mono text-[10px] ${kind.cls}`}>
            {kind.label}
          </span>
          <span className="min-w-0 truncate font-mono text-xs text-zinc-200 sm:shrink-0">{event.name}</span>
          {event.summary && (
            <span
              className={`hidden min-w-0 truncate text-xs sm:inline ${event.status === "error" ? "text-rose-300/90" : "text-zinc-500"}`}
            >
              {event.summary}
            </span>
          )}
        </span>
        <span className="font-mono text-[11px] text-zinc-500">
          {interrupted
            ? "interrupted"
            : event.status === "running"
              ? `${duration((Date.now() / 1000 - event.ts) * 1000)}…`
              : event.duration_ms != null
                ? duration(event.duration_ms)
                : ""}
        </span>
      </button>
      {open && <EventDetail jobId={jobId} event={event} depth={depth} />}
      {kids.length > 0 && (
        <ol>
          {kids.map((k) => (
            <EventRow
              key={k.id}
              event={k}
              depth={depth + 1}
              t0={t0}
              jobId={jobId}
              active={active}
              childrenOf={childrenOf}
            />
          ))}
        </ol>
      )}
    </li>
  );
}

function EventDetail({ jobId, event, depth }: { jobId: string; event: JobEvent; depth: number }) {
  const { data } = useSWR<{ event: JobEvent } | null>(
    `/api/jobs/${jobId}/events/${event.id}`,
    jsonFetcher,
  );
  const indent = { marginLeft: `calc(3.75rem + ${depth * INDENT}rem)` };

  if (data === undefined)
    return <p className="px-3 pb-2 text-xs text-zinc-500" style={indent}>Loading…</p>;
  const d = data?.event.data;
  if (!d) return <p className="px-3 pb-2 text-xs text-zinc-500" style={indent}>No data recorded.</p>;

  const { prompt, response, tool_calls, usage, input, output, traceback, plot_paths, ...rest } =
    d as Record<string, unknown>;
  const calls = Array.isArray(tool_calls) ? tool_calls : [];
  const plots = Array.isArray(plot_paths) ? (plot_paths as string[]) : [];

  return (
    <div className="space-y-2 px-3 pb-3" style={indent}>
      {typeof prompt === "string" && prompt && <Block label="Prompt (last message)" text={prompt} />}
      {typeof response === "string" && response && <Block label="Response" text={response} />}
      {calls.length > 0 && <Block label="Tool calls requested" text={pretty(calls)} />}
      {usage && Object.keys(usage as object).length > 0 ? <Block label="Tokens" text={pretty(usage)} /> : null}
      {input !== undefined && <Block label="Input" text={typeof input === "string" ? input : pretty(input)} />}
      {output !== undefined && <Block label="Output" text={String(output)} />}
      {typeof traceback === "string" && <Block label="Traceback" text={traceback} tone="error" />}
      {Object.keys(rest).length > 0 && <Block label="Data" text={pretty(rest)} />}
      {plots.map((p) => (
        <img
          key={p}
          src={`/api/artifact?file=${encodeURIComponent(p)}`}
          alt={p.split("/").pop() ?? "plot"}
          className="w-full max-w-2xl rounded border border-zinc-800"
        />
      ))}
    </div>
  );
}

function Block({ label, text, tone }: { label: string; text: string; tone?: "error" }) {
  return (
    <section>
      <h3 className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</h3>
      <pre
        className={`max-h-80 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-2 text-xs leading-relaxed whitespace-pre-wrap break-words ${
          tone === "error" ? "text-rose-300" : "text-zinc-300"
        }`}
      >
        {text}
      </pre>
    </section>
  );
}

function StatusIcon({ status, interrupted }: { status: string; interrupted: boolean }) {
  if (interrupted) return <span className="text-amber-400" title="interrupted">⊘</span>;
  if (status === "running") return <span className="animate-pulse text-sky-400" title="running">◐</span>;
  if (status === "error") return <span className="text-rose-400" title="failed">✕</span>;
  return <span className="text-emerald-500/80" title="ok">✓</span>;
}

function countKinds(events: JobEvent[]): [string, number][] {
  const order = ["llm", "tool", "node", "experiment", "step", "check", "error"];
  const n = new Map<string, number>();
  for (const e of events) n.set(e.kind, (n.get(e.kind) ?? 0) + 1);
  return order.filter((k) => n.has(k)).map((k) => [k, n.get(k)!]);
}

function plural(label: string, n: number): string {
  if (label === "llm") return n === 1 ? "LLM call" : "LLM calls";
  if (label === "tool") return n === 1 ? "tool call" : "tool calls";
  return n === 1 ? label : `${label}s`;
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function duration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
