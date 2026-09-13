"use client";

import * as React from "react";
import { toast } from "sonner";
import { Barcode, Printer, LayoutGrid, FileText, Trash2, PenLine, Wand2 } from "lucide-react";
import { BarcodeSvg, LABEL_SYMBOLOGIES, type LabelSymbology } from "@/components/app/barcode-svg";
import { generateSequence } from "@/lib/barcode/encoders";
import { getInvoiceData } from "@/app/actions/sales";
import { LabelDesigner } from "@/components/app/label-designer";
import { InvoiceDesigner } from "@/components/app/invoice-designer";
import { LabelPreview, type LabelData } from "@/components/app/label-canvas";
import { InvoiceDocument, type InvoiceCompany } from "@/components/app/invoice-document";
import type { LabelDesign, InvoiceDesign } from "@/lib/print/templates";
import type { StoredTemplate } from "@/app/actions/print-templates";
import { getPrintService, type PrintFormat } from "@/lib/print";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Product = { id: string; itemCode: string; name: string; barcode: string | null; sellingPrice: string; mrp: string };
type InvoiceData = Awaited<ReturnType<typeof getInvoiceData>>;
type Company = { id: string; name: string; gstin: string | null; addressLine1: string | null; city: string | null; state: string | null; phone: string | null };
type SaleSummary = { id: string; docNumber: string; docType: string; createdAt: Date; totalAmount: string; customerName: string | null };

export function BarcodeStudio({
  products,
  company,
  recentSales,
  initialInvoice,
  labelTemplates,
  invoiceTemplates,
  defaultLabel,
  defaultInvoice,
  canDesign,
  initialLabelSelection,
}: {
  products: Product[];
  company: Company | null;
  recentSales: SaleSummary[];
  initialInvoice: InvoiceData;
  labelTemplates: StoredTemplate<LabelDesign>[];
  invoiceTemplates: StoredTemplate<InvoiceDesign>[];
  defaultLabel: LabelDesign;
  defaultInvoice: InvoiceDesign;
  canDesign: boolean;
  /** Pre-fills the label sheet with exactly what a purchase just brought in, so labels for new stock don't need re-typing. */
  initialLabelSelection?: { productId: string; copies: number }[];
}) {
  const [tab, setTab] = React.useState("labels");

  const sampleLabelData: LabelData = React.useMemo(() => {
    const product = products[0];
    return {
      name: product?.name ?? "Blue Cotton Shirt",
      itemCode: product?.itemCode ?? "SKU-001",
      barcode: product?.barcode?.trim() || product?.itemCode || "8901234567890",
      sellingPrice: `₹${parseFloat(product?.sellingPrice ?? "1000").toFixed(2)}`,
      mrp: `₹${parseFloat(product?.mrp ?? "1200").toFixed(2)}`,
      unit: "Piece",
      companyName: company?.name ?? "Your Shop",
    };
  }, [products, company]);

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-4">
      <TabsList className="print:hidden">
        <TabsTrigger value="labels">
          <LayoutGrid className="h-4 w-4" />
          Product Labels
        </TabsTrigger>
        <TabsTrigger value="sequence">
          <Barcode className="h-4 w-4" />
          Bulk Sequence
        </TabsTrigger>
        <TabsTrigger value="invoice">
          <FileText className="h-4 w-4" />
          Invoice Print
        </TabsTrigger>
        <TabsTrigger value="label-designer">
          <PenLine className="h-4 w-4" />
          Label Designer
        </TabsTrigger>
        <TabsTrigger value="invoice-designer">
          <Wand2 className="h-4 w-4" />
          Invoice Designer
        </TabsTrigger>
      </TabsList>

      <TabsContent value="labels">
        <LabelSheet
          products={products}
          company={company}
          templates={labelTemplates}
          defaultDesign={defaultLabel}
          initialSelection={initialLabelSelection}
        />
      </TabsContent>
      <TabsContent value="sequence">
        <SequenceSheet />
      </TabsContent>
      <TabsContent value="invoice">
        <InvoicePrinter
          company={company}
          recentSales={recentSales}
          initialDetail={initialInvoice}
          templates={invoiceTemplates}
          defaultDesign={defaultInvoice}
        />
      </TabsContent>
      <TabsContent value="label-designer">
        <LabelDesigner templates={labelTemplates} sampleData={sampleLabelData} canManage={canDesign} />
      </TabsContent>
      <TabsContent value="invoice-designer">
        <InvoiceDesigner templates={invoiceTemplates} company={company} canManage={canDesign} />
      </TabsContent>
    </Tabs>
  );
}

/**
 * Builds a printable sheet of product labels from a saved design.
 *
 * The sheet is drawn by the same `LabelPreview` the designer uses, at the
 * design's own millimetre sizes, so what was arranged on the canvas is exactly
 * what lands on the label stock.
 */
function LabelSheet({
  products,
  company,
  templates,
  defaultDesign,
  initialSelection,
}: {
  products: Product[];
  company: Company | null;
  templates: StoredTemplate<LabelDesign>[];
  defaultDesign: LabelDesign;
  initialSelection?: { productId: string; copies: number }[];
}) {
  const sheetRef = React.useRef<HTMLDivElement>(null);
  const [designId, setDesignId] = React.useState<string>(templates.find((t) => t.isDefault)?.id ?? templates[0]?.id ?? "builtin");
  const [selection, setSelection] = React.useState<{ productId: string; copies: number }[]>(() => initialSelection ?? []);
  const [search, setSearch] = React.useState("");

  const design = React.useMemo(
    () => templates.find((t) => t.id === designId)?.design ?? defaultDesign,
    [templates, designId, defaultDesign]
  );

  const designItems = React.useMemo(
    () => [
      { value: "builtin", label: templates.length === 0 ? "Built-in label" : "Built-in label (fallback)" },
      ...templates.map((t) => ({ value: t.id, label: t.isDefault ? `${t.name} (default)` : t.name })),
    ],
    [templates]
  );

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 12);
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.itemCode.toLowerCase().includes(q)).slice(0, 12);
  }, [products, search]);

  const labels = React.useMemo(() => {
    const out: { key: string; data: LabelData }[] = [];
    for (const item of selection) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) continue;
      const data: LabelData = {
        name: product.name,
        itemCode: product.itemCode,
        barcode: product.barcode?.trim() || product.itemCode,
        sellingPrice: `₹${parseFloat(product.sellingPrice).toFixed(2)}`,
        mrp: `₹${parseFloat(product.mrp).toFixed(2)}`,
        unit: "Piece",
        companyName: company?.name ?? "",
      };
      for (let i = 0; i < item.copies; i += 1) out.push({ key: `${product.id}-${i}`, data });
    }
    return out;
  }, [selection, products, company]);

  return (
    <div className="space-y-4">
      <Card className="print:hidden">
        <CardContent className="space-y-4 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Label design</label>
              <div className="w-64">
                <Select items={designItems} value={designId} onValueChange={(v) => setDesignId(v ?? "builtin")}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="builtin">{templates.length === 0 ? "Built-in label" : "Built-in label (fallback)"}</SelectItem>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.isDefault ? `${t.name} (default)` : t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="pb-2 text-xs text-muted-foreground">
              {design.widthMm} × {design.heightMm} mm · {design.columns} across · change it under Label Designer.
            </p>
          </div>

          <div className="space-y-2">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products to add…" />
            <div className="grid gap-2 sm:grid-cols-3">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() =>
                    setSelection((prev) => (prev.some((s) => s.productId === p.id) ? prev : [...prev, { productId: p.id, copies: 6 }]))
                  }
                  className="rounded-lg border border-border px-3 py-2 text-left text-sm transition-colors hover:border-primary/40 hover:bg-accent/40"
                >
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.barcode?.trim() || p.itemCode}</p>
                </button>
              ))}
              {filtered.length === 0 && <p className="col-span-3 py-3 text-center text-sm text-muted-foreground">No products match.</p>}
            </div>
          </div>

          {selection.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Encoded value</TableHead>
                    <TableHead className="w-28">Copies</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selection.map((item) => {
                    const product = products.find((p) => p.id === item.productId);
                    if (!product) return null;
                    return (
                      <TableRow key={item.productId}>
                        <TableCell>{product.name}</TableCell>
                        <TableCell className="font-mono text-xs">{product.barcode?.trim() || product.itemCode}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={1}
                            value={item.copies}
                            onChange={(e) =>
                              setSelection((prev) =>
                                prev.map((s) => (s.productId === item.productId ? { ...s, copies: Math.max(1, parseInt(e.target.value) || 1) } : s))
                              )
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Remove"
                            onClick={() => setSelection((prev) => prev.filter((s) => s.productId !== item.productId))}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {labels.length} label{labels.length === 1 ? "" : "s"} · EAN/UPC need numeric values of the right length; Code 128 takes anything.
            </p>
            <Button
              disabled={labels.length === 0}
              onClick={() => {
                if (sheetRef.current) void getPrintService().print({ element: sheetRef.current, format: "a4", title: "Labels" });
              }}
            >
              <Printer className="h-4 w-4" />
              Print labels
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Drawn in real millimetres so a 50 mm label measures 50 mm on paper,
          by the same component the designer previews with. */}
      <div ref={sheetRef}>
        <div
          className="flex flex-wrap"
          style={{
            gap: `${design.gapMm}mm`,
            width: `${design.columns * design.widthMm + (design.columns - 1) * design.gapMm}mm`,
          }}
        >
          {labels.map((label) => (
            <LabelPreview key={label.key} design={design} data={label.data} unit="mm" />
          ))}
          {labels.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground print:hidden">Pick a product above to build a label sheet.</p>
          )}
        </div>
      </div>
    </div>
  );
}



function SequenceSheet() {
  const sheetRef = React.useRef<HTMLDivElement>(null);
  const [symbology, setSymbology] = React.useState<LabelSymbology>("code128");
  const [start, setStart] = React.useState("ITEM-0001");
  const [count, setCount] = React.useState(12);
  const [step, setStep] = React.useState(1);

  const symbologyItems = React.useMemo(() => LABEL_SYMBOLOGIES.map((s) => ({ value: s.value, label: s.label })), []);
  const values = React.useMemo(() => generateSequence(start, Math.min(Math.max(count, 1), 500), step), [start, count, step]);

  return (
    <div className="space-y-4">
      <Card className="print:hidden">
        <CardContent className="space-y-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Symbology</label>
              <Select items={symbologyItems} value={symbology} onValueChange={(v) => setSymbology((v ?? "code128") as LabelSymbology)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LABEL_SYMBOLOGIES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="seq-start">
                Start value
              </label>
              <Input id="seq-start" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="seq-count">
                How many
              </label>
              <Input id="seq-count" type="number" min={1} max={500} value={count} onChange={(e) => setCount(parseInt(e.target.value) || 1)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="seq-step">
                Step (negative counts down)
              </label>
              <Input id="seq-step" type="number" value={step} onChange={(e) => setStep(parseInt(e.target.value) || 1)} />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">The trailing number increments; any prefix and zero padding are kept.</p>
            <Button
              onClick={() => {
                if (sheetRef.current) void getPrintService().print({ element: sheetRef.current, format: "a4", title: "Barcode sequence" });
              }}
            >
              <Printer className="h-4 w-4" />
              Print sheet
            </Button>
          </div>
        </CardContent>
      </Card>

      <div ref={sheetRef}>
        <div className="flex flex-wrap gap-2">
          {values.map((value) => (
            <div key={value} className="flex flex-col items-center border border-dashed border-border p-1">
              <BarcodeSvg symbology={symbology} value={value} moduleWidth={1} height={34} qrSize={60} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Prints a real bill through the saved invoice design — the same
 * `InvoiceDocument` the designer previews, so the two can never disagree.
 */
function InvoicePrinter({
  company,
  recentSales,
  initialDetail,
  templates,
  defaultDesign,
}: {
  company: Company | null;
  recentSales: SaleSummary[];
  initialDetail: InvoiceData;
  templates: StoredTemplate<InvoiceDesign>[];
  defaultDesign: InvoiceDesign;
}) {
  const documentRef = React.useRef<HTMLDivElement>(null);
  const [saleId, setSaleId] = React.useState(recentSales[0]?.id ?? "");
  const [designId, setDesignId] = React.useState<string>(templates.find((t) => t.isDefault)?.id ?? templates[0]?.id ?? "builtin");
  // The first bill arrives rendered from the server; only a change needs a fetch.
  const [detail, setDetail] = React.useState<InvoiceData>(initialDetail);
  const [loading, setLoading] = React.useState(false);

  const design = React.useMemo(
    () => templates.find((t) => t.id === designId)?.design ?? defaultDesign,
    [templates, designId, defaultDesign]
  );

  const saleItemOptions = React.useMemo(
    () => recentSales.map((s) => ({ value: s.id, label: `${s.docNumber} · ₹${parseFloat(s.totalAmount).toFixed(2)}` })),
    [recentSales]
  );
  const designItems = React.useMemo(
    () => [
      { value: "builtin", label: templates.length === 0 ? "Built-in invoice" : "Built-in invoice (fallback)" },
      ...templates.map((t) => ({ value: t.id, label: t.isDefault ? `${t.name} (default)` : t.name })),
    ],
    [templates]
  );

  async function selectSale(id: string) {
    setSaleId(id);
    if (!id) return;
    setLoading(true);
    try {
      setDetail(await getInvoiceData(id));
    } catch {
      toast.error("Could not load that bill.");
    } finally {
      setLoading(false);
    }
  }

  if (recentSales.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">Complete a bill first — then you can print it here.</CardContent>
      </Card>
    );
  }

  const invoiceCompany: InvoiceCompany | null = company;

  return (
    <div className="space-y-4">
      <Card className="print:hidden">
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Bill</label>
            <div className="w-64">
              <Select items={saleItemOptions} value={saleId} onValueChange={(v) => void selectSale(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {recentSales.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.docNumber} · ₹{parseFloat(s.totalAmount).toFixed(2)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Design</label>
            <div className="w-56">
              <Select items={designItems} value={designId} onValueChange={(v) => setDesignId(v ?? "builtin")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="builtin">{templates.length === 0 ? "Built-in invoice" : "Built-in invoice (fallback)"}</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.isDefault ? `${t.name} (default)` : t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="pb-2 text-xs text-muted-foreground">
            {design.paper === "custom" ? `${design.customWidthMm}mm wide` : design.paper.toUpperCase()} · change the layout under Invoice
            Designer.
          </p>
          <Button
            className="ml-auto"
            disabled={!detail}
            onClick={() => {
              if (!documentRef.current) return;
              // The design's own paper size decides the page, so an 80 mm
              // receipt does not come out padded onto an A4 sheet.
              void getPrintService().print({
                element: documentRef.current,
                format: design.paper as PrintFormat,
                title: detail?.sale.docNumber ?? "Invoice",
                customSizeMm:
                  design.paper === "custom" ? { width: design.customWidthMm, height: design.customHeightMm ?? undefined } : undefined,
              });
            }}
          >
            <Printer className="h-4 w-4" />
            Print / Save as PDF
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : !detail ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Pick a bill to preview.</p>
          ) : (
            <div ref={documentRef} className="mx-auto w-fit">
              <InvoiceDocument design={design} company={invoiceCompany} sale={detail.sale} lines={detail.lines} className="mx-auto" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
