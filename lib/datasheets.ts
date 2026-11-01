/**
 * Reading Model Atlas datasheets.
 *
 * seesaw's datasheet job writes one directory per model:
 *
 *   outputs/datasheets/<slug>/datasheet.json   ← the only file read here
 *   outputs/datasheets/<slug>/results/...      ← lever Result dirs; ignored
 *
 * Everything is optional. A missing directory is an
 * empty gallery and an unparseable file is skipped — neither throws.
 */
import fs from "node:fs";
import path from "node:path";

import {
  DATASHEET_SCHEMA,
  isValidSlug,
  type Datasheet,
  type DatasheetSummary,
  type Section,
} from "./datasheet-types";
import { DATA_DIR, readDir } from "./paths";

/**
 * A local seesaw checkout that hasn't produced any datasheets yet still has
 * outputs/, so readDir() alone would hide the committed examples. Fall back
 * to the snapshot per feature rather than for the whole app.
 */
function datasheetsDir(): string {
  const local = path.join(readDir(), "datasheets");
  return fs.existsSync(local) ? local : path.join(DATA_DIR, "datasheets");
}

function readRaw(slug: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(path.join(datasheetsDir(), slug, "datasheet.json"), "utf8"),
    );
    return typeof parsed === "object" && parsed && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/** Fills in what a renderer relies on, so a sparse file can't crash a page. */
function normalize(slug: string, raw: Record<string, unknown>): Datasheet {
  const provenance =
    typeof raw.provenance === "object" && raw.provenance && !Array.isArray(raw.provenance)
      ? (raw.provenance as Datasheet["provenance"])
      : {};
  const sections = Array.isArray(raw.sections)
    ? raw.sections.map((s, i): Section => {
        const obj = (typeof s === "object" && s ? s : {}) as Partial<Section>;
        return {
          ...obj,
          id: typeof obj.id === "string" ? obj.id : `section-${i + 1}`,
          view: typeof obj.view === "string" ? obj.view : "",
          data: obj.data,
        };
      })
    : [];
  return {
    ...(raw as Partial<Datasheet>),
    datasheet_schema:
      typeof raw.datasheet_schema === "number" ? raw.datasheet_schema : 0,
    slug,
    title: typeof raw.title === "string" ? raw.title : slug,
    status: typeof raw.status === "string" ? raw.status : "published",
    job_id: typeof raw.job_id === "string" && raw.job_id ? raw.job_id : undefined,
    provenance,
    sections,
  };
}

export function isSupported(sheet: Pick<Datasheet, "datasheet_schema">): boolean {
  return sheet.datasheet_schema <= DATASHEET_SCHEMA;
}

/** Every readable datasheet, alphabetically by title. */
export function listDatasheets(): DatasheetSummary[] {
  const dir = datasheetsDir();
  if (!fs.existsSync(dir)) return [];
  const sheets: DatasheetSummary[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !isValidSlug(entry.name)) continue;
    const raw = readRaw(entry.name);
    if (!raw) continue;
    const sheet = normalize(entry.name, raw);
    sheets.push({
      slug: sheet.slug,
      title: sheet.title,
      status: sheet.status,
      datasheet_schema: sheet.datasheet_schema,
      supported: isSupported(sheet),
      generated_at: sheet.generated_at,
      model_id: sheet.provenance.model_id,
      model_type: sheet.provenance.model_type,
      revision: sheet.provenance.revision ?? null,
      dtype: sheet.provenance.dtype,
      section_count: sheet.sections.length,
    });
  }
  return sheets.sort((a, b) => a.title.localeCompare(b.title));
}

/** One datasheet, or null when the slug is invalid, missing, or unreadable. */
export function getDatasheet(slug: string): Datasheet | null {
  if (!isValidSlug(slug)) return null;
  const raw = readRaw(slug);
  return raw ? normalize(slug, raw) : null;
}
