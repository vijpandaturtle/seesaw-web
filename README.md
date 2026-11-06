# seesaw-web

Dashboard for [Seesaw](https://github.com/vijpandaturtle/seesaw), a multi-agent
framework for automated mechanistic interpretability research.

Ask a research question and watch Scout → Lens → Quill work through it,
optionally typing `/` to give Scout one of seesaw's pathways to start from.
Approve each stage and read what each produced.

## What this is and isn't

This is the UI. The agents live in the seesaw repo, and a job is always executed
by a Python worker — never by this app, which only reads and writes the job
store. What differs between setups is who starts that worker.

| Mode | When | Set |
|---|---|---|
| **Modal** | Deployed. The API spawns a stage on Modal and returns immediately while it runs for minutes or hours | `MODAL_RUN_STAGE_URL` |
| **Local** | Running beside a seesaw checkout; the API launches a worker process itself | `SEESAW_REPO_DIR` |
| **Queue-only** | Neither. Jobs sit in `queued` until something claims them | — |

Queue-only needs a poller on the seesaw side:

```bash
python -m orchestrator.src.worker --poll
```

The dashboard shows which mode it's in, so a job that never starts reads as a
missing runner rather than a bug.

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set `DATABASE_URL` to the same Postgres job store the seesaw checkout uses.
The dashboard reads only Postgres, so jobs a worker writes to its local SQLite
file (no `DATABASE_URL`, or `SEESAW_DB_PATH` set) never show here. To try jobs
without mixing them into the live table, set the same `SEESAW_DB_SCHEMA` on
both sides. `SEESAW_OUTPUTS_DIR` defaults to `../seesaw/outputs`, so
side-by-side checkouts need nothing else. Set `SEESAW_REPO_DIR` as well and
creating a job will actually run it.

## Starting a job

The home page is a composer, with past jobs in a sidebar beside it:

- **Plain text** is a research question for Scout → Lens → Quill.
- **`/`** attaches a pathway to the question: `/circuit-discovery`,
  `/attribute-audit`, `/feature-explain`. It's still a Scout → Lens → Quill job;
  the pathway is stored as `{"pathway": name}` in the job's `params`, and Scout
  starts its plan from it and decides the prompts and answer tokens itself.

`lib/pathways.ts` mirrors `seesaw/pathways/catalog.py` (names, inputs). Change
both together. Jobs need the `kind` and `params` columns, which the seesaw side
adds the first time a current worker opens the store. Older pathway jobs, which
took hand-entered inputs and ran as one stage, still render on their job pages;
nothing creates them any more.

Once Scout's inputs for a pathway are approved, the job page offers **Rerun**:
a new job, queued at Lens with the same plan and inputs, optionally on another
model (`POST /api/jobs/<id>/rerun` with `{ model }`). Scout doesn't run again,
so the pathway's verdict reproduces; the worker checks the inputs against the
new model's tokenizer before running anything.

## Following a job

Each job page has an **Agent trace** tab: what the worker did, as a tree, read
from seesaw's `job_events` table and refreshed every two seconds while the job
runs. Each stage holds the agent's nodes, and each node its LLM calls (model,
tokens, prompt, answer) and tool calls (input, output); Lens's experiments and
a pathway's steps show their numbers and plots. Click a row for its data:
`/api/jobs/<id>/events` lists a job's events without it, and
`/api/jobs/<id>/events/<eventId>` returns one with it.

## Environment

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres job store, the same one the seesaw workers use. Required |
| `SEESAW_DB_SCHEMA` | Use the jobs table in this schema, like the Python side does: an isolated copy for trial runs |
| `SEESAW_OUTPUTS_DIR` | A seesaw checkout's `outputs/`, for reading artifacts locally |
| `SEESAW_REPO_DIR` | Enables local mode — the API spawns a worker itself |
| `MODAL_RUN_STAGE_URL` | Modal's `start` endpoint; enables Modal mode |
| `MODAL_ARTIFACT_URL` | Modal's artifact endpoint, proxied by `/api/artifact` |
| `MODAL_INVOKE_TOKEN` | Must match the runner's `RUNNER_KEY` |
| `WRITE_KEY` | Gates every write. Unset, everything is allowed |

## Reads open, writes gated

Deployed, the dashboard is public to read and gated to change: queueing a job
spends real Anthropic credit and GPU time, and deleting one destroys a research
record.

`middleware.ts` enforces that by HTTP method rather than per route, so a new
mutating endpoint is protected by default instead of by remembering. Hold the
key by visiting `?key=…` once, which stores a cookie, or send an `x-seesaw-key`
header. Unset `WRITE_KEY` and the gate is inert, which is what local development
wants.

## Model Atlas

`/models` is a read-only gallery of interpretability datasheets, one per model;
`/models/<slug>` shows one, with its provenance (weights revision, dtype, hooks,
preprocessing) above every section. The spec is
[docs/model-atlas-spec.md](docs/model-atlas-spec.md).

seesaw writes `outputs/datasheets/<slug>/datasheet.json`, and that file is all
this app reads. Sections render by their `view` (`metrics`, `layer_curve`,
`heatmap`, `table`, `note`), so new probes need no change here. Locally the
datasheets come from the seesaw checkout, falling back to the committed
snapshot when it has none yet; deployed they come from `data/datasheets/`.
Refresh that with:

```bash
./scripts/sync-datasheet-data.sh
```

The two `example-*` datasheets in `data/` hold invented numbers and carry an
**Example data** badge. They stay until real datasheets replace them.

## Layout

```
app/api/jobs/             list, create, and per-job read/delete
app/api/jobs/[id]/action  approve, retry, cancel
app/api/artifact/         plans, bundles, critiques, plots — proxied to Modal when deployed
app/api/models/           datasheet index and per-model datasheet
app/(jobs)/page.tsx       new-job composer (questions, optional /pathway)
app/(jobs)/jobs/[id]/     job detail
app/(jobs)/layout.tsx     the past-jobs sidebar around both
lib/pathways.ts           pathway catalog, mirrored from seesaw
app/models/               Model Atlas gallery and datasheet pages
components/datasheet-views.tsx  section renderers (inline SVG charts)
lib/db.ts                 every query against the job store
lib/runner.ts             choosing and invoking a runner
lib/paths.ts              local checkout vs committed snapshot
lib/types.ts              shapes and constants shared with client components
lib/datasheets.ts         reading datasheet.json files
lib/datasheet-types.ts    datasheet shapes and per-view validation
middleware.ts             the write gate
```

`lib/types.ts` is separate from `lib/db.ts` deliberately: a client component
importing a value from the driver module would pull the database driver into the
browser bundle.

## Deploying

The full runbook — Neon, both Modal apps, secrets, and the Vercel environment —
lives in the seesaw repo:
[DOCS.md → Deployment](https://github.com/vijpandaturtle/seesaw/blob/main/DOCS.md#deployment).

Two things specific to this app:

- **Use the project alias, not the deployment URL.** Vercel forces its own SSO
  on `<project>-<hash>-<team>.vercel.app` whatever your settings, so the write
  gate never runs there. `vercel alias ls` shows the stable one.
- **`data/` must be refreshed and committed** for the models page to show
  anything new after seesaw re-runs. A deployment cannot reach the machine that ran it.
