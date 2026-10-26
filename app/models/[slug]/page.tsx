import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import {
  ExampleBadge,
  Markdown,
  SectionView,
} from "@/components/datasheet-views";
import { getJob } from "@/lib/db";
import {
  isHubId,
  isValidSlug,
  shortRevision,
  type Datasheet,
  type Provenance,
  type Section,
} from "@/lib/datasheet-types";
import { getDatasheet, isSupported } from "@/lib/datasheets";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const sheet = isValidSlug(slug) ? getDatasheet(slug) : null;
  return { title: sheet?.title ?? "Models" };
}

/**
 * Whether the producing job is still in the store. A deleted job, or a
 * deployed snapshot whose job ran against another store, gets plain text
 * rather than a link to a 404.
 */
async function jobExists(id: string): Promise<boolean> {
  try {
    return Boolean(await getJob(id));
  } catch {
    return false;
  }
}

export default async function DatasheetPage({ params }: Props) {
  await connection();
  const { slug } = await params;
  // Rejected before anything touches the filesystem.
  if (!isValidSlug(slug)) notFound();
  const sheet = getDatasheet(slug);
  if (!sheet) notFound();

  const linkJob = sheet.job_id ? await jobExists(sheet.job_id) : false;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link href="/models" className="text-sm text-zinc-500 hover:text-zinc-300">
        ← All models
      </Link>

      <header className="mt-4 mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
            {sheet.title}
          </h1>
          {sheet.status === "example" && <ExampleBadge />}
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          Model Atlas
          {sheet.provenance.model_id && (
            <>
              {" · "}
              {isHubId(sheet.provenance.model_id) ? (
                <a
                  href={`https://huggingface.co/${sheet.provenance.model_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-zinc-400 hover:text-zinc-200"
                >
                  {sheet.provenance.model_id} ↗
                </a>
              ) : (
                <span className="font-mono text-zinc-400">
                  {sheet.provenance.model_id}
                </span>
              )}
            </>
          )}
          {sheet.generated_at && (
            <> · generated {new Date(sheet.generated_at).toLocaleString()}</>
          )}
          {sheet.job_id && (
            <>
              {" · "}Produced by job{" "}
              {linkJob ? (
                <Link
                  href={`/jobs/${sheet.job_id}`}
                  className="font-mono text-sky-300 hover:text-sky-200"
                >
                  {sheet.job_id}
                </Link>
              ) : (
                <span className="font-mono text-zinc-400">{sheet.job_id}</span>
              )}
            </>
          )}
        </p>
        {sheet.summary && isSupported(sheet) && (
          <div className="mt-3 max-w-3xl">
            <Markdown>{sheet.summary}</Markdown>
          </div>
        )}
      </header>

      {isSupported(sheet) ? (
        <>
          <ProvenancePanel provenance={sheet.provenance} />
          <Sections sheet={sheet} />
        </>
      ) : (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          This datasheet uses schema {sheet.datasheet_schema}, which needs a
          newer dashboard. Nothing is rendered rather than half of it.
        </div>
      )}
    </main>
  );
}

function ProvenancePanel({ provenance: p }: { provenance: Provenance }) {
  const rev = shortRevision(p.revision);
  const versions = Object.entries(p.versions ?? {});
  const preprocessing =
    p.preprocessing && typeof p.preprocessing === "object"
      ? Object.entries(p.preprocessing)
      : null;

  return (
    <section className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <h2 className="text-xs font-medium tracking-wide text-zinc-400 uppercase">
        Provenance
      </h2>

      {(!rev || !preprocessing) && (
        <div className="mt-3 space-y-1.5">
          {!preprocessing && (
            <Warning>
              Preprocessing not recorded, so results can&apos;t be safely
              compared with other models.
            </Warning>
          )}
          {!rev && <Warning>Weights revision unknown.</Warning>}
        </div>
      )}

      <dl className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
        <Row label="Model">{p.model_id ?? "—"}</Row>
        <Row label="Revision">
          {rev ? (
            <span title={p.revision ?? undefined} className="cursor-help">
              {rev}
            </span>
          ) : (
            <span className="text-amber-300/80">unknown</span>
          )}
        </Row>
        <Row label="Type">{p.model_type ?? "—"}</Row>
        <Row label="dtype">{p.dtype ?? "—"}</Row>
        <Row label="Adapter">{p.adapter ?? "—"}</Row>
        <Row label="Seed">{p.seed ?? "—"}</Row>
        <Row label="Capabilities">
          {p.capabilities?.length ? p.capabilities.join(", ") : "—"}
        </Row>
        <Row label="Hooks">
          {p.hooks?.length ? (
            <span className="flex flex-col">
              {p.hooks.map((h) => (
                <span key={h}>{h}</span>
              ))}
            </span>
          ) : (
            "—"
          )}
        </Row>
        {versions.length > 0 && (
          <Row label="Versions" wide>
            {versions.map(([k, v]) => `${k} ${v}`).join(" · ")}
          </Row>
        )}
      </dl>

      {preprocessing && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-zinc-400 hover:text-zinc-200">
            Preprocessing ({preprocessing.length} fields)
          </summary>
          <dl className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {preprocessing.map(([k, v]) => (
              <Row key={k} label={k}>
                {typeof v === "string" ? v : JSON.stringify(v)}
              </Row>
            ))}
          </dl>
        </details>
      )}
    </section>
  );
}

function Row({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex min-w-0 gap-3 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="w-24 shrink-0 text-zinc-600">{label}</dt>
      <dd className="min-w-0 font-mono break-words text-zinc-300">{children}</dd>
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
      ⚠ {children}
    </p>
  );
}

/** Grouped by tier when any section has one; untiered ones come last. */
function Sections({ sheet }: { sheet: Datasheet }) {
  if (!sheet.sections.length) {
    return (
      <p className="text-sm text-zinc-500">This datasheet has no sections.</p>
    );
  }
  const tiered = sheet.sections.some((s) => typeof s.tier === "number");
  if (!tiered) return <SectionList sections={sheet.sections} />;

  const groups = new Map<number | null, Section[]>();
  for (const s of sheet.sections) {
    const key = typeof s.tier === "number" ? s.tier : null;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const keys = [...groups.keys()].sort((a, b) =>
    a === null ? 1 : b === null ? -1 : a - b,
  );

  return (
    <div className="space-y-10">
      {keys.map((k) => (
        <div key={String(k)}>
          <h2 className="mb-4 border-b border-zinc-800 pb-2 text-xs font-medium tracking-wide text-zinc-400 uppercase">
            {k === null ? "Other" : `Tier ${k}`}
          </h2>
          <SectionList sections={groups.get(k)!} />
        </div>
      ))}
    </div>
  );
}

function SectionList({ sections }: { sections: Section[] }) {
  return (
    <div className="space-y-8">
      {sections.map((s, i) => (
        <section key={`${s.id}-${i}`} id={s.id} className="scroll-mt-20">
          <h3 className="text-sm font-medium text-zinc-100">
            {s.title ?? s.id}
          </h3>
          {s.caption && (
            <div className="mt-1 mb-3 max-w-3xl [&_p]:text-xs">
              <Markdown>{s.caption}</Markdown>
            </div>
          )}
          <div className={s.caption ? "" : "mt-3"}>
            <SectionView section={s} />
          </div>
        </section>
      ))}
    </div>
  );
}
