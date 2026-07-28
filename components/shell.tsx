import Link from "next/link";

/**
 * App chrome: a sticky masthead that every page sits under, so the product
 * has a name and a fixed frame rather than each page starting with its own
 * bare heading.
 */
export function Masthead() {
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-3">
        <Link href="/" className="flex items-center gap-2.5 group">
          <span
            aria-hidden
            className="grid h-7 w-7 place-items-center rounded-md bg-zinc-100 text-sm text-zinc-900"
          >
            ⧗
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-zinc-100 group-hover:text-white">
            Seesaw
          </span>
        </Link>

        <span className="hidden text-xs text-zinc-500 sm:inline">
          Automated mechanistic interpretability research
        </span>

        <nav className="ml-auto flex items-center gap-4 text-xs">
          <Link href="/" className="text-zinc-400 transition hover:text-zinc-100">
            Jobs
          </Link>
          <Link
            href="/evals"
            className="text-zinc-400 transition hover:text-zinc-100"
          >
            Evaluation
          </Link>
          <a
            href="https://github.com/vijpandaturtle/seesaw"
            target="_blank"
            rel="noreferrer"
            className="text-zinc-400 transition hover:text-zinc-100"
          >
            GitHub ↗
          </a>
        </nav>
      </div>
    </header>
  );
}

/** Page title block, so pages don't each invent their own heading style. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
          {title}
        </h1>
        {subtitle && (
          <div className="mt-1 text-sm text-zinc-500">{subtitle}</div>
        )}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}

/**
 * Where jobs get executed. In "queued" mode this app only writes rows, so it
 * says so — otherwise a job that never starts looks like a bug rather than a
 * missing worker.
 */
export function RunnerNotice({ runner }: { runner?: string }) {
  if (runner !== "queued") return null;
  return (
    <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-xs text-zinc-400">
      <span className="font-medium text-zinc-300">Queue-only mode.</span> New
      jobs wait until a worker claims them. Start one with{" "}
      <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">
        python -m orchestrator.src.worker --poll
      </code>
      , or set <code className="text-zinc-300">SEESAW_REPO_DIR</code> to run
      them from here.
    </div>
  );
}
