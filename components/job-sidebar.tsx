"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";

import { relativeTime } from "@/components/status";
import { pathwayByName } from "@/lib/pathways";
import { STATUS, jobParams, type Job } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/** Status as a coloured dot, so a long list scans at a glance. */
const DOT: Record<string, string> = {
  [STATUS.QUEUED]: "bg-zinc-500",
  [STATUS.RUNNING]: "bg-sky-400 animate-pulse",
  [STATUS.AWAITING]: "bg-amber-400",
  [STATUS.DONE]: "bg-emerald-400",
  [STATUS.FAILED]: "bg-rose-400",
  [STATUS.CANCELLED]: "bg-zinc-700",
};

type Group = { label: string; jobs: Job[] };

/**
 * Jobs that need you first, then what's running, then the rest by day — the
 * order you'd want to act on them in, not just recency.
 */
function group(jobs: Job[]): Group[] {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const today = startOfToday.getTime() / 1000;

  const needsYou = jobs.filter((j) => j.status === STATUS.AWAITING);
  const running = jobs.filter(
    (j) => j.status === STATUS.RUNNING || j.status === STATUS.QUEUED,
  );
  const rest = jobs.filter((j) => !needsYou.includes(j) && !running.includes(j));
  return [
    { label: "Needs you", jobs: needsYou },
    { label: "Running", jobs: running },
    { label: "Today", jobs: rest.filter((j) => j.created_at >= today) },
    { label: "Earlier", jobs: rest.filter((j) => j.created_at < today) },
  ].filter((g) => g.jobs.length > 0);
}

function kindLabel(job: Job): string {
  if (job.kind !== "pathway") return "research";
  return pathwayByName(jobParams(job).pathway)?.command ?? "pathway";
}

function JobList({
  onNavigate,
  onHide,
  hideLabel,
}: {
  onNavigate?: () => void;
  /** Collapses the column (desktop) or closes the drawer (phone). */
  onHide: () => void;
  hideLabel: string;
}) {
  const pathname = usePathname();
  const { data, error } = useSWR<{ jobs: Job[] }>("/api/jobs", fetcher, {
    refreshInterval: 3000,
  });
  const jobs = data?.jobs ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 p-3">
        <Link
          href="/"
          onClick={onNavigate}
          className={`flex min-w-0 flex-1 items-center gap-2 rounded-md border px-3 py-2 text-sm transition ${
            pathname === "/"
              ? "border-zinc-700 bg-zinc-800/60 text-zinc-100"
              : "border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900"
          }`}
        >
          <span aria-hidden className="text-zinc-500">
            +
          </span>
          New job
        </Link>
        <button
          onClick={onHide}
          aria-label={hideLabel}
          title={hideLabel}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-zinc-500 transition hover:bg-zinc-900 hover:text-zinc-100"
        >
          <span aria-hidden>«</span>
        </button>
      </div>

      <nav aria-label="Past jobs" className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {error ? (
          <p className="px-2 text-xs text-rose-300/80">Couldn&apos;t load jobs.</p>
        ) : !data ? (
          <p className="px-2 text-xs text-zinc-600">Loading…</p>
        ) : jobs.length === 0 ? (
          <p className="px-2 text-xs text-zinc-600">
            No jobs yet. Ask a question or type <code>/</code> to run a pathway.
          </p>
        ) : (
          group(jobs).map((g) => (
            <div key={g.label} className="mb-3">
              <h3 className="px-2 pb-1 text-[11px] font-medium tracking-wide text-zinc-600 uppercase">
                {g.label}
              </h3>
              <ul>
                {g.jobs.map((job) => {
                  const active = pathname === `/jobs/${job.id}`;
                  return (
                    <li key={job.id}>
                      <Link
                        href={`/jobs/${job.id}`}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={`group flex gap-2.5 rounded-md px-2 py-1.5 transition ${
                          active ? "bg-zinc-800/80" : "hover:bg-zinc-900"
                        }`}
                      >
                        <span
                          aria-hidden
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[job.status] ?? "bg-zinc-600"}`}
                        />
                        <span className="min-w-0">
                          <span
                            className={`block truncate text-[13px] ${
                              active ? "text-zinc-100" : "text-zinc-300 group-hover:text-zinc-100"
                            }`}
                          >
                            {job.question}
                          </span>
                          <span className="block truncate text-[11px] text-zinc-600">
                            <span className="font-mono">{kindLabel(job)}</span> ·{" "}
                            {job.model} · {relativeTime(job.created_at)}
                          </span>
                        </span>
                        <span className="sr-only">{job.status}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </nav>
    </div>
  );
}

const COLLAPSED_KEY = "seesaw.jobSidebar.collapsed";

/** Whether this viewer last left the column collapsed; storage may be blocked. */
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // Not remembered, but the toggle still works for this visit.
  }
}

/**
 * Past jobs beside every Jobs page, like a chat app's history. A fixed column
 * from md up, which collapses to a narrow rail and remembers that per viewer;
 * below md, a button opens it as a drawer.
 */
export function JobSidebar() {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  // Read after mount so the server render and first client render agree.
  useEffect(() => setCollapsed(readCollapsed()), []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      writeCollapsed(!c);
      return !c;
    });
  };

  // Close the drawer when the route changes underneath it (back button, etc.).
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <aside
        className={`sticky top-[53px] hidden h-[calc(100vh-53px)] shrink-0 border-r border-zinc-800/80 md:block ${
          collapsed ? "w-12" : "w-64"
        }`}
      >
        {collapsed ? (
          <div className="flex flex-col items-center gap-2 py-3">
            <button
              onClick={toggleCollapsed}
              aria-label="Expand past jobs"
              aria-expanded={false}
              title="Expand past jobs"
              className="grid h-9 w-9 place-items-center rounded-md text-zinc-500 transition hover:bg-zinc-900 hover:text-zinc-100"
            >
              <span aria-hidden>»</span>
            </button>
            <Link
              href="/"
              aria-label="New job"
              title="New job"
              className={`grid h-9 w-9 place-items-center rounded-md border transition ${
                pathname === "/"
                  ? "border-zinc-700 bg-zinc-800/60 text-zinc-100"
                  : "border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-100"
              }`}
            >
              <span aria-hidden>+</span>
            </Link>
          </div>
        ) : (
          <JobList onHide={toggleCollapsed} hideLabel="Collapse past jobs" />
        )}
      </aside>

      <div className="sticky top-[53px] z-10 border-b border-zinc-800/80 bg-zinc-950/90 px-4 py-2 backdrop-blur md:hidden">
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-100"
          aria-expanded={open}
        >
          <span aria-hidden>☰</span> Past jobs
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-30 md:hidden" role="dialog" aria-label="Past jobs">
          <button
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/60"
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-zinc-800 bg-zinc-950">
            <JobList
              onNavigate={() => setOpen(false)}
              onHide={() => setOpen(false)}
              hideLabel="Close past jobs"
            />
          </div>
        </div>
      )}
    </>
  );
}
