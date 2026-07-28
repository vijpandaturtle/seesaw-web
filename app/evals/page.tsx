"use client";

import { useState } from "react";
import useSWR from "swr";

import { PageHeader } from "@/components/shell";
import type {
  CatalogTask,
  EvalRun,
  FixtureHealth,
  GraderResult,
} from "@/lib/evals";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Payload = {
  runs: EvalRun[];
  catalog: CatalogTask[];
  fixtures: FixtureHealth | null;
  matrix: {
    criteria: string[];
    tasks: string[];
    cells: Record<string, Record<string, number | null>>;
  };
};

type Tab = "fixtures" | "matrix" | "runs" | "catalog";

export default function EvalsPage() {
  const { data } = useSWR<Payload>("/api/evals", fetcher);
  const [tab, setTab] = useState<Tab>("fixtures");

  if (!data) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10 text-sm text-zinc-500">
        Loading…
      </main>
    );
  }

  const { runs, catalog, fixtures, matrix } = data;
  const ranTasks = new Set(runs.map((r) => r.task_id));

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <PageHeader
        title="Evaluation"
        subtitle="Fixtures test the graders; tasks test the agents."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Fixtures"
          value={fixtures ? `${fixtures.ran_offline}/${fixtures.total}` : "—"}
          hint="run offline"
        />
        <Stat
          label="Mismatches"
          value={fixtures ? fixtures.mismatches.length : "—"}
          hint="grader disagreements"
          bad={Boolean(fixtures?.mismatches.length)}
        />
        <Stat
          label="Tasks"
          value={catalog.length ? `${ranTasks.size}/${catalog.length}` : "—"}
          hint="have a recorded run"
        />
        <Stat label="Runs" value={runs.length} hint="persisted" />
      </div>

      <nav className="mb-4 flex gap-1 border-b border-zinc-800">
        {(
          [
            ["fixtures", "Fixture health"],
            ["matrix", "Score matrix"],
            ["runs", "Task runs"],
            ["catalog", "Task catalog"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              tab === key
                ? "border-zinc-200 text-zinc-100"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "fixtures" && <Fixtures fixtures={fixtures} />}
      {tab === "matrix" && <Matrix matrix={matrix} />}
      {tab === "runs" && <Runs runs={runs} />}
      {tab === "catalog" && <Catalog catalog={catalog} ran={ranTasks} />}
    </main>
  );
}

function Stat({
  label,
  value,
  hint,
  bad,
}: {
  label: string;
  value: string | number;
  hint?: string;
  bad?: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2.5">
      <div
        className={`text-xl font-semibold tabular-nums ${bad ? "text-rose-300" : ""}`}
      >
        {value}
      </div>
      <div className="mt-0.5 text-xs text-zinc-500">{label}</div>
      {hint && <div className="text-[11px] text-zinc-600">{hint}</div>}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
      {children}
    </div>
  );
}

/** The grader meta-eval: canned inputs with known verdicts, run through every
 *  grader. A mismatch means a grader (or a fixture's label) is wrong. */
function Fixtures({ fixtures }: { fixtures: FixtureHealth | null }) {
  if (!fixtures) {
    return (
      <Empty>
        No fixture check yet — run{" "}
        <code className="text-zinc-400">
          seesaw fixtures --json outputs/fixture_check.json
        </code>
      </Empty>
    );
  }

  const rows = Object.entries(fixtures.coverage).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <div className="space-y-4">
      {fixtures.mismatches.length > 0 ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4">
          <p className="text-sm font-medium text-rose-200">
            {fixtures.mismatches.length} grader(s) disagreed with a fixture&apos;s
            expected verdict
          </p>
          <ul className="mt-2 space-y-1 text-xs text-rose-200/80">
            {fixtures.mismatches.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          All {fixtures.ran_offline} offline fixtures agree with their expected
          verdict.
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Grader</th>
              <th className="px-3 py-2 font-medium">Fixture labels</th>
              <th className="px-3 py-2 font-medium">Balanced</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([grader, labels]) => {
              const set = new Set(labels);
              const balanced = set.has("pass") && set.has("fail");
              const humanOnly = labels.length === 1 && labels[0] === "na";
              return (
                <tr key={grader} className="border-t border-zinc-800/60">
                  <td className="px-3 py-2 font-mono text-xs">{grader}</td>
                  <td className="px-3 py-2 text-zinc-400">
                    {labels.join(", ")}
                  </td>
                  <td className="px-3 py-2">
                    {balanced ? (
                      <span className="text-emerald-400">balanced</span>
                    ) : humanOnly ? (
                      <span className="text-zinc-500">needs human</span>
                    ) : (
                      <span className="text-amber-400">one-sided</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-600">
        A grader with only passing fixtures can&apos;t be shown to reject
        anything — that&apos;s what &ldquo;one-sided&rdquo; flags.
      </p>
    </div>
  );
}

function scoreCell(score: number | null | undefined) {
  if (score === null || score === undefined)
    return "bg-zinc-900/40 text-zinc-600";
  return score >= 0.5
    ? "bg-emerald-500/15 text-emerald-300"
    : "bg-rose-500/15 text-rose-300";
}

function Matrix({ matrix }: { matrix: Payload["matrix"] }) {
  if (!matrix.criteria.length) {
    return <Empty>No scored runs yet.</Empty>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-800">
      <table className="w-full text-xs">
        <thead className="bg-zinc-900/60 text-left text-zinc-500">
          <tr>
            <th className="sticky left-0 bg-zinc-900/60 px-3 py-2 font-medium">
              Criterion
            </th>
            {matrix.tasks.map((t) => (
              <th key={t} className="px-3 py-2 font-mono font-medium">
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.criteria.map((c) => (
            <tr key={c} className="border-t border-zinc-800/60">
              <td className="sticky left-0 bg-zinc-950 px-3 py-1.5 font-mono">
                {c}
              </td>
              {matrix.tasks.map((t) => {
                const score = matrix.cells[c]?.[t];
                return (
                  <td key={t} className="px-1 py-1">
                    <div
                      className={`rounded px-2 py-1 text-center tabular-nums ${scoreCell(score)}`}
                    >
                      {score === null || score === undefined ? "·" : score}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Runs({ runs }: { runs: EvalRun[] }) {
  if (!runs.length) {
    return (
      <Empty>
        No runs yet — execute one with{" "}
        <code className="text-zinc-400">seesaw eval &lt;task_id&gt;</code>
      </Empty>
    );
  }
  return (
    <div className="space-y-2">
      {runs.map((run) => (
        <details
          key={run.file}
          className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3"
        >
          <summary className="cursor-pointer text-sm">
            <span className="font-mono">{run.task_id}</span>{" "}
            <span className="text-xs text-zinc-500">
              target={run.target} ·{" "}
              {new Date((run.started_at ?? 0) * 1000).toLocaleString()}
            </span>
          </summary>
          <div className="mt-3 space-y-1">
            {(run.grader_results ?? []).map((g: GraderResult, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span
                  className={
                    g.score === null
                      ? "text-amber-400"
                      : g.score >= 0.5
                        ? "text-emerald-400"
                        : "text-rose-400"
                  }
                >
                  {g.score === null ? "?" : g.score >= 0.5 ? "✓" : "✕"}
                </span>
                <span className="font-mono text-zinc-300">{g.criterion}</span>
                <span className="text-zinc-600">
                  {g.detail || g.error || ""}
                </span>
              </div>
            ))}
            {run.errors?.length > 0 && (
              <p className="pt-2 text-xs text-rose-300">
                {run.errors.join("; ")}
              </p>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}

function Catalog({
  catalog,
  ran,
}: {
  catalog: CatalogTask[];
  ran: Set<string>;
}) {
  if (!catalog.length) {
    return (
      <Empty>
        No catalog yet — run{" "}
        <code className="text-zinc-400">
          seesaw eval --list --json outputs/eval_catalog.json
        </code>
      </Empty>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900/60 text-left text-xs text-zinc-500">
          <tr>
            <th className="px-3 py-2 font-medium">Task</th>
            <th className="px-3 py-2 font-medium">Target</th>
            <th className="px-3 py-2 font-medium">Graders</th>
            <th className="px-3 py-2 font-medium">Run?</th>
          </tr>
        </thead>
        <tbody>
          {catalog.map((t) => (
            <tr key={t.id} className="border-t border-zinc-800/60">
              <td className="px-3 py-2 font-mono text-xs">{t.id}</td>
              <td className="px-3 py-2 text-zinc-400">{t.target}</td>
              <td className="px-3 py-2 text-xs text-zinc-500">
                {t.graders.join(", ")}
              </td>
              <td className="px-3 py-2">
                {ran.has(t.id) ? (
                  <span className="text-emerald-400">✓</span>
                ) : (
                  <span className="text-zinc-600">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
