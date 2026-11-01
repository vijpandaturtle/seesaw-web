# Model Atlas: interpretability datasheets for open models

**Status:** draft spec, stage 1 only · **Repo:** seesaw-web · **Depends on:** seesaw's [research methodology](https://github.com/vijpandaturtle/seesaw/blob/main/docs/research-methodology.md) (draft, not built), a seesaw datasheet job (not built yet), lever `Result`/`Provenance` (drafted in lever-interp, uncommitted)

## Why

Model cards describe what a model is for. Almost nothing publishes what's going on *inside* a
model in a form you can compare across models: where image information enters the language
model, which heads matter, how two encoders differ. The Model Atlas is a public, read-only
gallery of interpretability datasheets, one per model, produced by seesaw and displayed here.

What makes datasheets comparable is provenance. Every number carries the weights revision,
dtype, hook points and preprocessing it came from. The CLIP vs SigLIP preprocessing confound in
lever-interp is the reason preprocessing is shown up front, not buried.

Longer term this could become a community gallery (submissions by PR, then verified reruns).
Stage 1 does none of that. It is a gallery of datasheets the maintainer produced, which is
useful on its own and tests the format.

## Where the work happens

| Layer | Does | Doesn't |
|---|---|---|
| lever | Runs techniques, returns `Result` dirs with `Provenance` | Decide what a datasheet contains |
| seesaw | Datasheet job ("survey mode" in the [methodology](https://github.com/vijpandaturtle/seesaw/blob/main/docs/research-methodology.md)): runs the standard tier probes, writes `datasheet.json` | Render anything |
| **seesaw-web** (this spec) | Reads `datasheet.json` and renders it | Run models, read tensors, compute anything |

Same pattern as `/evals`: Python writes files, this app reads them. Locally from the seesaw
checkout, deployed from a committed snapshot in `data/`.

### Relationship to Jobs

The two tabs are organised along different lines. **Jobs** is organised by run: every research
question and what it found. **Models** is organised by model: one standing datasheet per model,
whatever runs produced it.

They connect through the seesaw side. The datasheet job is meant to be a seesaw job type, so
making a datasheet shows up in Jobs like any other run, and the Models tab shows the latest
finished datasheet for each model. When `datasheet.json` carries a `job_id`, the datasheet
page links back to that job. Stage 1 doesn't depend on the job type existing: examples and
hand-produced datasheets have no `job_id`, and the link is simply absent.

An archive view or "finished only" filter for the Jobs list is a separate improvement and is
not part of this spec.

## Data contract

seesaw writes one directory per model:

```
outputs/datasheets/<slug>/datasheet.json    ← the only file this app reads
outputs/datasheets/<slug>/results/...       ← lever Result dirs (JSON + safetensors); ignored here
```

`datasheet.json` holds display-ready data only, small enough to commit. Raw tensors stay on the
Python side.

```jsonc
{
  "datasheet_schema": 1,
  "slug": "clip-vit-b-32",
  "title": "CLIP ViT-B/32",
  "status": "published",              // "published" | "example"
  "summary": "One paragraph, markdown.",
  "generated_at": "2026-10-26T12:00:00Z",
  "job_id": "…",                      // optional; the seesaw job that produced this datasheet
  "provenance": {                     // lever Provenance, verbatim
    "model_id": "openai/clip-vit-base-patch32",
    "revision": "3d74acf9a28c67741b2f4f2ea7635f0aaf6f0268",   // null if not from the hub
    "model_type": "clip",
    "adapter": "CLIPAdapter",
    "capabilities": ["per_head"],
    "dtype": "float32",
    "hooks": ["vision.blocks.*.resid_post"],
    "preprocessing": { "image_mean": [0.481, 0.458, 0.408], "crop_size": { "height": 224, "width": 224 } },  // null = unknown
    "seed": 0,
    "versions": { "python": "3.12.4", "lever-interp": "0.1.0", "torch": "2.5.1", "transformers": "4.51.0" },
    "created_at": "2026-10-26T11:58:02+00:00"
  },
  "sections": [
    {
      "id": "patch-norms",            // stable across models; the compare view joins on it
      "title": "Residual norm by layer",
      "tier": 1,                      // optional; sections are grouped by tier when present
      "view": "layer_curve",          // decides the renderer (see below)
      "caption": "Markdown. What this shows and how to read it.",
      "data": { /* shape depends on view */ },
      "source": "results/patch_norms" // optional; path of the lever Result it came from
    }
  ]
}
```

What each tier means belongs to seesaw: it's the evidence tier from the [research methodology](https://github.com/vijpandaturtle/seesaw/blob/main/docs/research-methodology.md) (1 descriptive, 2 estimate, 3 causal, 4 controlled). That methodology is a draft and seesaw doesn't implement it yet, so until it does, datasheets are hand-made or examples. This app only uses `tier` to group and order sections.

### Views

The app renders by `view`, not by technique, so seesaw can add probes without a web change.

| `view` | `data` | Renders as |
|---|---|---|
| `metrics` | `{ items: [{ label, value, unit?, note? }] }` | Row of stat tiles |
| `layer_curve` | `{ x_label, y_label, x?: number[], series: [{ name, y: number[] }] }` | Line chart, one line per series; `x` defaults to `0..n-1` |
| `heatmap` | `{ x_label, y_label, x_ticks?: string[], y_ticks?: string[], values: number[][], range?: [min, max], diverging?: boolean }` | Grid heatmap with hover values; diverging scale centred on 0 when `diverging` |
| `table` | `{ columns: string[], rows: (string \| number \| null)[][] }` | Plain table |
| `note` | `{ markdown: string }` | Markdown via `react-markdown` (already a dependency) |

An unknown `view` or malformed `data` renders an "unsupported section" placeholder with its id.
It never crashes the page. A file with `datasheet_schema` > 1 is listed but shows "needs a
newer dashboard" instead of being half-rendered.

## Pages

**`/models`: gallery.** One card per datasheet: title, `model_type`, short revision, dtype,
section count, generated date. Cards for `status: "example"` get an **Example data** badge.
Empty state explains how datasheets get here (the seesaw job plus the sync script), like `/evals`
does.

**`/models/[slug]`: datasheet.**
1. Header: title, summary, link to `https://huggingface.co/<model_id>` when the id looks like a
   hub id, otherwise plain text. When `job_id` is present, a "Produced by job …" link to
   `/jobs/<job_id>`. If that job is gone from the store (deleted, or a deployed snapshot whose
   job lives elsewhere), show the id as plain text rather than a broken link.
2. **Provenance panel**, always visible above the sections: model id, revision (short hash,
   full on hover), dtype, adapter, capabilities, hooks, versions. Preprocessing is a collapsible
   key/value list. If `preprocessing` is null, show a visible warning: *Preprocessing not
   recorded, so results can't be safely compared with other models.* Same for a null revision:
   *Weights revision unknown.*
3. Sections, grouped by tier when present, each with its title, caption and view.

**Nav:** add **Models** to the masthead in `components/shell.tsx`, between Jobs and Evaluation.
"Model Atlas" is the feature's name in docs and the page subtitle. The nav label is plain
"Models", to match "Jobs" and "Evaluation", which name what the tab contains. Avoid "Library":
that word already means lever.

Compare view (`/models/compare?a=&b=`) is stage 1b. See below.

## Implementation notes

- Follow `lib/evals.ts`: a new `lib/datasheets.ts` with `listDatasheets()` and
  `getDatasheet(slug)`, reading from `path.join(readDir(), "datasheets")` via `lib/paths.ts`.
  Missing or unparseable files return empty or null, never throw.
- Types go in `lib/types.ts` (or a `lib/datasheet-types.ts`), *not* next to the fs code, so
  client components don't pull `node:fs` into the bundle. Same reason `types.ts` is separate
  from `db.ts` today.
- API: `GET /api/models` (index: slug, title, status, provenance summary, section count) and
  `GET /api/models/[slug]` (full datasheet). Read-only, so `middleware.ts` needs no change.
- Validate `slug` against `^[a-z0-9][a-z0-9-]*$` before touching the filesystem (path traversal).
- Charts: inline SVG components, no chart library. There are three small renderers and the
  bundle has none today. Heatmap colours must work on the dark zinc theme. Use one sequential
  ramp and one diverging ramp, both colour-blind safe.
- `scripts/sync-datasheet-data.sh`: copy every `outputs/datasheets/*/datasheet.json` from
  `SEESAW_REPO_DIR` into `data/datasheets/<slug>/`. Skip `results/`.
- Next.js here is a newer version with breaking changes. Read the relevant guide in
  `node_modules/next/dist/docs/` before writing route or page code (see AGENTS.md).
- Update the README: Layout section, the sync script, the new page.

### Develop against an example

The seesaw job doesn't exist yet. Hand-write
`data/datasheets/example-clip-vit-b-32/datasheet.json` with `status: "example"` and one section
of each view, using plausible but clearly fake numbers. Add a second example with
`preprocessing: null` to exercise the warning. Both stay until real datasheets replace them.

## Acceptance criteria

- [ ] `/models` lists the example datasheets with the Example badge. With `data/datasheets`
      absent it shows the empty state, not an error.
- [ ] `/models/[slug]` renders the provenance panel and all five views from the example.
- [ ] Null preprocessing and null revision each show their warning.
- [ ] A `job_id` that exists in the store links to `/jobs/<id>`. One that doesn't exist shows
      as plain text. No `job_id` shows nothing.
- [ ] An unknown `view`, a malformed section, and `datasheet_schema: 2` each degrade as described.
      Add a throwaway third example locally to check, then don't commit it.
- [ ] `/models/../etc` and similar slugs return 404 without touching the filesystem.
- [ ] Works locally against `../seesaw/outputs` and from the committed `data/` snapshot.
- [ ] `npm run build` passes. No new runtime dependencies.
- [ ] Layout holds at phone width.

## Stage 1b: compare (after stage 1 lands)

`/models/compare?a=<slug>&b=<slug>`, linked from each datasheet ("Compare with…").

- Provenance diff table at the top, with differing fields highlighted.
- A **comparability banner** when preprocessing differs, either side's preprocessing is null,
  or dtypes differ. The banner says which field differs and why that matters.
- Sections joined on `id` and shown side by side. Sections that exist on one side only are
  listed under "Only in A / Only in B". For `layer_curve`, offer an overlay toggle that puts
  both models on one chart (x normalised to layer depth 0–1 when layer counts differ).

## Out of scope

Running probes or models from the web · reading safetensors · submissions, accounts,
verification badges · Modal artifact proxying for datasheets (the committed snapshot is enough
for stage 1) · a "datasheet" job type or form for creating one (that's seesaw-side, later) ·
a Jobs archive view or filter · any change to the jobs or evals pages beyond the nav link.

## Open questions

1. Slug convention. Derive it from `model_id` (`openai/clip-vit-base-patch32` →
   `openai--clip-vit-base-patch32`), or let seesaw choose short names? Derived is unambiguous;
   short reads better. The web side doesn't care as long as it matches the regex.
2. One datasheet per model, or per model *and revision*? Stage 1 assumes one per model, the latest.

Settled: the nav label is "Models" and the feature name is "Model Atlas" (see Pages).
