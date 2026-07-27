# seesaw-web

Dashboard for [Seesaw](https://github.com/vijpandaturtle/seesaw), a multi-agent
framework for automated mechanistic interpretability research.

Submit a research question, watch Scout → Lens → Quill work through it, approve
each stage, and read the artifacts each one produced.

## What this is and isn't

This is the UI. The agents themselves live in the seesaw repo, and a job is
always executed by a Python worker process — never by this app. What differs is
who starts that worker.

**Local mode** — set `SEESAW_REPO_DIR` and the dashboard launches a worker
itself whenever you create or approve a job. Nothing else to run.

**Queue-only mode** — leave it unset, as you would when this is deployed away
from the agents. Jobs are written as `queued` and wait for a poller:

```bash
python -m orchestrator.src.worker --poll
```

The dashboard says which mode it's in, so a job that never starts reads as a
missing worker rather than a bug.

## Setup

Needs a seesaw checkout, since it reads that repo's job store and artifacts.

```bash
npm install
cp .env.example .env.local     # point it at your checkout
npm run dev
```

`SEESAW_OUTPUTS_DIR` defaults to `../seesaw/outputs`, so side-by-side checkouts
need it only for `SEESAW_REPO_DIR`.

## Layout

```
app/api/jobs/             list, create, and per-job read/delete
app/api/jobs/[id]/action  approve, retry, cancel
app/api/artifact/         serves plans, bundles, critiques, and plots
app/page.tsx              job list
app/jobs/[id]/            job detail
lib/db.ts                 every query — the one module that changes on deploy
lib/worker.ts             starting a worker, when running alongside the agents
lib/types.ts              shapes and constants shared with client components
```

`lib/types.ts` is separate from `lib/db.ts` on purpose: a client component
importing a value from the driver module would pull SQLite into the browser
bundle.

## Deploying

SQLite only works while this app and the workers share a machine. Hosting the
UI apart from the agents means replacing `lib/db.ts` with a hosted database
(Turso keeps the SQL identical; Postgres needs placeholder changes) and serving
artifacts from object storage rather than local paths.
