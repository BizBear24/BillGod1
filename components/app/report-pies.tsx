"use client";

import * as React from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

/**
 * The full eight-hue categorical set (dark-mode steps), for charts where the
 * point is composition across several named categories — payment methods,
 * branches, suppliers — rather than one metric's magnitude. Fixed order per
 * the palette's own CVD-safety derivation; never re-cycled or reassigned.
 */
export const PIE_COLORS = [
  "#3987e5", // blue
  "#d95926", // orange
  "#199e70", // aqua
  "#c98500", // yellow
  "#d55181", // magenta
  "#008300", // green
  "#9085e9", // violet
  "#e66767", // red
];

type Slice = { key: string; label: string; total: number };

/**
 * A donut with the grand total in the middle and a legend below — recharts
 * handles the geometry and the hover tooltip; the surface, ink and hue steps
 * are still this app's own (BillGod is a fixed dark-navy theme, not a
 * light/dark toggle — see report-charts.tsx).
 */
export function DonutChart({
  data,
  formatValue = (n: number) => `₹${n.toFixed(2)}`,
  maxSlices = 7,
}: {
  data: Slice[];
  formatValue?: (n: number) => string;
  maxSlices?: number;
}) {
  const { chartData, total } = React.useMemo(() => {
    const sorted = [...data].sort((a, b) => b.total - a.total);
    const head = sorted.slice(0, maxSlices);
    const rest = sorted.slice(maxSlices);
    const otherTotal = rest.reduce((s, r) => s + r.total, 0);
    const chartData = rest.length > 0 ? [...head, { key: "__other", label: "Other", total: otherTotal }] : head;
    return { chartData, total: sorted.reduce((s, r) => s + r.total, 0) };
  }, [data, maxSlices]);

  if (data.length === 0 || total === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No data.</p>;
  }

  return (
    <div className="space-y-1">
      <div className="relative mx-auto h-64 w-full max-w-sm">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="total"
              nameKey="label"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={2}
              cornerRadius={4}
              stroke="var(--card)"
              strokeWidth={2}
            >
              {chartData.map((slice, i) => (
                <Cell key={slice.key} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => formatValue(typeof value === "number" ? value : parseFloat(String(value)))}
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                color: "var(--popover-foreground)",
                fontSize: 12,
              }}
              itemStyle={{ color: "var(--popover-foreground)" }}
              labelStyle={{ color: "var(--muted-foreground)" }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-lg font-bold">{formatValue(total)}</p>
          <p className="text-[11px] text-muted-foreground">Total</p>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {chartData.map((slice, i) => (
          <div key={slice.key} className="flex items-center gap-1.5 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
            <span className="text-muted-foreground">{slice.label}</span>
            <span className="font-medium text-foreground">{formatValue(slice.total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
