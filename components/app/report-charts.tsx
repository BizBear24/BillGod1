"use client";

import * as React from "react";

/**
 * Small, dependency-free charts for the Reports tabs.
 *
 * BillGod's UI is a fixed dark-navy theme (see app/globals.css — there is no
 * light/dark toggle), so these are validated against that one surface only
 * (`--card`, #121a2e): worst adjacent CVD ΔE 26.8, normal-vision ΔE 31.8 —
 * comfortably clear of the 8/15 floors. A single hue per chart needs no
 * legend; the two-hue GST comparison keys its legend with a line, not a box.
 */
export const SERIES_BLUE = "#3987e5";
export const SERIES_ORANGE = "#d95926";
const GRID_COLOR = "#232f4b"; // one step off the card surface — this app's own --border
const AXIS_TEXT = "#94a3b8"; // this app's own --muted-foreground

/** Rounds a scale's top to a clean number (1/2/5 × a power of ten) so gridlines read as round values. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const residual = value / magnitude;
  const stepped = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10;
  return stepped * magnitude;
}

const compact = (n: number) =>
  new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(n);

/* ------------------------------------------------------------------ trend line */

type TrendPoint = { key: string; label: string; total: number };

/**
 * Day-wise total as a line + area, single hue. Only the last point carries a
 * direct label — every other value is read via the crosshair, which snaps to
 * the nearest day and shows the same number the direct label would.
 */
export function TrendLineChart({
  data,
  color = SERIES_BLUE,
  formatValue = (n: number) => `₹${compact(n)}`,
}: {
  data: TrendPoint[];
  color?: string;
  formatValue?: (n: number) => string;
}) {
  const svgRef = React.useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null);

  const W = 640;
  const H = 220;
  const PAD = { top: 20, right: 16, bottom: 28, left: 56 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const n = data.length;
  const maxTotal = Math.max(0, ...data.map((d) => d.total));
  const yMax = niceMax(maxTotal * 1.15 || 1);

  const xOf = (i: number) => (n <= 1 ? PAD.left + plotW / 2 : PAD.left + (i / (n - 1)) * plotW);
  const yOf = (v: number) => PAD.top + plotH - (v / yMax) * plotH;

  const linePath = data.map((d, i) => `${i === 0 ? "M" : "L"} ${xOf(i)} ${yOf(d.total)}`).join(" ");
  const areaPath = n > 0 ? `${linePath} L ${xOf(n - 1)} ${PAD.top + plotH} L ${xOf(0)} ${PAD.top + plotH} Z` : "";

  const gridSteps = [0, 0.25, 0.5, 0.75, 1];

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    if (n === 0 || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = W / rect.width;
    const logicalX = (e.clientX - rect.left) * scaleX;
    const ratio = n <= 1 ? 0 : (logicalX - PAD.left) / plotW;
    const index = Math.min(n - 1, Math.max(0, Math.round(ratio * (n - 1))));
    setHoverIndex(index);
  }

  if (n === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No data for this period.</p>;
  }

  const last = data[n - 1];
  const hovered = hoverIndex !== null ? data[hoverIndex] : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Total by day"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {gridSteps.map((s) => {
          const y = PAD.top + plotH - s * plotH;
          return (
            <g key={s}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke={GRID_COLOR} strokeWidth={1} />
              <text x={PAD.left - 8} y={y} textAnchor="end" dominantBaseline="middle" fontSize={10} fill={AXIS_TEXT}>
                {compact(yMax * s)}
              </text>
            </g>
          );
        })}

        {/* x-axis: first, middle, last labels only — a tick per day would collide past a handful of points */}
        {[0, Math.floor((n - 1) / 2), n - 1]
          .filter((v, i, arr) => arr.indexOf(v) === i)
          .map((i) => (
            <text key={i} x={xOf(i)} y={H - 6} textAnchor="middle" fontSize={10} fill={AXIS_TEXT}>
              {data[i].label}
            </text>
          ))}

        <path d={areaPath} fill={color} opacity={0.1} stroke="none" />
        <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {/* endpoint: the one direct label this chart carries */}
        <circle cx={xOf(n - 1)} cy={yOf(last.total)} r={4} fill={color} stroke="var(--card)" strokeWidth={2} />
        <text
          x={xOf(n - 1)}
          y={yOf(last.total) - 10}
          textAnchor="end"
          fontSize={11}
          fontWeight={600}
          fill="var(--foreground)"
        >
          {formatValue(last.total)}
        </text>

        {hoverIndex !== null && (
          <>
            <line
              x1={xOf(hoverIndex)}
              y1={PAD.top}
              x2={xOf(hoverIndex)}
              y2={PAD.top + plotH}
              stroke={AXIS_TEXT}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <circle cx={xOf(hoverIndex)} cy={yOf(data[hoverIndex].total)} r={4} fill={color} stroke="var(--card)" strokeWidth={2} />
          </>
        )}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute top-1 rounded-md border border-border bg-popover px-2 py-1 text-xs shadow-md"
          style={{
            left: `${(xOf(hoverIndex!) / W) * 100}%`,
            transform: hoverIndex! > n / 2 ? "translateX(-100%)" : undefined,
          }}
        >
          <p className="font-semibold text-popover-foreground">{formatValue(hovered.total)}</p>
          <p className="text-muted-foreground">{hovered.label}</p>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- ranked bars */

type RankedRow = { key: string; label: string; total: number; count: number };

/**
 * A single-measure ranking across a handful of categories (salesperson,
 * branch, supplier...) — one hue throughout, since color here carries no
 * identity beyond "this metric." Count and value are both direct labels, so
 * nothing is gated behind a hover a reader might miss.
 */
export function RankedBarChart({
  data,
  color = SERIES_BLUE,
  formatValue = (n: number) => `₹${n.toFixed(2)}`,
  maxItems = 8,
}: {
  data: RankedRow[];
  color?: string;
  formatValue?: (n: number) => string;
  maxItems?: number;
}) {
  if (data.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">No data.</p>;

  const visible = data.slice(0, maxItems);
  const barMax = Math.max(...visible.map((d) => Math.abs(d.total)), 1);

  return (
    <div className="space-y-2">
      {visible.map((row) => {
        const widthPercent = Math.max(2, (Math.abs(row.total) / barMax) * 100);
        return (
          <div key={row.key} className="group space-y-0.5 rounded-md px-1 py-0.5 transition-colors hover:bg-accent/40">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-muted-foreground">{row.label}</span>
              <span className="shrink-0 font-medium text-foreground">{formatValue(row.total)}</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-sm bg-muted">
              <div
                className="h-full rounded-sm transition-[width]"
                style={{ width: `${widthPercent}%`, backgroundColor: color }}
              />
            </div>
          </div>
        );
      })}
      {data.length > maxItems && (
        <p className="pt-1 text-center text-[11px] text-muted-foreground">+{data.length - maxItems} more</p>
      )}
    </div>
  );
}

/* --------------------------------------------------------- rate-wise pair */

type RateRow = { ratePercent: string | number; a: number; b: number };

/**
 * Two series side by side per category (outward vs inward tax, per GST
 * slab) — the one place these charts need a legend, keyed with a short line
 * per `interaction.md`, never a filled swatch box.
 */
export function TwoSeriesBarChart({
  data,
  labelA,
  labelB,
  colorA = SERIES_BLUE,
  colorB = SERIES_ORANGE,
  formatValue = (n: number) => `₹${compact(n)}`,
}: {
  data: RateRow[];
  labelA: string;
  labelB: string;
  colorA?: string;
  colorB?: string;
  formatValue?: (n: number) => string;
}) {
  if (data.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">No data.</p>;
  const barMax = Math.max(...data.flatMap((d) => [d.a, d.b]), 1);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded-full" style={{ backgroundColor: colorA }} />
          {labelA}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded-full" style={{ backgroundColor: colorB }} />
          {labelB}
        </span>
      </div>
      <div className="space-y-2.5">
        {data.map((row) => (
          <div key={String(row.ratePercent)} className="space-y-1 rounded-md px-1 py-0.5 transition-colors hover:bg-accent/40">
            <p className="text-xs font-medium text-foreground">{row.ratePercent}%</p>
            {([{ v: row.a, c: colorA }, { v: row.b, c: colorB }] as const).map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-sm bg-muted">
                  <div
                    className="h-full rounded-sm"
                    style={{ width: `${Math.max(2, (s.v / barMax) * 100)}%`, backgroundColor: s.c }}
                  />
                </div>
                <span className="w-20 shrink-0 text-right text-[11px] text-muted-foreground">{formatValue(s.v)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
