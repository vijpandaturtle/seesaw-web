/**
 * Shapes of a Model Atlas datasheet, shared by client and server.
 *
 * Kept apart from lib/datasheets.ts for the same reason lib/types.ts is apart
 * from lib/db.ts: that module reads the filesystem, and a client component
 * importing a value from it would pull node:fs into the browser bundle.
 *
 * seesaw writes datasheet.json; this app only renders it. Everything is read
 * defensively — an unknown view or malformed data degrades one section, never
 * the page.
 */

/** The newest datasheet_schema this dashboard knows how to render. */
export const DATASHEET_SCHEMA = 1;

/** Slugs name directories, so they're validated before touching the disk. */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

/** lever's Provenance, verbatim. Nulls mean "not recorded". */
export type Provenance = {
  model_id?: string;
  revision?: string | null;
  model_type?: string;
  adapter?: string;
  capabilities?: string[];
  dtype?: string;
  hooks?: string[];
  preprocessing?: Record<string, unknown> | null;
  seed?: number | null;
  versions?: Record<string, string>;
  created_at?: string;
};

export type Section = {
  id: string;
  title?: string;
  tier?: number;
  view: string;
  caption?: string;
  data: unknown;
  source?: string;
};

export type Datasheet = {
  datasheet_schema: number;
  slug: string;
  title: string;
  status: "published" | "example" | string;
  summary?: string;
  generated_at?: string;
  job_id?: string;
  provenance: Provenance;
  sections: Section[];
};

/** What the gallery and GET /api/models need, without the section data. */
export type DatasheetSummary = {
  slug: string;
  title: string;
  status: string;
  datasheet_schema: number;
  supported: boolean;
  generated_at?: string;
  model_id?: string;
  model_type?: string;
  revision: string | null;
  dtype?: string;
  section_count: number;
};

// ── View data ────────────────────────────────────────────────────────────────

export type MetricsData = {
  items: { label: string; value: string | number; unit?: string; note?: string }[];
};

export type LayerCurveData = {
  x_label: string;
  y_label: string;
  x?: number[];
  series: { name: string; y: (number | null)[] }[];
};

export type HeatmapData = {
  x_label: string;
  y_label: string;
  x_ticks?: string[];
  y_ticks?: string[];
  values: (number | null)[][];
  range?: [number, number];
  diverging?: boolean;
};

export type TableData = {
  columns: string[];
  rows: (string | number | null)[][];
};

export type NoteData = { markdown: string };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const isNumOrNull = (v: unknown) => v === null || isNum(v);
const isStrArr = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every(isStr);

/**
 * Whether `data` has the shape its `view` needs. One check per view, so the
 * renderers can trust what they're given.
 */
export const VIEW_CHECKS: Record<string, (data: unknown) => boolean> = {
  metrics: (d) =>
    isObj(d) &&
    Array.isArray(d.items) &&
    d.items.every(
      (i) => isObj(i) && isStr(i.label) && (isStr(i.value) || isNum(i.value)),
    ),

  layer_curve: (d) => {
    if (!isObj(d) || !Array.isArray(d.series) || !d.series.length) return false;
    const series = d.series;
    if (
      !series.every(
        (s) =>
          isObj(s) &&
          isStr(s.name) &&
          Array.isArray(s.y) &&
          s.y.length > 0 &&
          s.y.every(isNumOrNull),
      )
    )
      return false;
    if (d.x === undefined) return true;
    const n = Math.max(...series.map((s) => (s.y as unknown[]).length));
    return Array.isArray(d.x) && d.x.every(isNum) && d.x.length >= n;
  },

  heatmap: (d) => {
    if (!isObj(d) || !Array.isArray(d.values) || !d.values.length) return false;
    const rows = d.values;
    if (!rows.every((r) => Array.isArray(r) && r.every(isNumOrNull)))
      return false;
    const width = (rows[0] as unknown[]).length;
    if (!width || !rows.every((r) => (r as unknown[]).length === width))
      return false;
    if (d.x_ticks !== undefined && !isStrArr(d.x_ticks)) return false;
    if (d.y_ticks !== undefined && !isStrArr(d.y_ticks)) return false;
    if (
      d.range !== undefined &&
      !(Array.isArray(d.range) && d.range.length === 2 && d.range.every(isNum))
    )
      return false;
    return true;
  },

  table: (d) =>
    isObj(d) &&
    isStrArr(d.columns) &&
    Array.isArray(d.rows) &&
    d.rows.every(
      (r) =>
        Array.isArray(r) &&
        r.every((c) => c === null || isStr(c) || isNum(c)),
    ),

  note: (d) => isObj(d) && isStr(d.markdown),
};

export function isRenderable(section: Section): boolean {
  const check = VIEW_CHECKS[section.view];
  return Boolean(check && check(section.data));
}

/** A hub id is "org/name"; anything else (a local path, say) isn't linked. */
export function isHubId(id: string | undefined): id is string {
  return Boolean(id && /^[\w-][\w.-]*\/[\w.-]+$/.test(id));
}

export function shortRevision(revision: string | null | undefined): string | null {
  return revision ? revision.slice(0, 7) : null;
}
