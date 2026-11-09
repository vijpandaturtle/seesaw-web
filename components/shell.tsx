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
          Interpretability for AI safety, measured against baselines.
        </span>

        <nav className="ml-auto flex items-center gap-3 text-xs whitespace-nowrap sm:gap-4">
          <a
            href="https://github.com/vijpandaturtle/seesaw"
            target="_blank"
            rel="noreferrer"
            aria-label="Seesaw on GitHub"
            title="Seesaw on GitHub"
            className="text-zinc-400 transition hover:text-zinc-100"
          >
            <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
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
