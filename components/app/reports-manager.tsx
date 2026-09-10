"use client";

import * as React from "react";
import { toast } from "sonner";
import { Download, Printer, Receipt, Package, Boxes, Percent, ArrowUp, ArrowDown, ChevronsUpDown, Sheet } from "lucide-react";
import { getSalesReport, getPurchaseReport, getStockReport, getGstReport, exportWorkbook } from "@/app/actions/reports";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { daysAgoKey, formatDate, parseDisplayDate, todayKey } from "@/lib/utils";
import { round2 } from "@/lib/sales/totals";
import { getFilesystemService, base64ToBytes } from "@/lib/fs";
import { getPrintService } from "@/lib/print";

type SalesReport = Awaited<ReturnType<typeof getSalesReport>>;
type PurchaseReport = Awaited<ReturnType<typeof getPurchaseReport>>;
type StockReport = Awaited<ReturnType<typeof getStockReport>>;
type GstReport = Awaited<ReturnType<typeof getGstReport>>;

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

export function ReportsManager({ initialSalesReport }: { initialSalesReport: SalesReport }) {
  const [from, setFrom] = React.useState(daysAgoKey(30));
  const [to, setTo] = React.useState(todayKey());
  const [tab, setTab] = React.useState("sales");
  const [loading, setLoading] = React.useState(false);

  // The default sales view is rendered by the server; every other view loads
  // when the user asks for it, so nothing fetches on mount.
  const [salesReport, setSalesReport] = React.useState<SalesReport | null>(initialSalesReport);
  const [purchaseReport, setPurchaseReport] = React.useState<PurchaseReport | null>(null);
  const [stockReport, setStockReport] = React.useState<StockReport | null>(null);
  const [gstReport, setGstReport] = React.useState<GstReport | null>(null);

  async function load(which: string, range = { from, to }) {
    setLoading(true);
    try {
      if (which === "sales") setSalesReport(await getSalesReport(range));
      else if (which === "purchase") setPurchaseReport(await getPurchaseReport(range));
      else if (which === "stock") setStockReport(await getStockReport());
      else if (which === "gst") setGstReport(await getGstReport(range));
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
          <TabsList className="print:hidden">
            <TabsTrigger value="sales">
              <Receipt className="h-4 w-4" />
              Sales
            </TabsTrigger>
            <TabsTrigger value="purchase">
              <Package className="h-4 w-4" />
              Purchase
            </TabsTrigger>
            <TabsTrigger value="stock">
              <Boxes className="h-4 w-4" />
              Stock
            </TabsTrigger>
            <TabsTrigger value="gst">
              <Percent className="h-4 w-4" />
              GST
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sales" className="space-y-4">
            {salesReport && (
              <>
                <SummaryStrip
                  items={[
                    { label: "Bills", value: String(salesReport.summary.count) },
                    { label: "Taxable", value: money(salesReport.summary.subtotal - salesReport.summary.discount) },
                    { label: "Tax", value: money(salesReport.summary.tax) },
                    { label: "Total", value: money(salesReport.summary.total) },
                    { label: "Received", value: money(salesReport.summary.paid) },
                    { label: "Outstanding", value: money(salesReport.summary.due) },
                  ]}
                />
                <ReportTable
                  title="Sales register"
                  exportName={`sales-${from}-to-${to}`}
                  exportHeaders={["Date", "Doc No", "Type", "Customer", "Salesperson", "Branch", "Counter", "Taxable", "Tax", "Total", "Paid"]}
                  exportRows={salesReport.rows.map((r) => [
                    formatDate(r.createdAt),
                    r.docNumber,
                    r.docType,
                    r.customerName ?? "Walk-in",
                    r.salespersonName ?? "—",
                    r.warehouseLabel,
                    r.counterLabel,
                    round2(parseFloat(r.subtotal) - parseFloat(r.discountAmount)),
                    parseFloat(r.taxAmount),
                    parseFloat(r.totalAmount),
                    parseFloat(r.amountPaid),
                  ])}
                  headers={["Date", "Doc No", "Type", "Customer", "Salesperson", "Branch", "Counter", "Total", "Paid"]}
                  rows={salesReport.rows.map((r) => [
                    formatDate(r.createdAt),
                    r.docNumber,
                    r.docType.replace("_", " "),
                    r.customerName ?? "Walk-in",
                    r.salespersonName ?? "—",
                    r.warehouseLabel,
                    r.counterLabel,
                    money(parseFloat(r.totalAmount)),
                    money(parseFloat(r.amountPaid)),
                  ])}
                  emptyLabel="No sales in this period."
                />
                <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
                  <BreakdownCard title="Salesperson-wise" rows={salesReport.bySalesperson} />
                  <BreakdownCard title="Branch-wise" rows={salesReport.byBranch} />
                  <BreakdownCard title="Counter-wise" rows={salesReport.byCounter} />
                  <BreakdownCard title="Day-wise" rows={salesReport.byDay} />
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="purchase" className="space-y-4">
            {purchaseReport && (
              <>
                <SummaryStrip
                  items={[
                    { label: "Documents", value: String(purchaseReport.summary.count) },
                    { label: "Taxable", value: money(purchaseReport.summary.subtotal - purchaseReport.summary.discount) },
                    { label: "Tax", value: money(purchaseReport.summary.tax) },
                    { label: "Total", value: money(purchaseReport.summary.total) },
                    { label: "Paid", value: money(purchaseReport.summary.paid) },
                    { label: "Owed", value: money(purchaseReport.summary.due) },
                  ]}
                />
                <ReportTable
                  title="Purchase register"
                  exportName={`purchases-${from}-to-${to}`}
                  exportHeaders={["Date", "Doc No", "Type", "Supplier", "Supplier Invoice", "Taxable", "Tax", "Total", "Paid"]}
                  exportRows={purchaseReport.rows.map((r) => [
                    formatDate(r.createdAt),
                    r.docNumber,
                    r.docType,
                    r.supplierName,
                    r.supplierInvoiceNumber ?? "",
                    round2(parseFloat(r.subtotal) - parseFloat(r.discountAmount)),
                    parseFloat(r.taxAmount),
                    parseFloat(r.totalAmount),
                    parseFloat(r.amountPaid),
                  ])}
                  headers={["Date", "Doc No", "Type", "Supplier", "Invoice No", "Total", "Paid"]}
                  rows={purchaseReport.rows.map((r) => [
                    formatDate(r.createdAt),
                    r.docNumber,
                    r.docType.replace("_", " "),
                    r.supplierName,
                    r.supplierInvoiceNumber ?? "—",
                    money(parseFloat(r.totalAmount)),
                    money(parseFloat(r.amountPaid)),
                  ])}
                  emptyLabel="No purchases in this period."
                />
                <BreakdownCard title="Supplier-wise" rows={purchaseReport.bySupplier} />
              </>
            )}
          </TabsContent>

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

function BreakdownCard({ title, rows }: { title: string; rows: { key: string; label: string; total: number; count: number }[] }) {
  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <p className="text-sm font-semibold">{title}</p>
        {rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No data.</p>
        ) : (
          <Table>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell>{r.label}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{r.count}</TableCell>
                  <TableCell className="text-right font-medium">{money(r.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
