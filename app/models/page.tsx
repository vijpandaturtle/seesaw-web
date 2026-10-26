import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { ExampleBadge } from "@/components/datasheet-views";
import { PageHeader } from "@/components/shell";
import { shortRevision, type DatasheetSummary } from "@/lib/datasheet-types";
import { listDatasheets } from "@/lib/datasheets";

export const metadata: Metadata = { title: "Models" };

export default async function ModelsPage() {
  // Read at request time: locally, datasheets appear as seesaw writes them.
  await connection();
  const sheets = listDatasheets();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <PageHeader
        title="Models"
        subtitle="Model Atlas — interpretability datasheets, one per model, with the provenance every number came from."
      />

      {sheets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
          <p>No datasheets yet.</p>
          <p className="mt-2 text-xs text-zinc-600">
            seesaw&apos;s datasheet job writes{" "}
            <code className="text-zinc-400">
              outputs/datasheets/&lt;slug&gt;/datasheet.json
            </code>
            , which shows up here when running beside a seesaw checkout.
            Deployed, refresh the committed snapshot with{" "}
            <code className="text-zinc-400">
              ./scripts/sync-datasheet-data.sh
            </code>
            .
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {sheets.map((s) => (
            <Card key={s.slug} sheet={s} />
          ))}
        </div>
      )}
    </main>
  );
}

function Card({ sheet }: { sheet: DatasheetSummary }) {
  const rev = shortRevision(sheet.revision);
  return (
    <Link
      href={`/models/${sheet.slug}`}
      className="group block rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 transition hover:border-zinc-700 hover:bg-zinc-900/70"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[15px] font-medium text-zinc-100 group-hover:text-white">
          {sheet.title}
        </h2>
        {sheet.status === "example" && <ExampleBadge />}
      </div>
      {sheet.model_id && (
        <p className="mt-0.5 truncate font-mono text-xs text-zinc-500">
          {sheet.model_id}
        </p>
      )}

      {sheet.supported ? (
        <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
          {sheet.model_type && <Meta label="type" value={sheet.model_type} />}
          <Meta label="rev" value={rev ?? "unknown"} warn={!rev} mono />
          {sheet.dtype && <Meta label="dtype" value={sheet.dtype} mono />}
          <Meta
            label="sections"
            value={String(sheet.section_count)}
          />
          {sheet.generated_at && (
            <Meta
              label="generated"
              value={new Date(sheet.generated_at).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            />
          )}
        </dl>
      ) : (
        <p className="mt-3 text-xs text-amber-300/80">
          Schema {sheet.datasheet_schema} needs a newer dashboard.
        </p>
      )}
    </Link>
  );
}

function Meta({
  label,
  value,
  mono,
  warn,
}: {
  label: string;
  value: string;
  mono?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="flex gap-1">
      <dt className="text-zinc-600">{label}</dt>
      <dd
        className={`${mono ? "font-mono" : ""} ${warn ? "text-amber-300/80" : "text-zinc-400"}`}
      >
        {value}
      </dd>
    </div>
  );
}
