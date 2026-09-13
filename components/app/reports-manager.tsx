"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Download,
  Printer,
  Receipt,
  Package,
  Boxes,
  Percent,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  Sheet,
  Undo2,
  FileText,
  Calculator,
  ClipboardList,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { getSalesDocReport, getPurchaseDocReport, getStockReport, getGstReport, exportWorkbook } from "@/app/actions/reports";
import { SALE_DOC_TYPES, SALE_DOC_TYPE_LABELS } from "@/lib/validation/sales";
import { PURCHASE_DOC_TYPES, PURCHASE_DOC_TYPE_LABELS } from "@/lib/validation/purchases";
import { TrendLineChart, RankedBarChart, TwoSeriesBarChart, SERIES_ORANGE } from "@/components/app/report-charts";
import { DonutChart } from "@/components/app/report-pies";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { daysAgoKey, formatDate, parseDisplayDate, todayKey } from "@/lib/utils";
import { round2 } from "@/lib/sales/totals";
import { getFilesystemService, base64ToBytes } from "@/lib/fs";
import { getPrintService } from "@/lib/print";

type SaleDocType = (typeof SALE_DOC_TYPES)[number];
type PurchaseDocType = (typeof PURCHASE_DOC_TYPES)[number];
type SalesDocReport = Awaited<ReturnType<typeof getSalesDocReport>>;
type PurchaseDocReport = Awaited<ReturnType<typeof getPurchaseDocReport>>;
type StockReport = Awaited<ReturnType<typeof getStockReport>>;
type GstReport = Awaited<ReturnType<typeof getGstReport>>;

/** Every sale-side and purchase-side document gets its own register tab — never merged with another doc type. */
const SALE_TAB_ICONS: Record<SaleDocType, LucideIcon> = {
  sale: Receipt,
  sale_return: Undo2,
  quotation: FileText,
  estimate: Calculator,
  sale_order: ClipboardList,
  challan: Truck,
};
const PURCHASE_TAB_ICONS: Record<PurchaseDocType, LucideIcon> = {
  purchase_order: ClipboardList,
  purchase: Package,
  purchase_return: Undo2,
};

const money = (n: number) => `₹${n.toFixed(2)}`;

/** Quotes every field so commas and quotes inside names survive the round trip into Excel. */
function toCsv(headers: string[], rows: (string | number)[][]) {
  const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  return [headers.map(escape).join(","), ...rows.map((row) => row.map(escape).join(","))].join("\r\n");
}


function downloadCsv(filename: string, csv: string) {
  // A BOM makes Excel read the ₹ sign and other UTF-8 text correctly.
  void getFilesystemService().saveFile(filename, new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" }));
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** The workbook is built server-side; this turns the base64 it returns back into a file. */
async function downloadXlsx(
  filename: string,
  title: string,
  sheets: { name: string; headers: string[]; rows: (string | number | null)[][] }[]
) {
  const result = await exportWorkbook(title, sheets);
  if (!result.ok) {
    toast.error(result.error);
    return;
  }
  await getFilesystemService().saveFile(filename, base64ToBytes(result.base64), XLSX_MIME);
}

/**
 * A cell's sort key. Report cells arrive pre-formatted for display
 * ("₹1,200.00", "9/10/2026"), so sorting the strings would order 100 before
 * 9. This pulls the underlying number or date back out, and falls back to a
 * locale text comparison for everything else.
 */
function sortValue(cell: string): number | string {
  const trimmed = cell.trim();
  if (trimmed === "" || trimmed === "—") return Number.NEGATIVE_INFINITY;

  const numeric = trimmed.replace(/[₹,%\s]/g, "");
  if (/^-?\d+(\.\d+)?$/.test(numeric)) return parseFloat(numeric);

  // Dates render as "10 Sep 2026" (see formatDate), so they sort by their real
  // instant rather than alphabetically by the day number.
  const asDate = parseDisplayDate(trimmed);
  if (asDate !== null) return asDate;

  return trimmed.toLowerCase();
}

function compareCells(a: string, b: string): number {
  const left = sortValue(a);
  const right = sortValue(b);
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right));
}

const isSaleDocType = (v: string): v is SaleDocType => (SALE_DOC_TYPES as readonly string[]).includes(v);
const isPurchaseDocType = (v: string): v is PurchaseDocType => (PURCHASE_DOC_TYPES as readonly string[]).includes(v);

export function ReportsManager({ initialSalesReport }: { initialSalesReport: SalesDocReport }) {
  const [from, setFrom] = React.useState(daysAgoKey(30));
  const [to, setTo] = React.useState(todayKey());
  const [tab, setTab] = React.useState<string>("sale");
  const [loading, setLoading] = React.useState(false);

  // The default (Sales) view is rendered by the server; every other doc-type
  // register loads only once its tab is opened, so nothing else fetches on mount.
  const [saleDocReports, setSaleDocReports] = React.useState<Partial<Record<SaleDocType, SalesDocReport>>>({ sale: initialSalesReport });
  const [purchaseDocReports, setPurchaseDocReports] = React.useState<Partial<Record<PurchaseDocType, PurchaseDocReport>>>({});
  const [stockReport, setStockReport] = React.useState<StockReport | null>(null);
  const [gstReport, setGstReport] = React.useState<GstReport | null>(null);

  async function load(which: string, range = { from, to }) {
    setLoading(true);
    try {
      if (which === "stock") setStockReport(await getStockReport());
      else if (which === "gst") setGstReport(await getGstReport(range));
      else if (isSaleDocType(which)) {
        const report = await getSalesDocReport(which, range);
        setSaleDocReports((prev) => ({ ...prev, [which]: report }));
      } else if (isPurchaseDocType(which)) {
        const report = await getPurchaseDocReport(which, range);
        setPurchaseDocReports((prev) => ({ ...prev, [which]: report }));
      }
    } catch {
      toast.error("Could not load that report.");
    } finally {
      setLoading(false);
    }
  }

  const reportRef = React.useRef<HTMLDivElement>(null);

  function switchTab(next: string) {
    setTab(next);
    void load(next);
  }

  return (
    <div className="space-y-4">
      <Card className="print:hidden">
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="report-from">
              From
            </label>
            <Input id="report-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="report-to">
              To
            </label>
            <Input id="report-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
          <Button variant="secondary" onClick={() => void load(tab)} disabled={loading}>
            {loading ? "Loading…" : "Apply"}
          </Button>
          <div className="ml-auto flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                if (reportRef.current) {
                  void getPrintService().print({ element: reportRef.current, format: "a4", title: `Report ${from} to ${to}` });
                }
              }}
            >
              <Printer className="h-4 w-4" />
              Print / Save as PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Only the report body reaches the paper; the date pickers and the tab
          bar carry `print:hidden`, so they drop out of it. */}
      <div ref={reportRef} className="space-y-4">
        <Tabs value={tab} onValueChange={switchTab} className="space-y-4">
          <TabsList className="h-auto flex-wrap print:hidden">
            {SALE_DOC_TYPES.map((t) => {
              const Icon = SALE_TAB_ICONS[t];
              return (
                <TabsTrigger key={t} value={t}>
                  <Icon className="h-4 w-4" />
                  {SALE_DOC_TYPE_LABELS[t]}
                </TabsTrigger>
              );
            })}
            {PURCHASE_DOC_TYPES.map((t) => {
              const Icon = PURCHASE_TAB_ICONS[t];
              return (
                <TabsTrigger key={t} value={t}>
                  <Icon className="h-4 w-4" />
                  {PURCHASE_DOC_TYPE_LABELS[t]}
                </TabsTrigger>
              );
            })}
            <TabsTrigger value="stock">
              <Boxes className="h-4 w-4" />
              Stock
            </TabsTrigger>
            <TabsTrigger value="gst">
              <Percent className="h-4 w-4" />
              GST
            </TabsTrigger>
          </TabsList>

          {SALE_DOC_TYPES.map((t) => (
            <TabsContent key={t} value={t} className="space-y-4">
              <SalesDocReportView report={saleDocReports[t]} label={SALE_DOC_TYPE_LABELS[t]} from={from} to={to} />
            </TabsContent>
          ))}

          {PURCHASE_DOC_TYPES.map((t) => (
            <TabsContent key={t} value={t} className="space-y-4">
              <PurchaseDocReportView report={purchaseDocReports[t]} label={PURCHASE_DOC_TYPE_LABELS[t]} from={from} to={to} />
            </TabsContent>
          ))}

          <TabsContent value="stock" className="space-y-4">
            {stockReport && (
              <>
                <SummaryStrip
                  items={[
                    { label: "Products", value: String(stockReport.summary.products) },
                    { label: "Units in stock", value: String(stockReport.summary.units) },
                    { label: "Stock value (at cost)", value: money(stockReport.summary.stockValue) },
                    { label: "Retail value", value: money(stockReport.summary.retailValue) },
                  ]}
                />
                <p className="text-xs text-muted-foreground print:hidden">
                  Stock and its value are both derived from the movement ledger: each batch is carried at the cost it was bought at and
                  consumed first-in-first-out, so a later price change never revalues stock bought before it.
                </p>
                {stockReport.summary.negativeStockUnits > 0 && (
                  <p className="text-xs text-destructive print:hidden">
                    {stockReport.summary.negativeStockUnits} unit(s) are showing negative stock — billed out before a purchase recorded them.
                    Those are costed at the product&apos;s list purchase price until the matching purchase is entered.
                  </p>
                )}
                <ReportTable
                  title="Stock valuation"
                  exportName={`stock-${todayKey()}`}
                  exportHeaders={[
                    "Item Code",
                    "Name",
                    "Quantity",
                    "Avg Cost (FIFO)",
                    "Stock Value",
                    "List Purchase Price",
                    "Selling Price",
                    "Retail Value",
                    "Cost of Goods Sold",
                  ]}
                  exportRows={stockReport.rows.map((r) => [
                    r.itemCode,
                    r.name,
                    r.quantity,
                    r.averageCost,
                    r.stockValue,
                    r.listPurchasePrice,
                    r.sellingPrice,
                    r.retailValue,
                    r.cogs,
                  ])}
                  headers={["Item Code", "Name", "Qty", "Avg Cost", "Stock Value", "Retail Value", "COGS"]}
                  rows={stockReport.rows.map((r) => [
                    r.itemCode,
                    r.name,
                    String(r.quantity),
                    money(r.averageCost),
                    money(r.stockValue),
                    money(r.retailValue),
                    money(r.cogs),
                  ])}
                  emptyLabel="No products yet."
                />
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardContent className="space-y-3 py-4">
                      <p className="text-sm font-semibold">Top products by stock value</p>
                      <RankedBarChart
                        data={stockReport.rows.slice(0, 8).map((r) => ({ key: r.id, label: r.name, total: r.stockValue, count: r.quantity }))}
                        formatValue={money}
                      />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="space-y-3 py-4">
                      <p className="text-sm font-semibold">Stock value mix</p>
                      <DonutChart
                        data={stockReport.rows.filter((r) => r.stockValue > 0).map((r) => ({ key: r.id, label: r.name, total: r.stockValue }))}
                        formatValue={money}
                      />
                    </CardContent>
                  </Card>
                </div>
                <BatchValuationTable rows={stockReport.rows} />
              </>
            )}
          </TabsContent>

          <TabsContent value="gst" className="space-y-4">
            {gstReport && (
              <>
                <SummaryStrip
                  items={[
                    { label: "Outward taxable", value: money(gstReport.summary.outwardTaxable) },
                    { label: "Output tax", value: money(gstReport.summary.outputTax) },
                    { label: "Inward taxable", value: money(gstReport.summary.inwardTaxable) },
                    { label: "Input tax credit", value: money(gstReport.summary.inputTax) },
                    { label: "Net payable", value: money(gstReport.summary.netPayable) },
                  ]}
                />
                <p className="text-xs text-muted-foreground">
                  Rate-wise working summaries to reconcile a GSTR-1 / GSTR-3B filing against. B2B and B2C are split on whether the customer has a
                  GSTIN on file. Government filing formats (JSON/offline utility) are not generated.
                </p>
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardContent className="space-y-3 py-4">
                      <p className="text-sm font-semibold">Output tax vs input tax, by rate</p>
                      <TwoSeriesBarChart data={gstRateComparison(gstReport)} labelA="Output tax" labelB="Input tax" />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="space-y-3 py-4">
                      <p className="text-sm font-semibold">Outward taxable value, by rate</p>
                      <DonutChart
                        data={gstReport.outward.map((r) => ({ key: String(r.ratePercent), label: `${r.ratePercent}%`, total: r.taxableValue }))}
                        formatValue={money}
                      />
                    </CardContent>
                  </Card>
                </div>
                <ReportTable
                  title="Outward supplies (sales)"
                  exportName={`gst-outward-${from}-to-${to}`}
                  exportHeaders={["Rate %", "Taxable Value", "Tax", "B2B Taxable", "B2C Taxable", "Lines"]}
                  exportRows={gstReport.outward.map((r) => [
                    r.ratePercent,
                    r.taxableValue,
                    r.taxAmount,
                    r.b2bTaxable,
                    r.b2cTaxable,
                    r.lineCount,
                  ])}
                  headers={["Rate %", "Taxable Value", "Tax", "B2B", "B2C", "Lines"]}
                  rows={gstReport.outward.map((r) => [
                    `${r.ratePercent}%`,
                    money(r.taxableValue),
                    money(r.taxAmount),
                    money(r.b2bTaxable),
                    money(r.b2cTaxable),
                    String(r.lineCount),
                  ])}
                  emptyLabel="No outward supplies in this period."
                />
                <ReportTable
                  title="Inward supplies (purchases)"
                  exportName={`gst-inward-${from}-to-${to}`}
                  exportHeaders={["Rate %", "Taxable Value", "Input Tax", "Lines"]}
                  exportRows={gstReport.inward.map((r) => [r.ratePercent, r.taxableValue, r.taxAmount, r.lineCount])}
                  headers={["Rate %", "Taxable Value", "Input Tax", "Lines"]}
                  rows={gstReport.inward.map((r) => [`${r.ratePercent}%`, money(r.taxableValue), money(r.taxAmount), String(r.lineCount)])}
                  emptyLabel="No inward supplies in this period."
                />
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/** A single sale-side document type's own register — never another doc type's rows mixed in. */
function SalesDocReportView({
  report,
  label,
  from,
  to,
}: {
  report: SalesDocReport | undefined;
  label: string;
  from: string;
  to: string;
}) {
  if (!report) return null;
  return (
    <>
      <SummaryStrip
        items={[
          { label: "Count", value: String(report.summary.count) },
          { label: "Taxable", value: money(report.summary.subtotal - report.summary.discount) },
          { label: "Tax", value: money(report.summary.tax) },
          { label: "Total", value: money(report.summary.total) },
          { label: "Received", value: money(report.summary.paid) },
          { label: "Outstanding", value: money(report.summary.due) },
        ]}
      />
      <ReportTable
        title={`${label} register`}
        exportName={`${label.toLowerCase().replace(/\s+/g, "-")}-${from}-to-${to}`}
        exportHeaders={["Date", "Doc No", "Customer", "Salesperson", "Branch", "Counter", "Taxable", "Tax", "Total", "Paid"]}
        exportRows={report.rows.map((r) => [
          formatDate(r.createdAt),
          r.docNumber,
          r.customerName ?? "Walk-in",
          r.salespersonName ?? "—",
          r.warehouseLabel,
          r.counterLabel,
          round2(parseFloat(r.subtotal) - parseFloat(r.discountAmount)),
          parseFloat(r.taxAmount),
          parseFloat(r.totalAmount),
          parseFloat(r.amountPaid),
        ])}
        headers={["Date", "Doc No", "Customer", "Salesperson", "Branch", "Counter", "Total", "Paid"]}
        rows={report.rows.map((r) => [
          formatDate(r.createdAt),
          r.docNumber,
          r.customerName ?? "Walk-in",
          r.salespersonName ?? "—",
          r.warehouseLabel,
          r.counterLabel,
          money(parseFloat(r.totalAmount)),
          money(parseFloat(r.amountPaid)),
        ])}
        emptyLabel={`No ${label.toLowerCase()} documents in this period.`}
      />
      <Card>
        <CardContent className="space-y-3 py-4">
          <p className="text-sm font-semibold">Daily trend</p>
          <TrendLineChart data={dayPoints(report.byDay)} formatValue={money} />
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 py-4">
            <p className="text-sm font-semibold">Salesperson-wise</p>
            <RankedBarChart data={report.bySalesperson} formatValue={money} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 py-4">
            <p className="text-sm font-semibold">Paid by</p>
            <DonutChart data={report.byPaymentMethod} formatValue={money} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 py-4">
            <p className="text-sm font-semibold">Branch-wise</p>
            <DonutChart data={report.byBranch} formatValue={money} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 py-4">
            <p className="text-sm font-semibold">Counter-wise</p>
            <DonutChart data={report.byCounter} formatValue={money} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

/** A single purchase-side document type's own register. */
function PurchaseDocReportView({
  report,
  label,
  from,
  to,
}: {
  report: PurchaseDocReport | undefined;
  label: string;
  from: string;
  to: string;
}) {
  if (!report) return null;
  return (
    <>
      <SummaryStrip
        items={[
          { label: "Count", value: String(report.summary.count) },
          { label: "Taxable", value: money(report.summary.subtotal - report.summary.discount) },
          { label: "Tax", value: money(report.summary.tax) },
          { label: "Total", value: money(report.summary.total) },
          { label: "Paid", value: money(report.summary.paid) },
          { label: "Owed", value: money(report.summary.due) },
        ]}
      />
      <ReportTable
        title={`${label} register`}
        exportName={`${label.toLowerCase().replace(/\s+/g, "-")}-${from}-to-${to}`}
        exportHeaders={["Date", "Doc No", "Supplier", "Supplier Invoice", "Taxable", "Tax", "Total", "Paid"]}
        exportRows={report.rows.map((r) => [
          formatDate(r.createdAt),
          r.docNumber,
          r.supplierName,
          r.supplierInvoiceNumber ?? "",
          round2(parseFloat(r.subtotal) - parseFloat(r.discountAmount)),
          parseFloat(r.taxAmount),
          parseFloat(r.totalAmount),
          parseFloat(r.amountPaid),
        ])}
        headers={["Date", "Doc No", "Supplier", "Invoice No", "Total", "Paid"]}
        rows={report.rows.map((r) => [
          formatDate(r.createdAt),
          r.docNumber,
          r.supplierName,
          r.supplierInvoiceNumber ?? "—",
          money(parseFloat(r.totalAmount)),
          money(parseFloat(r.amountPaid)),
        ])}
        emptyLabel={`No ${label.toLowerCase()} documents in this period.`}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 py-4">
            <p className="text-sm font-semibold">Daily trend</p>
            <TrendLineChart data={dayPoints(report.byDay)} color={SERIES_ORANGE} formatValue={money} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 py-4">
            <p className="text-sm font-semibold">Supplier-wise</p>
            <DonutChart data={report.bySupplier} formatValue={money} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

/** `2026-09-12` → a short axis label ("12 Sep"), same date the tooltip shows. */
function dayPoints(rows: { key: string; label: string; total: number }[]) {
  return rows.map((r) => {
    const [, month, day] = r.key.split("-");
    const monthName = MONTH_SHORT[parseInt(month, 10) - 1] ?? month;
    return { key: r.key, label: `${day} ${monthName}`, total: r.total };
  });
}
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Outward and inward each list only the rates they actually saw — this unions them so a rate with only one side still gets its own row. */
function gstRateComparison(report: GstReport) {
  const rates = new Set<number>([...report.outward.map((r) => r.ratePercent), ...report.inward.map((r) => r.ratePercent)]);
  return [...rates]
    .sort((a, b) => a - b)
    .map((rate) => ({
      ratePercent: rate,
      a: report.outward.find((r) => r.ratePercent === rate)?.taxAmount ?? 0,
      b: report.inward.find((r) => r.ratePercent === rate)?.taxAmount ?? 0,
    }));
}

function SummaryStrip({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((item) => (
        <Card key={item.label}>
          <CardContent className="py-4">
            <p className="text-lg font-bold">{item.value}</p>
            <p className="text-xs text-muted-foreground">{item.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Every report table: click a column to sort it, and export what you see as
 * CSV or a real .xlsx. The sort order is carried into both exports, so a
 * downloaded file always matches the table it came from.
 */
function ReportTable({
  title,
  headers,
  rows,
  emptyLabel,
  exportName,
  exportHeaders,
  exportRows,
}: {
  title: string;
  headers: string[];
  rows: string[][];
  emptyLabel: string;
  /** Filename stem, without an extension. */
  exportName: string;
  /** A wider set of columns worth exporting; defaults to what is on screen. */
  exportHeaders?: string[];
  exportRows?: (string | number | null)[][];
}) {
  const [sort, setSort] = React.useState<{ index: number; direction: "asc" | "desc" } | null>(null);
  const [exporting, setExporting] = React.useState(false);

  const order = React.useMemo(() => {
    const indices = rows.map((_, i) => i);
    if (!sort) return indices;
    const factor = sort.direction === "asc" ? 1 : -1;
    return indices.sort((a, b) => factor * compareCells(rows[a][sort.index] ?? "", rows[b][sort.index] ?? ""));
  }, [rows, sort]);

  const sortedRows = React.useMemo(() => order.map((i) => rows[i]), [order, rows]);
  const sortedExportRows = React.useMemo(() => {
    const source: (string | number | null)[][] = exportRows ?? rows;
    return order.map((i) => source[i]).filter((row): row is (string | number | null)[] => !!row);
  }, [order, exportRows, rows]);

  /** Ascending, then descending, then back to the report's natural order. */
  function toggleSort(index: number) {
    setSort((current) => {
      if (!current || current.index !== index) return { index, direction: "asc" };
      if (current.direction === "asc") return { index, direction: "desc" };
      return null;
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">{title}</p>
          {rows.length > 0 && (
            <div className="flex gap-2 print:hidden">
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  downloadCsv(
                    `${exportName}.csv`,
                    toCsv(
                      exportHeaders ?? headers,
                      sortedExportRows.map((row) => row.map((cell) => cell ?? ""))
                    )
                  )
                }
              >
                <Download className="h-3.5 w-3.5" />
                CSV
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={exporting}
                onClick={async () => {
                  setExporting(true);
                  await downloadXlsx(`${exportName}.xlsx`, title, [
                    { name: title, headers: exportHeaders ?? headers, rows: sortedExportRows },
                  ]);
                  setExporting(false);
                }}
              >
                <Sheet className="h-3.5 w-3.5" />
                {exporting ? "Building..." : "Excel"}
              </Button>
            </div>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  {headers.map((h, i) => {
                    const active = sort?.index === i;
                    const Icon = !active ? ChevronsUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
                    return (
                      <TableHead key={h}>
                        <button
                          type="button"
                          onClick={() => toggleSort(i)}
                          aria-label={`Sort by ${h}`}
                          className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                        >
                          {h}
                          <Icon className={`h-3 w-3 ${active ? "text-foreground" : "text-muted-foreground/50"}`} />
                        </button>
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRows.map((row, i) => (
                  <TableRow key={i}>
                    {row.map((cell, j) => (
                      <TableCell key={j}>{cell}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


/**
 * The cost layers behind the valuation above. Only products carrying more than
 * one layer are listed — for everything else the single average already tells
 * the whole story, and a row per product would just be noise.
 */
function BatchValuationTable({
  rows,
}: {
  rows: {
    itemCode: string;
    name: string;
    batches: { batchNumber: string | null; quantity: number; unitCost: number; value: number }[];
  }[];
}) {
  const layered = rows.filter((r) => r.batches.length > 1);
  if (layered.length === 0) return null;

  return (
    <ReportTable
      title="Cost layers (products bought at more than one price)"
      exportName={`stock-batches-${todayKey()}`}
      exportHeaders={["Item Code", "Name", "Batch", "Quantity", "Unit Cost", "Value"]}
      exportRows={layered.flatMap((r) =>
        r.batches.map((b) => [r.itemCode, r.name, b.batchNumber ?? "", b.quantity, b.unitCost, b.value])
      )}
      headers={["Item Code", "Name", "Batch", "Qty", "Unit Cost", "Value"]}
      rows={layered.flatMap((r) =>
        r.batches.map((b) => [r.itemCode, r.name, b.batchNumber ?? "\u2014", String(b.quantity), money(b.unitCost), money(b.value)])
      )}
      emptyLabel="No layered stock."
    />
  );
}
