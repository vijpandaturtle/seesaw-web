# seesaw-web

Dashboard for [Seesaw](https://github.com/vijpandaturtle/seesaw), a multi-agent
framework for automated mechanistic interpretability research.

Submit a research question, watch Scout → Lens → Quill work through it, approve
each stage, and read the artifacts each one produced.

## What this is and isn't

This is only the UI. It reads and writes the job store; it never runs an agent.
Queueing a job here inserts a row — a Python worker on the seesaw side claims it:

```bash
python -m orchestrator.src.worker --poll
```

Without a poller running, jobs sit in `queued` forever.

## Setup

Needs a seesaw checkout, since it reads that repo's job store and artifacts.

```bash
npm install
cp .env.example .env.local     # point SEESAW_OUTPUTS_DIR at your checkout
npm run dev
```

`SEESAW_OUTPUTS_DIR` defaults to `../seesaw/outputs`, so if the two repos sit
side by side you can skip the env file entirely.

## Layout

```
app/api/jobs/             list, create, and per-job read/delete
app/api/jobs/[id]/action  approve, retry, cancel
app/api/artifact/         serves plans, bundles, critiques, and plots
app/page.tsx              job list
app/jobs/[id]/            job detail
lib/db.ts                 every query — the one module that changes on deploy
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
