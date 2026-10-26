import ReactMarkdown from "react-markdown";

import {
  isRenderable,
  type HeatmapData,
  type LayerCurveData,
  type MetricsData,
  type NoteData,
  type Section,
  type TableData,
} from "@/lib/datasheet-types";

/**
 * Renderers for datasheet sections, chosen by `view` rather than by technique
 * so seesaw can add probes without a change here.
 *
 * Charts are plain inline SVG — three small renderers don't justify a chart
 * library. Hover values come from SVG <title>, which needs no client JS.
 */

/** Okabe–Ito, minus black: distinguishable under the common colour-blindness types. */
const SERIES_COLOURS = [
  "#56B4E9",
  "#E69F00",
  "#009E73",
  "#CC79A7",
  "#F0E442",
  "#D55E00",
  "#0072B2",
];

/** Viridis: perceptually uniform and colour-blind safe, readable on zinc-950. */
const SEQUENTIAL = ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"];

/**
 * Blue → dark → orange. The midpoint is the page's own dark grey rather than
 * white, so zero recedes into the background instead of glaring off it.
 */
const DIVERGING = ["#2b83ba", "#6aaed6", "#27272a", "#f4a259", "#e66101"];

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Linear interpolation along evenly spaced colour stops, t in [0, 1]. */
function ramp(stops: string[], t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  const pos = clamped * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(pos));
  const f = pos - i;
  const a = hexToRgb(stops[i]);
  const b = hexToRgb(stops[i + 1]);
  const mix = a.map((v, k) => Math.round(v + (b[k] - v) * f));
  return `rgb(${mix.join(",")})`;
}

function fmt(v: number): string {
  if (v === 0) return "0";
  const abs = Math.abs(v);
  if (abs >= 1000 || abs < 0.01) return v.toExponential(1);
  return Number(v.toPrecision(3)).toString();
}

/** ~5 round tick values spanning [lo, hi]. */
function niceTicks(lo: number, hi: number, count = 5): number[] {
  if (lo === hi) return [lo];
  const span = hi - lo;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ??
    10 * mag;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + step * 1e-9; t += step) {
    ticks.push(Number(t.toPrecision(12)));
  }
  return ticks;
}

export function ExampleBadge() {
  return (
    <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
      Example data
    </span>
  );
}

export function SectionView({ section }: { section: Section }) {
  if (!isRenderable(section)) return <Unsupported section={section} />;
  switch (section.view) {
    case "metrics":
      return <Metrics data={section.data as MetricsData} />;
    case "layer_curve":
      return <LayerCurve data={section.data as LayerCurveData} />;
    case "heatmap":
      return <Heatmap data={section.data as HeatmapData} />;
    case "table":
      return <Table data={section.data as TableData} />;
    case "note":
      return <Note data={section.data as NoteData} />;
    default:
      return <Unsupported section={section} />;
  }
}

function Unsupported({ section }: { section: Section }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-700 px-4 py-6 text-center text-xs text-zinc-500">
      Unsupported section{" "}
      <code className="text-zinc-400">{section.id}</code>
      {section.view ? (
        <>
          {" "}
          (view <code className="text-zinc-400">{section.view}</code>)
        </>
      ) : null}
      . This dashboard can&apos;t render its data.
    </div>
  );
}

function Metrics({ data }: { data: MetricsData }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {data.items.map((item, i) => (
        <div
          key={i}
          className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2.5"
        >
          <div className="text-xl font-semibold tabular-nums">
            {typeof item.value === "number" ? fmt(item.value) : item.value}
            {item.unit && (
              <span className="ml-1 text-xs font-normal text-zinc-500">
                {item.unit}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-zinc-500">{item.label}</div>
          {item.note && (
            <div className="text-[11px] text-zinc-600">{item.note}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function LayerCurve({ data }: { data: LayerCurveData }) {
  const W = 640;
  const H = 280;
  const M = { top: 12, right: 16, bottom: 40, left: 56 };
  const n = Math.max(...data.series.map((s) => s.y.length));
  const xs = data.x ?? Array.from({ length: n }, (_, i) => i);

  const ys = data.series.flatMap((s) =>
    s.y.filter((v): v is number => v !== null),
  );
  let yLo = Math.min(...ys);
  let yHi = Math.max(...ys);
  if (yLo === yHi) {
    yLo -= 1;
    yHi += 1;
  }
  const pad = (yHi - yLo) * 0.05;
  yLo -= pad;
  yHi += pad;
  const xLo = Math.min(...xs.slice(0, n));
  const xHi = Math.max(...xs.slice(0, n)) || xLo + 1;

  const sx = (x: number) =>
    M.left + ((x - xLo) / (xHi - xLo || 1)) * (W - M.left - M.right);
  const sy = (y: number) =>
    M.top + (1 - (y - yLo) / (yHi - yLo)) * (H - M.top - M.bottom);

  const yTicks = niceTicks(yLo, yHi);
  const xTicks = niceTicks(xLo, xHi, 8);

  /** One path per series, broken at nulls rather than bridging a gap. */
  function path(y: (number | null)[]) {
    let d = "";
    let pen = false;
    y.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${sx(xs[i]).toFixed(1)},${sy(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  }

  return (
    <figure className="max-w-3xl">
      {data.series.length > 1 && (
        <figcaption className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
          {data.series.map((s, i) => (
            <span key={s.name} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-0.5 w-4 rounded"
                style={{ background: SERIES_COLOURS[i % SERIES_COLOURS.length] }}
              />
              {s.name}
            </span>
          ))}
        </figcaption>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${data.y_label} by ${data.x_label}`}
      >
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line
              x1={M.left}
              x2={W - M.right}
              y1={sy(t)}
              y2={sy(t)}
              stroke="#27272a"
            />
            <text
              x={M.left - 8}
              y={sy(t)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-zinc-500 text-[11px] tabular-nums"
            >
              {fmt(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text
            key={`x${t}`}
            x={sx(t)}
            y={H - M.bottom + 16}
            textAnchor="middle"
            className="fill-zinc-500 text-[11px] tabular-nums"
          >
            {fmt(t)}
          </text>
        ))}
        <text
          x={(M.left + W - M.right) / 2}
          y={H - 6}
          textAnchor="middle"
          className="fill-zinc-400 text-[11px]"
        >
          {data.x_label}
        </text>
        <text
          transform={`translate(14 ${(M.top + H - M.bottom) / 2}) rotate(-90)`}
          textAnchor="middle"
          className="fill-zinc-400 text-[11px]"
        >
          {data.y_label}
        </text>

        {data.series.map((s, si) => {
          const colour = SERIES_COLOURS[si % SERIES_COLOURS.length];
          return (
            <g key={s.name}>
              <path d={path(s.y)} fill="none" stroke={colour} strokeWidth={2} />
              {s.y.map((v, i) =>
                v === null ? null : (
                  <circle
                    key={i}
                    cx={sx(xs[i])}
                    cy={sy(v)}
                    r={3}
                    fill={colour}
                    stroke="#09090b"
                    strokeWidth={1}
                  >
                    <title>{`${s.name} · ${data.x_label} ${xs[i]}: ${fmt(v)}`}</title>
                  </circle>
                ),
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

function Heatmap({ data }: { data: HeatmapData }) {
  const rows = data.values.length;
  const cols = data.values[0].length;
  const finite = data.values.flat().filter((v): v is number => v !== null);

  let [lo, hi] = data.range ?? [
    Math.min(...finite, 0),
    Math.max(...finite, 0),
  ];
  if (data.diverging && !data.range) {
    const m = Math.max(Math.abs(lo), Math.abs(hi)) || 1;
    [lo, hi] = [-m, m];
  }
  if (lo === hi) hi = lo + 1;

  const colour = (v: number) =>
    ramp(data.diverging ? DIVERGING : SEQUENTIAL, (v - lo) / (hi - lo));

  // Cell geometry in viewBox units; the SVG scales to the container width.
  const cell = 24;
  const labelW = 64;
  const labelH = 32;
  const W = labelW + cols * cell;
  const H = rows * cell + labelH;
  const xEvery = Math.ceil(cols / 16);
  const yEvery = Math.ceil(rows / 16);

  const xTick = (i: number) => data.x_ticks?.[i] ?? String(i);
  const yTick = (i: number) => data.y_ticks?.[i] ?? String(i);

  return (
    <figure>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H + 18}`}
          className="h-auto w-full"
          style={{ minWidth: Math.min(W, 480), maxWidth: Math.max(W * 1.5, 360) }}
          role="img"
          aria-label={`${data.y_label} × ${data.x_label} heatmap`}
        >
          {data.values.map((row, r) =>
            row.map((v, c) => (
              <rect
                key={`${r}-${c}`}
                x={labelW + c * cell}
                y={r * cell}
                width={cell - 1}
                height={cell - 1}
                rx={2}
                fill={v === null ? "#18181b" : colour(v)}
              >
                <title>
                  {`${data.y_label} ${yTick(r)}, ${data.x_label} ${xTick(c)}: ${
                    v === null ? "—" : fmt(v)
                  }`}
                </title>
              </rect>
            )),
          )}
          {Array.from({ length: rows }, (_, r) =>
            r % yEvery ? null : (
              <text
                key={`y${r}`}
                x={labelW - 6}
                y={r * cell + cell / 2}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-zinc-500 text-[10px]"
              >
                {yTick(r)}
              </text>
            ),
          )}
          {Array.from({ length: cols }, (_, c) =>
            c % xEvery ? null : (
              <text
                key={`x${c}`}
                x={labelW + c * cell + cell / 2}
                y={rows * cell + 14}
                textAnchor="middle"
                className="fill-zinc-500 text-[10px]"
              >
                {xTick(c)}
              </text>
            ),
          )}
          <text
            x={labelW + (cols * cell) / 2}
            y={H + 12}
            textAnchor="middle"
            className="fill-zinc-400 text-[11px]"
          >
            {data.x_label}
          </text>
        </svg>
      </div>
      <figcaption className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-zinc-500">
        <span>
          rows: <span className="text-zinc-400">{data.y_label}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="tabular-nums">{fmt(lo)}</span>
          <span
            aria-hidden
            className="inline-block h-2 w-28 rounded-sm"
            style={{
              background: `linear-gradient(to right, ${(data.diverging
                ? DIVERGING
                : SEQUENTIAL
              ).join(",")})`,
            }}
          />
          <span className="tabular-nums">{fmt(hi)}</span>
        </span>
      </figcaption>
    </figure>
  );
}

function Table({ data }: { data: TableData }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900/60 text-left text-xs text-zinc-500">
          <tr>
            {data.columns.map((c) => (
              <th key={c} className="px-3 py-2 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, r) => (
            <tr key={r} className="border-t border-zinc-800/60">
              {row.map((cell, c) => (
                <td
                  key={c}
                  className={`px-3 py-2 ${
                    typeof cell === "number"
                      ? "tabular-nums text-zinc-300"
                      : "text-zinc-400"
                  }`}
                >
                  {cell === null ? (
                    <span className="text-zinc-600">—</span>
                  ) : typeof cell === "number" ? (
                    fmt(cell)
                  ) : (
                    cell
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-sm space-y-2 text-sm leading-relaxed text-zinc-400 [&_a]:text-sky-300 [&_a]:underline [&_code]:rounded [&_code]:bg-zinc-800 [&_code]:px-1 [&_code]:text-zinc-300 [&_li]:ml-4 [&_ol]:list-decimal [&_strong]:text-zinc-200 [&_ul]:list-disc">
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}

function Note({ data }: { data: NoteData }) {
  return <Markdown>{data.markdown}</Markdown>;
}
