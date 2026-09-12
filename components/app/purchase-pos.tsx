"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Trash2, Plus, Minus, ShoppingBag, PauseCircle, X, Receipt, Ban, Printer } from "lucide-react";
import { savePurchase, discardHeldPurchase, getPurchaseWithItems, cancelPurchase, getPurchaseInvoiceData } from "@/app/actions/purchases";
import { PURCHASE_DOC_TYPES, PURCHASE_DOC_TYPE_LABELS, PURCHASE_PAYMENT_METHODS, PURCHASE_PAYMENT_METHOD_LABELS } from "@/lib/validation/purchases";
import { PurchaseDocument } from "@/components/app/purchase-document";
import type { InvoiceCompany } from "@/components/app/invoice-document";
import { getPrintService, type PrintFormat } from "@/lib/print";
import type { InvoiceDesign } from "@/lib/print/templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CancelDocDialog } from "@/components/app/cancel-doc-dialog";

type Product = {
  id: string;
  itemCode: string;
  name: string;
  barcode: string | null;
  purchasePrice: string;
  taxRateId: string | null;
  trackSerial: boolean;
};
type Supplier = { id: string; name: string; phone: string | null };
type TaxRate = { id: string; ratePercent: string };
type Warehouse = { id: string; name: string; label: string };
type HeldPurchase = { id: string; docNumber: string; docType: string; totalAmount: string; updatedAt: Date };
type ReturnablePurchase = { id: string; docNumber: string; totalAmount: string; supplierId: string; createdAt: Date };

type CartLine = {
  productId: string;
  itemCode: string;
  name: string;
  quantity: number;
  unitCost: number;
  discountPercent: number;
  taxRatePercent: number;
  batchNumber: string;
  expiryDate: string;
  /** One per unit, for products flagged to track serials. */
  serials: string[];
};

type PaymentRow = { method: (typeof PURCHASE_PAYMENT_METHODS)[number]; amount: number };
type RecentPurchase = {
  id: string;
  docNumber: string;
  docType: string;
  status: string;
  totalAmount: string;
  amountPaid: string;
  supplierName: string;
  createdAt: Date;
  cancelReason: string | null;
};

const money = (n: number) => `₹${n.toFixed(2)}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function PurchasePos({
  products,
  suppliers,
  taxRates,
  warehouses,
  heldPurchases,
  recentPurchases,
  returnablePurchases,
  canManage,
  company,
  invoiceDesign,
}: {
  products: Product[];
  suppliers: Supplier[];
  taxRates: TaxRate[];
  warehouses: Warehouse[];
  heldPurchases: HeldPurchase[];
  recentPurchases: RecentPurchase[];
  returnablePurchases: ReturnablePurchase[];
  canManage: boolean;
  company: InvoiceCompany | null;
  invoiceDesign: InvoiceDesign;
}) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [docType, setDocType] = React.useState<(typeof PURCHASE_DOC_TYPES)[number]>("purchase");
  const [supplierId, setSupplierId] = React.useState(suppliers[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = React.useState(warehouses[0]?.id ?? "");
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = React.useState("");
  const [originalPurchaseId, setOriginalPurchaseId] = React.useState("none");
  const [payments, setPayments] = React.useState<PaymentRow[]>([{ method: "cash", amount: 0 }]);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [tab, setTab] = React.useState<"buy" | "held" | "recent">("buy");
  const [cancelTarget, setCancelTarget] = React.useState<RecentPurchase | null>(null);
  const [justCompleted, setJustCompleted] = React.useState<{ id: string; docNumber: string } | null>(null);

  const taxRateById = React.useMemo(() => Object.fromEntries(taxRates.map((t) => [t.id, parseFloat(t.ratePercent)])), [taxRates]);
  const productById = React.useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);
  // A purchase order commits nothing, so it never asks for serials; a receipt
  // and a return both move real units and do.
  const movesStock = docType === "purchase" || docType === "purchase_return";

  // Passed to Select.Root as `items` so Select.Value can resolve a label right
  // away — otherwise it only knows labels once the popup has opened once.
  const docTypeItems = React.useMemo(() => PURCHASE_DOC_TYPES.map((t) => ({ value: t, label: PURCHASE_DOC_TYPE_LABELS[t] })), []);
  const paymentMethodItems = React.useMemo(() => PURCHASE_PAYMENT_METHODS.map((m) => ({ value: m, label: PURCHASE_PAYMENT_METHOD_LABELS[m] })), []);
  const supplierItems = React.useMemo(() => suppliers.map((s) => ({ value: s.id, label: s.name })), [suppliers]);
  const warehouseItems = React.useMemo(() => warehouses.map((w) => ({ value: w.id, label: w.label })), [warehouses]);
  // Only bills from the supplier currently selected can be returned against —
  // a return has to match the party it is crediting.
  const originalPurchaseItems = React.useMemo(
    () => [
      { value: "none", label: "Not against a specific purchase" },
      ...returnablePurchases.filter((p) => p.supplierId === supplierId).map((p) => ({ value: p.id, label: `${p.docNumber} — ${money(parseFloat(p.totalAmount))}` })),
    ],
    [returnablePurchases, supplierId]
  );

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 30);
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.itemCode.toLowerCase().includes(q) || p.barcode?.toLowerCase() === q).slice(0, 30);
  }, [products, search]);

  function addProduct(p: Product) {
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === p.id);
      if (existing) return prev.map((l) => (l.productId === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [
        ...prev,
        {
          productId: p.id,
          itemCode: p.itemCode,
          name: p.name,
          quantity: 1,
          unitCost: parseFloat(p.purchasePrice) || 0,
          discountPercent: 0,
          taxRatePercent: p.taxRateId ? taxRateById[p.taxRateId] ?? 0 : 0,
          batchNumber: "",
          expiryDate: "",
          serials: [],
        },
      ];
    });
  }

  function handleScan(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const q = search.trim().toLowerCase();
    if (!q) return;
    const exact = products.find((p) => p.barcode?.toLowerCase() === q || p.itemCode.toLowerCase() === q);
    if (exact) {
      addProduct(exact);
      setSearch("");
    }
  }

  function updateLine(productId: string, patch: Partial<CartLine>) {
    setCart((prev) => prev.map((l) => (l.productId === productId ? { ...l, ...patch } : l)));
  }

  function removeLine(productId: string) {
    setCart((prev) => prev.filter((l) => l.productId !== productId));
  }

  const totals = React.useMemo(() => {
    let subtotal = 0;
    let discountAmount = 0;
    let taxAmount = 0;
    for (const l of cart) {
      const lineSubtotal = l.quantity * l.unitCost;
      const lineDiscount = lineSubtotal * (l.discountPercent / 100);
      const taxable = lineSubtotal - lineDiscount;
      const lineTax = taxable * (l.taxRatePercent / 100);
      subtotal += lineSubtotal;
      discountAmount += lineDiscount;
      taxAmount += lineTax;
    }
    const totalAmount = subtotal - discountAmount + taxAmount;
    const amountPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
    return { subtotal, discountAmount, taxAmount, totalAmount, amountPaid, due: totalAmount - amountPaid };
  }, [cart, payments]);

  function resetForm() {
    setCart([]);
    setDocType("purchase");
    setSupplierId(suppliers[0]?.id ?? "");
    setWarehouseId(warehouses[0]?.id ?? "");
    setSupplierInvoiceNumber("");
    setOriginalPurchaseId("none");
    setPayments([{ method: "cash", amount: 0 }]);
    setEditingId(null);
    setJustCompleted(null);
  }

  async function handleSave(isDraft: boolean) {
    if (cart.length === 0) {
      toast.error("Add at least one item first.");
      return;
    }
    if (!supplierId) {
      toast.error("Select a supplier first.");
      return;
    }
    // Serials only matter once the document is final; a held document can be
    // resumed and completed when the goods are actually in hand.
    if (!isDraft && movesStock) {
      const missing = cart.find(
        (l) => productById[l.productId]?.trackSerial && l.serials.length !== Math.round(l.quantity)
      );
      if (missing) {
        toast.error(`${missing.name}: enter ${Math.round(missing.quantity)} serial number(s).`);
        return;
      }
    }
    setSaving(true);
    const result = await savePurchase(editingId, {
      docType,
      isDraft,
      warehouseId,
      originalPurchaseId: docType === "purchase_return" ? originalPurchaseId : "none",
      supplierId,
      supplierInvoiceNumber,
      items: cart.map((l) => ({
        productId: l.productId,
        itemCode: l.itemCode,
        name: l.name,
        quantity: l.quantity,
        unitCost: l.unitCost,
        discountPercent: l.discountPercent,
        taxRatePercent: l.taxRatePercent,
        batchNumber: l.batchNumber,
        expiryDate: l.expiryDate,
        serialNumbers: l.serials.join(","),
      })),
      payments: isDraft ? [] : payments.filter((p) => p.amount > 0),
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(isDraft ? `Held as ${result.docNumber}` : `${PURCHASE_DOC_TYPE_LABELS[docType]} ${result.docNumber} completed`);
    const completed = !isDraft && result.purchaseId && result.docNumber ? { id: result.purchaseId, docNumber: result.docNumber } : null;
    resetForm();
    if (completed) setJustCompleted(completed);
    router.refresh();
  }

  async function resumePurchase(purchaseId: string) {
    const data = await getPurchaseWithItems(purchaseId);
    if (!data) {
      toast.error("Could not load that document.");
      return;
    }
    const validItems = data.items.filter((i): i is typeof i & { productId: string } => !!i.productId);
    if (validItems.length < data.items.length) {
      toast.error("Some items no longer exist and were dropped.");
    }
    setDocType(data.purchase.docType);
    setSupplierId(data.purchase.supplierId);
    setWarehouseId(data.purchase.warehouseId ?? warehouses[0]?.id ?? "");
    setSupplierInvoiceNumber(data.purchase.supplierInvoiceNumber ?? "");
    setOriginalPurchaseId(data.purchase.originalPurchaseId ?? "none");
    setCart(
      validItems.map((i) => ({
        productId: i.productId,
        itemCode: i.itemCode,
        name: i.name,
        quantity: parseFloat(i.quantity),
        unitCost: parseFloat(i.unitCost),
        discountPercent: parseFloat(i.discountPercent),
        taxRatePercent: parseFloat(i.taxRatePercent),
        batchNumber: i.batchNumber ?? "",
        expiryDate: i.expiryDate ?? "",
        serials: i.serialNumbers ? i.serialNumbers.split(",").map((v) => v.trim().toUpperCase()).filter(Boolean) : [],
      }))
    );
    setEditingId(purchaseId);
    setTab("buy");
    toast.success(`Resumed ${data.purchase.docNumber}`);
  }

  async function discardPurchase(purchaseId: string) {
    if (!confirm("Discard this held document? This cannot be undone.")) return;
    const result = await discardHeldPurchase(purchaseId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Held document discarded");
    if (editingId === purchaseId) resetForm();
    router.refresh();
  }

  async function confirmCancel(reason: string) {
    if (!cancelTarget) return;
    setSaving(true);
    const result = await cancelPurchase(cancelTarget.id, reason);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${cancelTarget.docNumber} cancelled — stock and books reversed`);
    setCancelTarget(null);
    router.refresh();
  }

  if (!canManage) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">You have view-only access to purchases.</CardContent>
      </Card>
    );
  }

  if (suppliers.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">Add a supplier first under Suppliers before recording a purchase.</CardContent>
      </Card>
    );
  }

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as "buy" | "held" | "recent")} className="space-y-4">
      <TabsList>
        <TabsTrigger value="buy">
          <ShoppingBag className="h-4 w-4" />
          Purchase
        </TabsTrigger>
        <TabsTrigger value="held">
          <PauseCircle className="h-4 w-4" />
          Held ({heldPurchases.length})
        </TabsTrigger>
        <TabsTrigger value="recent">
          <Receipt className="h-4 w-4" />
          Recent
        </TabsTrigger>
      </TabsList>

      <TabsContent value="buy" className="space-y-4">
        {justCompleted && (
          <div className="flex items-center justify-between rounded-lg border border-chart-3/40 bg-chart-3/5 px-4 py-2 text-sm">
            <span>{justCompleted.docNumber} completed.</span>
            <div className="flex items-center gap-2">
              <PrintPurchaseButton purchaseId={justCompleted.id} company={company} design={invoiceDesign} label={`Print ${justCompleted.docNumber}`} />
              <Button variant="ghost" size="icon" aria-label="Dismiss" onClick={() => setJustCompleted(null)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
        {editingId && (
          <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm">
            <span>Editing a held document.</span>
            <Button variant="ghost" size="sm" onClick={resetForm}>
              <X className="h-3.5 w-3.5" />
              Start new
            </Button>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-5">
          <div className="space-y-3 lg:col-span-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleScan}
                placeholder="Search by name, item code, or scan barcode…"
                className="pl-9"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addProduct(p)}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-left text-sm transition-colors hover:border-primary/40 hover:bg-accent/40"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.itemCode}</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {money(parseFloat(p.purchasePrice) || 0)}
                  </Badge>
                </button>
              ))}
              {filtered.length === 0 && <p className="col-span-2 py-6 text-center text-sm text-muted-foreground">No products match.</p>}
            </div>
          </div>

          <div className="space-y-4 lg:col-span-2">
            <Card>
              <CardContent className="space-y-3 py-4">
                <div className="grid grid-cols-2 gap-2">
                  <Select
                    items={docTypeItems}
                    value={docType}
                    onValueChange={(v) => {
                      const next = v as (typeof PURCHASE_DOC_TYPES)[number];
                      setDocType(next);
                      if (next !== "purchase_return") setOriginalPurchaseId("none");
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PURCHASE_DOC_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {PURCHASE_DOC_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select items={supplierItems} value={supplierId} onValueChange={(v) => setSupplierId(v ?? "")}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {warehouses.length > 0 ? (
                  <Select items={warehouseItems} value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? "")}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Warehouse (for stock)" />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  movesStock && (
                    <div className="space-y-1">
                      <Select items={[]} value="" disabled onValueChange={() => {}}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="No warehouse configured" />
                        </SelectTrigger>
                        <SelectContent />
                      </Select>
                      <p className="text-xs text-destructive">Set up a warehouse under Settings before completing this document.</p>
                    </div>
                  )
                )}
                {docType === "purchase_return" && (
                  <Select items={originalPurchaseItems} value={originalPurchaseId} onValueChange={(v) => setOriginalPurchaseId(v ?? "none")}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Return against purchase" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not against a specific purchase</SelectItem>
                      {returnablePurchases
                        .filter((p) => p.supplierId === supplierId)
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.docNumber} — {money(parseFloat(p.totalAmount))}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
                <Input
                  value={supplierInvoiceNumber}
                  onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
                  placeholder="Supplier invoice number (optional)"
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-1 py-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{money(totals.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Discount</span>
                  <span>-{money(totals.discountAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span>{money(totals.taxAmount)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-1.5 text-base font-semibold">
                  <span>Total</span>
                  <span>{money(totals.totalAmount)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Paid</span>
                  <span>{money(totals.amountPaid)}</span>
                </div>
                <div className={`flex justify-between font-medium ${totals.due > 0.004 ? "text-destructive" : "text-muted-foreground"}`}>
                  <span>Due to supplier</span>
                  <span>{money(totals.due)}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-2 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment</p>
                {payments.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Select
                      items={paymentMethodItems}
                      value={p.method}
                      onValueChange={(v) => setPayments((prev) => prev.map((row, idx) => (idx === i ? { ...row, method: v as PaymentRow["method"] } : row)))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PURCHASE_PAYMENT_METHODS.map((m) => (
                          <SelectItem key={m} value={m}>
                            {PURCHASE_PAYMENT_METHOD_LABELS[m]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      value={p.amount || ""}
                      onChange={(e) =>
                        setPayments((prev) => prev.map((row, idx) => (idx === i ? { ...row, amount: parseFloat(e.target.value) || 0 } : row)))
                      }
                      placeholder="0.00"
                      className="w-28"
                    />
                    {payments.length > 1 && (
                      <Button variant="ghost" size="icon" aria-label="Remove payment row" onClick={() => setPayments((prev) => prev.filter((_, idx) => idx !== i))}>
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <Button variant="secondary" size="sm" onClick={() => setPayments((prev) => [...prev, { method: "cash", amount: 0 }])}>
                    <Plus className="h-3.5 w-3.5" />
                    Split payment
                  </Button>
                  <Button variant="link" size="sm" onClick={() => setPayments([{ method: payments[0]?.method ?? "cash", amount: round2(totals.totalAmount) }])}>
                    Full amount
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" disabled={saving || cart.length === 0} onClick={() => handleSave(true)}>
                Hold
              </Button>
              <Button className="flex-1" disabled={saving || cart.length === 0} onClick={() => handleSave(false)}>
                {saving ? "Saving…" : `Complete ${PURCHASE_DOC_TYPE_LABELS[docType]}`}
              </Button>
            </div>
          </div>
        </div>

        {cart.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-20">Qty</TableHead>
                  <TableHead className="w-24">Cost</TableHead>
                  <TableHead className="w-20">Disc %</TableHead>
                  <TableHead className="w-20">Tax %</TableHead>
                  <TableHead className="w-28">Batch</TableHead>
                  <TableHead className="w-32">Expiry</TableHead>
                  <TableHead className="text-right">Line Total</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {cart.map((l) => {
                  const lineSubtotal = l.quantity * l.unitCost;
                  const lineDiscount = lineSubtotal * (l.discountPercent / 100);
                  const taxable = lineSubtotal - lineDiscount;
                  const lineTax = taxable * (l.taxRatePercent / 100);
                  const lineTotal = taxable + lineTax;
                  return (
                    <TableRow key={l.productId}>
                      <TableCell>
                        <p className="font-medium">{l.name}</p>
                        <p className="text-xs text-muted-foreground">{l.itemCode}</p>
                        {movesStock && productById[l.productId]?.trackSerial && (
                          <PurchaseSerialEntry line={l} onChange={(serials) => updateLine(l.productId, { serials })} />
                        )}
                      </TableCell>
                      <TableCell>
                        <Input type="number" value={l.quantity} min={0.001} step="any" onChange={(e) => updateLine(l.productId, { quantity: parseFloat(e.target.value) || 0 })} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" value={l.unitCost} step="any" onChange={(e) => updateLine(l.productId, { unitCost: parseFloat(e.target.value) || 0 })} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" value={l.discountPercent} step="any" onChange={(e) => updateLine(l.productId, { discountPercent: parseFloat(e.target.value) || 0 })} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" value={l.taxRatePercent} step="any" onChange={(e) => updateLine(l.productId, { taxRatePercent: parseFloat(e.target.value) || 0 })} />
                      </TableCell>
                      <TableCell>
                        <Input value={l.batchNumber} onChange={(e) => updateLine(l.productId, { batchNumber: e.target.value })} placeholder="—" />
                      </TableCell>
                      <TableCell>
                        <Input type="date" value={l.expiryDate} onChange={(e) => updateLine(l.productId, { expiryDate: e.target.value })} />
                      </TableCell>
                      <TableCell className="text-right font-medium">{money(lineTotal)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" aria-label="Remove item" onClick={() => removeLine(l.productId)}>
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
      </TabsContent>

      <TabsContent value="held" className="space-y-3">
        {heldPurchases.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">No held documents.</CardContent>
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Doc No.</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {heldPurchases.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.docNumber}</TableCell>
                    <TableCell>{PURCHASE_DOC_TYPE_LABELS[p.docType as (typeof PURCHASE_DOC_TYPES)[number]]}</TableCell>
                    <TableCell>{money(parseFloat(p.totalAmount))}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="secondary" size="sm" onClick={() => resumePurchase(p.id)}>
                          Resume
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Discard" onClick={() => discardPurchase(p.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </TabsContent>

      <TabsContent value="recent" className="space-y-3">
        {recentPurchases.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">No completed documents yet.</CardContent>
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Doc No.</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentPurchases.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.docNumber}</TableCell>
                    <TableCell>{PURCHASE_DOC_TYPE_LABELS[r.docType as (typeof PURCHASE_DOC_TYPES)[number]]}</TableCell>
                    <TableCell>{r.supplierName}</TableCell>
                    <TableCell>{money(parseFloat(r.totalAmount))}</TableCell>
                    <TableCell>
                      {r.status === "cancelled" ? (
                        <Badge variant="destructive" title={r.cancelReason ?? undefined}>
                          Cancelled
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Completed</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <PrintPurchaseButton purchaseId={r.id} company={company} design={invoiceDesign} />
                        {r.status === "completed" && (
                          <Button variant="ghost" size="sm" onClick={() => setCancelTarget(r)}>
                            <Ban className="h-3.5 w-3.5 text-destructive" />
                            Cancel
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </TabsContent>

      <CancelDocDialog
        docNumber={cancelTarget?.docNumber ?? null}
        open={!!cancelTarget}
        busy={saving}
        description="The stock this document moved is moved back and its journal entry is reversed. The document stays on record, marked cancelled."
        onClose={() => setCancelTarget(null)}
        onConfirm={confirmCancel}
      />
    </Tabs>
  );
}

type PurchaseInvoiceDetail = Awaited<ReturnType<typeof getPurchaseInvoiceData>>;

const PRINT_SIZES = [
  { value: "a4", label: "A4" },
  { value: "a5", label: "A5" },
  { value: "80mm", label: "80mm" },
  { value: "58mm", label: "58mm" },
] as const;
type PrintSize = (typeof PRINT_SIZES)[number]["value"];

/** Prints one purchase document. Mirrors `PrintSaleButton` in billing-pos.tsx. */
function PrintPurchaseButton({
  purchaseId,
  company,
  design,
  label,
}: {
  purchaseId: string;
  company: InvoiceCompany | null;
  design: InvoiceDesign;
  label?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [detail, setDetail] = React.useState<PurchaseInvoiceDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [size, setSize] = React.useState<PrintSize>(design.paper as PrintSize);
  const activeDesign = React.useMemo(() => ({ ...design, paper: size }), [design, size]);

  async function handleClick() {
    setLoading(true);
    try {
      const data = await getPurchaseInvoiceData(purchaseId);
      if (!data) { toast.error("Could not load that document."); return; }
      setDetail(data);
    } catch {
      toast.error("Could not load that document.");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (!detail || !ref.current) return;
    const element = ref.current;
    void getPrintService()
      .print({ element, format: size as PrintFormat, title: detail.purchase.docNumber })
      .finally(() => setDetail(null));
  }, [detail, size]);

  return (
    <>
      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="sm" disabled={loading} onClick={handleClick}>
          <Printer className="h-3.5 w-3.5" />
          {loading ? "Loading…" : (label ?? "Print")}
        </Button>
        <Select items={PRINT_SIZES} value={size} onValueChange={(v) => v && setSize(v as PrintSize)}>
          <SelectTrigger className="h-7 w-[62px] px-1.5 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRINT_SIZES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {detail && (
        <div className="fixed left-[-9999px] top-0" aria-hidden>
          <div ref={ref}>
            <PurchaseDocument design={activeDesign} company={company} purchase={detail.purchase} lines={detail.lines} />
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Serial entry for a received line. Units arriving from a supplier are new to
 * the shop, so they are typed or scanned rather than picked from a list; each
 * one is checked against what is already in stock when the document is saved.
 */
function PurchaseSerialEntry({ line, onChange }: { line: CartLine; onChange: (serials: string[]) => void }) {
  const [draft, setDraft] = React.useState("");
  const needed = Math.round(line.quantity);

  function add(raw: string) {
    // A scanner gun that fires a whole batch at once still lands correctly.
    const incoming = raw
      .split(/[,;\n\t]+/)
      .map((v) => v.trim().toUpperCase())
      .filter((v) => v.length > 0 && !line.serials.includes(v));
    if (incoming.length === 0) return;
    onChange([...line.serials, ...new Set(incoming)]);
    setDraft("");
  }

  return (
    <div className="mt-1.5 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1">
        {line.serials.map((serial) => (
          <Badge key={serial} variant="secondary" className="gap-1 font-mono text-[11px]">
            {serial}
            <button
              type="button"
              aria-label={`Remove serial ${serial}`}
              onClick={() => onChange(line.serials.filter((s) => s !== serial))}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <span className={`text-[11px] ${line.serials.length === needed ? "text-muted-foreground" : "text-destructive"}`}>
          {line.serials.length}/{needed} serial{needed === 1 ? "" : "s"}
        </span>
      </div>
      {line.serials.length < needed && (
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => add(draft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            }
          }}
          placeholder="Scan or type a serial, then Enter"
          className="h-8 font-mono text-xs"
        />
      )}
    </div>
  );
}
