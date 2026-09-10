"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Star, Save, Trash2, ArrowUp, ArrowDown, Plus, Minus } from "lucide-react";
import {
  INVOICE_COLUMNS,
  INVOICE_PAPERS,
  defaultInvoiceDesign,
  type InvoiceColumn,
  type InvoiceDesign,
  type InvoicePaper,
} from "@/lib/print/templates";
import { savePrintTemplate, setDefaultPrintTemplate, deletePrintTemplate, type StoredTemplate } from "@/app/actions/print-templates";
import { InvoiceDocument, SAMPLE_INVOICE, type InvoiceCompany } from "@/components/app/invoice-document";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Structured invoice designer.
 *
 * Deliberately not a free canvas. An invoice's line items are a repeating band
 * that has to flow across pages with a repeating header and totals that land
 * after the last row — something you choose, order and size, not something you
 * drag box by box. Everything a shop actually wants to change about a bill is
 * here, and the live preview is drawn by the very same component that prints.
 */
export function InvoiceDesigner({
  templates,
  company,
  canManage,
}: {
  templates: StoredTemplate<InvoiceDesign>[];
  company: InvoiceCompany | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = React.useState<string | null>(templates.find((t) => t.isDefault)?.id ?? templates[0]?.id ?? null);
  const initial = templates.find((t) => t.id === templateId);

  const [name, setName] = React.useState(initial?.name ?? "Standard invoice");
  const [design, setDesign] = React.useState<InvoiceDesign>(initial?.design ?? defaultInvoiceDesign());
  const [saving, setSaving] = React.useState(false);

  const patch = (next: Partial<InvoiceDesign>) => setDesign((d) => ({ ...d, ...next }));

  function setColumn(key: string, next: Partial<InvoiceColumn>) {
    setDesign((d) => ({ ...d, columns: d.columns.map((c) => (c.key === key ? { ...c, ...next } : c)) }));
  }

  function moveColumn(key: string, direction: -1 | 1) {
    setDesign((d) => {
      const index = d.columns.findIndex((c) => c.key === key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= d.columns.length) return d;
      const columns = [...d.columns];
      [columns[index], columns[target]] = [columns[target], columns[index]];
      return { ...d, columns };
    });
  }

  async function save(makeDefault: boolean) {
    setSaving(true);
    const result = await savePrintTemplate({ templateId, kind: "invoice", name, design, makeDefault });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.templateId) setTemplateId(result.templateId);
    toast.success(makeDefault ? "Saved and set as the default invoice" : "Invoice design saved");
    router.refresh();
  }

  const templateItems = React.useMemo(
    () => [
      { value: "new", label: "＋ New design" },
      ...templates.map((t) => ({ value: t.id, label: t.isDefault ? `${t.name} (default)` : t.name })),
    ],
    [templates]
  );
  const paperItems = React.useMemo(() => INVOICE_PAPERS.map((p) => ({ value: p.value, label: p.label })), []);

  const visibleCount = design.columns.filter((c) => c.visible).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Design</label>
            <div className="w-56">
              <Select
                items={templateItems}
                value={templateId ?? "new"}
                onValueChange={(v) => {
                  if (!v || v === "new") {
                    setTemplateId(null);
                    setName("New invoice");
                    setDesign(defaultInvoiceDesign());
                    return;
                  }
                  const found = templates.find((t) => t.id === v);
                  setTemplateId(v);
                  if (found) {
                    setName(found.name);
                    setDesign(found.design);
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pick a design" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">＋ New design</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.isDefault ? `${t.name} (default)` : t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="invoice-design-name">
              Name
            </label>
            <Input id="invoice-design-name" value={name} onChange={(e) => setName(e.target.value)} className="w-48" disabled={!canManage} />
          </div>

          {canManage && (
            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="secondary" disabled={saving} onClick={() => void save(false)}>
                <Save className="h-4 w-4" />
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button disabled={saving} onClick={() => void save(true)}>
                <Star className="h-4 w-4" />
                Save as default
              </Button>
              {templateId && (
                <>
                  {!templates.find((t) => t.id === templateId)?.isDefault && (
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        const result = await setDefaultPrintTemplate(templateId, "invoice");
                        if (!result.ok) toast.error(result.error);
                        else {
                          toast.success("Default invoice design updated");
                          router.refresh();
                        }
                      }}
                    >
                      Make default
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete design"
                    onClick={async () => {
                      if (!confirm(`Delete the "${name}" invoice design?`)) return;
                      const result = await deletePrintTemplate(templateId);
                      if (!result.ok) {
                        toast.error(result.error);
                        return;
                      }
                      toast.success("Design deleted");
                      setTemplateId(null);
                      setDesign(defaultInvoiceDesign());
                      router.refresh();
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* ------------------------------------------------------ controls */}
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 py-4">
              <p className="text-sm font-semibold">Page</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Paper</label>
                  <Select
                    items={paperItems}
                    value={design.paper}
                    onValueChange={(v) => {
                      if (!v) return;
                      // Switching to a thermal roll resets the layout to one
                      // that actually fits, rather than leaving 11 columns on
                      // 58 mm of paper.
                      const fresh = defaultInvoiceDesign(v as InvoicePaper);
                      patch({ paper: fresh.paper, marginMm: fresh.marginMm, fontScale: fresh.fontScale, columns: fresh.columns });
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INVOICE_PAPERS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Title</label>
                  <Input value={design.title} disabled={!canManage} onChange={(e) => patch({ title: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Margin (mm)</label>
                  <Input
                    type="number"
                    step="1"
                    value={design.marginMm}
                    disabled={!canManage}
                    onChange={(e) => patch({ marginMm: clampNumber(e.target.value, 0, 30, design.marginMm) })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Text size (×)</label>
                  <Input
                    type="number"
                    step="0.05"
                    value={design.fontScale}
                    disabled={!canManage}
                    onChange={(e) => patch({ fontScale: clampNumber(e.target.value, 0.6, 1.8, design.fontScale) })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="invoice-accent">
                    Accent colour
                  </label>
                  <Input
                    id="invoice-accent"
                    type="color"
                    value={design.accentColor}
                    disabled={!canManage}
                    onChange={(e) => patch({ accentColor: e.target.value })}
                    className="h-9 p-1"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 py-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Item columns</p>
                <span className="text-xs text-muted-foreground">{visibleCount} shown</span>
              </div>
              {visibleCount === 0 && <p className="text-xs text-destructive">Show at least one column, or the bill will have no items on it.</p>}
              <div className="space-y-1.5">
                {design.columns.map((column, index) => {
                  const spec = INVOICE_COLUMNS.find((c) => c.key === column.key);
                  return (
                    <div key={column.key} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={column.visible}
                        disabled={!canManage}
                        aria-label={`Show ${spec?.label ?? column.key}`}
                        onChange={(e) => setColumn(column.key, { visible: e.target.checked })}
                        className="h-4 w-4 shrink-0 accent-primary"
                      />
                      <span className="w-24 shrink-0 truncate text-xs font-medium">{spec?.label ?? column.key}</span>
                      <Input
                        value={column.label}
                        disabled={!canManage}
                        placeholder={spec?.label}
                        onChange={(e) => setColumn(column.key, { label: e.target.value })}
                        className="h-7 flex-1 text-xs"
                      />
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Narrow ${spec?.label ?? column.key}`}
                          disabled={!canManage}
                          onClick={() => setColumn(column.key, { widthPercent: Math.max(2, column.widthPercent - 2) })}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-8 text-center text-[11px] text-muted-foreground">{column.widthPercent}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Widen ${spec?.label ?? column.key}`}
                          disabled={!canManage}
                          onClick={() => setColumn(column.key, { widthPercent: Math.min(90, column.widthPercent + 2) })}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Move ${spec?.label ?? column.key} up`}
                          disabled={!canManage || index === 0}
                          onClick={() => moveColumn(column.key, -1)}
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Move ${spec?.label ?? column.key} down`}
                          disabled={!canManage || index === design.columns.length - 1}
                          onClick={() => moveColumn(column.key, 1)}
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 py-4">
              <p className="text-sm font-semibold">What to show</p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                <Toggle label="Shop name & address" checked={design.showCompanyBlock} disabled={!canManage} onChange={(v) => patch({ showCompanyBlock: v })} />
                <Toggle label="GSTIN" checked={design.showGstin} disabled={!canManage} onChange={(v) => patch({ showGstin: v })} />
                <Toggle label="Customer block" checked={design.showCustomer} disabled={!canManage} onChange={(v) => patch({ showCustomer: v })} />
                <Toggle label="Salesperson" checked={design.showSalesperson} disabled={!canManage} onChange={(v) => patch({ showSalesperson: v })} />
                <Toggle label="Counter" checked={design.showCounter} disabled={!canManage} onChange={(v) => patch({ showCounter: v })} />
                <Toggle label="Subtotal" checked={design.showSubtotal} disabled={!canManage} onChange={(v) => patch({ showSubtotal: v })} />
                <Toggle label="Discount" checked={design.showDiscount} disabled={!canManage} onChange={(v) => patch({ showDiscount: v })} />
                <Toggle label="Tax" checked={design.showTax} disabled={!canManage} onChange={(v) => patch({ showTax: v })} />
                <Toggle label="Round off" checked={design.showRoundOff} disabled={!canManage} onChange={(v) => patch({ showRoundOff: v })} />
                <Toggle label="Paid" checked={design.showPaid} disabled={!canManage} onChange={(v) => patch({ showPaid: v })} />
                <Toggle label="Balance" checked={design.showBalance} disabled={!canManage} onChange={(v) => patch({ showBalance: v })} />
                <Toggle label="Points redeemed" checked={design.showLoyalty} disabled={!canManage} onChange={(v) => patch({ showLoyalty: v })} />
                <Toggle label="Amount in words" checked={design.showAmountInWords} disabled={!canManage} onChange={(v) => patch({ showAmountInWords: v })} />
                <Toggle label="Bill barcode" checked={design.showBarcode} disabled={!canManage} onChange={(v) => patch({ showBarcode: v })} />
                <Toggle label="Signature line" checked={design.showSignature} disabled={!canManage} onChange={(v) => patch({ showSignature: v })} />
              </div>
              {design.showSignature && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Signature label</label>
                  <Input value={design.signatureLabel} disabled={!canManage} onChange={(e) => patch({ signatureLabel: e.target.value })} />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 py-4">
              <p className="text-sm font-semibold">Extra lines</p>
              <LineList
                label="Under the shop name"
                lines={design.headerLines}
                max={6}
                disabled={!canManage}
                onChange={(headerLines) => patch({ headerLines })}
              />
              <LineList
                label="Footer (terms, thanks, bank details)"
                lines={design.footerLines}
                max={8}
                disabled={!canManage}
                onChange={(footerLines) => patch({ footerLines })}
              />
            </CardContent>
          </Card>
        </div>

        {/* ------------------------------------------------------- preview */}
        <Card className="h-fit xl:sticky xl:top-4">
          <CardContent className="space-y-2 py-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Live preview</p>
              <span className="text-xs text-muted-foreground">Sample bill, drawn by the same code that prints</span>
            </div>
            <div className="overflow-auto rounded-lg border border-border bg-muted/40 p-4">
              <InvoiceDocument
                design={design}
                company={company}
                sale={SAMPLE_INVOICE.sale}
                lines={SAMPLE_INVOICE.lines}
                className="mx-auto shadow-sm"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function clampNumber(raw: string, min: number, max: number, fallback: number): number {
  const value = parseFloat(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-primary"
      />
      {label}
    </label>
  );
}

/** A small editable list of free-text lines, for the header and footer blocks. */
function LineList({
  label,
  lines,
  max,
  disabled,
  onChange,
}: {
  label: string;
  lines: string[];
  max: number;
  disabled?: boolean;
  onChange: (lines: string[]) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {lines.map((line, index) => (
        <div key={index} className="flex items-center gap-1">
          <Input
            value={line}
            disabled={disabled}
            onChange={(e) => onChange(lines.map((l, i) => (i === index ? e.target.value : l)))}
            className="h-8 text-xs"
          />
          <Button
            size="icon"
            variant="ghost"
            aria-label="Remove line"
            disabled={disabled}
            onClick={() => onChange(lines.filter((_, i) => i !== index))}
          >
            <Minus className="h-3 w-3" />
          </Button>
        </div>
      ))}
      {lines.length < max && (
        <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onChange([...lines, ""])}>
          <Plus className="h-3 w-3" />
          Add line
        </Button>
      )}
    </div>
  );
}
