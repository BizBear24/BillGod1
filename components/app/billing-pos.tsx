"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Trash2, Plus, Minus, ShoppingCart, PauseCircle, X, Receipt, Ban, Award, Ticket, Printer } from "lucide-react";
import { saveSale, discardHeldSale, getSaleWithItems, cancelSale, getInvoiceData } from "@/app/actions/sales";
import { checkCoupon } from "@/app/actions/engagement";
import { SALE_DOC_TYPES, SALE_DOC_TYPE_LABELS, SALE_PAYMENT_METHODS, SALE_PAYMENT_METHOD_LABELS } from "@/lib/validation/sales";
import { computeSaleTotals, round2 } from "@/lib/sales/totals";
import { resolveTier, type TierRow } from "@/lib/loyalty/tiers";
import { InvoiceDocument, type InvoiceCompany } from "@/components/app/invoice-document";
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
  sellingPrice: string;
  mrp: string;
  taxRateId: string | null;
  trackSerial: boolean;
};
type Customer = { id: string; name: string; phone: string | null; loyaltyPoints: string };
type LoyaltyConfig = { enabled: boolean; pointsPerCurrency: number; currencyPerPoint: number; minPointsToRedeem: number; expiryDays: number };
type Salesperson = { id: string; name: string };
type TaxRate = { id: string; name: string; ratePercent: string };
type Warehouse = { id: string; name: string; label: string };
type Counter = { id: string; name: string; label: string; isDefault: boolean };
type ReturnableSale = {
  id: string;
  docNumber: string;
  totalAmount: string;
  customerId: string | null;
  tierDiscountPercent: string;
  createdAt: Date;
};
type HeldSale = { id: string; docNumber: string; docType: string; totalAmount: string; updatedAt: Date };
type RecentSale = {
  id: string;
  docNumber: string;
  docType: string;
  status: string;
  totalAmount: string;
  amountPaid: string;
  customerName: string | null;
  counterId: string | null;
  createdAt: Date;
  cancelReason: string | null;
};

type CartLine = {
  productId: string;
  itemCode: string;
  name: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxRatePercent: number;
  /** Only used by products flagged to track serials; one entry per unit. */
  serials: string[];
};

type PaymentRow = { method: (typeof SALE_PAYMENT_METHODS)[number]; amount: number };

const money = (n: number) => `₹${n.toFixed(2)}`;

export function BillingPos({
  products,
  customers,
  salespersons,
  taxRates,
  warehouses,
  counters,
  heldSales,
  recentSales,
  returnableSales,
  loyalty,
  tiers,
  serialsByProduct,
  stockByProduct,
  canManage,
  company,
  invoiceDesign,
}: {
  products: Product[];
  customers: Customer[];
  salespersons: Salesperson[];
  taxRates: TaxRate[];
  warehouses: Warehouse[];
  counters: Counter[];
  heldSales: HeldSale[];
  recentSales: RecentSale[];
  returnableSales: ReturnableSale[];
  loyalty: LoyaltyConfig;
  tiers: TierRow[];
  /** In-stock serials the cashier can pick from, keyed by product id. */
  serialsByProduct: Record<string, string[]>;
  stockByProduct: Record<string, number>;
  canManage: boolean;
  company: InvoiceCompany | null;
  invoiceDesign: InvoiceDesign;
}) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [docType, setDocType] = React.useState<(typeof SALE_DOC_TYPES)[number]>("sale");
  const [customerId, setCustomerId] = React.useState("walkin");
  const [salespersonId, setSalespersonId] = React.useState("none");
  const [warehouseId, setWarehouseId] = React.useState(warehouses[0]?.id ?? "");
  const [counterId, setCounterId] = React.useState(counters.find((c) => c.isDefault)?.id ?? counters[0]?.id ?? "none");
  const [originalSaleId, setOriginalSaleId] = React.useState("none");
  const [notes, setNotes] = React.useState("");
  const [redeemPoints, setRedeemPoints] = React.useState(0);
  const [coupon, setCoupon] = React.useState<{ code: string; discountAmount: number; description: string } | null>(null);
  const [couponDraft, setCouponDraft] = React.useState("");
  const [checkingCoupon, setCheckingCoupon] = React.useState(false);
  const [payments, setPayments] = React.useState<PaymentRow[]>([{ method: "cash", amount: 0 }]);
  const [editingSaleId, setEditingSaleId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [tab, setTab] = React.useState<"sell" | "held" | "recent">("sell");
  const [cancelTarget, setCancelTarget] = React.useState<RecentSale | null>(null);
  const [justCompleted, setJustCompleted] = React.useState<{ id: string; docNumber: string } | null>(null);

  const taxRateById = React.useMemo(() => Object.fromEntries(taxRates.map((t) => [t.id, parseFloat(t.ratePercent)])), [taxRates]);
  const productById = React.useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);

  // A return brings serial-tracked units back in, so its serials are typed
  // (they are, by definition, not in stock); everything else picks from stock.
  const movesStock = docType === "sale" || docType === "challan" || docType === "sale_return";
  const serialsComeBackIn = docType === "sale_return";

  // Passed to Select.Root as `items` so Select.Value can resolve a label right
  // away — otherwise it only knows labels once the popup has opened once.
  const docTypeItems = React.useMemo(() => SALE_DOC_TYPES.map((t) => ({ value: t, label: SALE_DOC_TYPE_LABELS[t] })), []);
  // Deduped by percent — several named rates (e.g. "GST 18%" and "IGST 18%")
  // can share a rate, and the cart line only stores the number.
  const taxRateOptions = React.useMemo(() => {
    const seen = new Set<number>();
    const opts: { value: string; label: string }[] = [];
    for (const t of taxRates) {
      const pct = parseFloat(t.ratePercent);
      if (!Number.isFinite(pct) || seen.has(pct)) continue;
      seen.add(pct);
      opts.push({ value: String(pct), label: `${pct}% — ${t.name}` });
    }
    return opts.sort((a, b) => parseFloat(a.value) - parseFloat(b.value));
  }, [taxRates]);
  const paymentMethodItems = React.useMemo(() => SALE_PAYMENT_METHODS.map((m) => ({ value: m, label: SALE_PAYMENT_METHOD_LABELS[m] })), []);
  const salespersonItems = React.useMemo(
    () => [{ value: "none", label: "No salesperson" }, ...salespersons.map((s) => ({ value: s.id, label: s.name }))],
    [salespersons]
  );
  const customerItems = React.useMemo(
    () => [{ value: "walkin", label: "Walk-in Customer" }, ...customers.map((c) => ({ value: c.id, label: c.phone ? `${c.name} (${c.phone})` : c.name }))],
    [customers]
  );
  const warehouseItems = React.useMemo(() => warehouses.map((w) => ({ value: w.id, label: w.label })), [warehouses]);
  const counterItems = React.useMemo(
    () => [{ value: "none", label: "No counter" }, ...counters.map((c) => ({ value: c.id, label: c.label }))],
    [counters]
  );
  const originalSaleItems = React.useMemo(
    () => [
      { value: "none", label: "Not against a specific bill" },
      ...returnableSales.map((s) => ({ value: s.id, label: `${s.docNumber} — ${money(parseFloat(s.totalAmount))}` })),
    ],
    [returnableSales]
  );

  const selectedCustomer = customerId === "walkin" ? null : customers.find((c) => c.id === customerId) ?? null;
  const availablePoints = selectedCustomer ? Math.floor(parseFloat(selectedCustomer.loyaltyPoints)) : 0;

  // Previews the tier the server will apply. The server resolves it again from
  // the customer's stored balance before saving, so this display can never
  // decide what a bill is actually discounted by.
  const activeTier = React.useMemo(
    () => (loyalty.enabled && selectedCustomer ? resolveTier(tiers, availablePoints) : null),
    [loyalty.enabled, selectedCustomer, tiers, availablePoints]
  );
  const linkedOriginal = returnableSales.find((s) => s.id === originalSaleId) ?? null;
  // A sale is discounted by the customer's current tier; a return copies the
  // rate off the bill it reverses, so the refund matches what was charged.
  const tierDiscountPercent =
    docType === "sale"
      ? activeTier?.discountPercent ?? 0
      : docType === "sale_return" && linkedOriginal
        ? parseFloat(linkedOriginal.tierDiscountPercent) || 0
        : 0;

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 30);
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.itemCode.toLowerCase().includes(q) || p.barcode?.toLowerCase() === q).slice(0, 30);
  }, [products, search]);

  function addProduct(p: Product) {
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === p.id);
      if (existing) {
        return prev.map((l) => (l.productId === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        {
          productId: p.id,
          itemCode: p.itemCode,
          name: p.name,
          quantity: 1,
          unitPrice: parseFloat(p.sellingPrice) || 0,
          discountPercent: 0,
          taxRatePercent: p.taxRateId ? taxRateById[p.taxRateId] ?? 0 : 0,
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

  // Exactly the arithmetic the server will redo when the bill is saved.
  const computed = React.useMemo(
    () => computeSaleTotals(cart, { tierDiscountPercent, couponDiscountAmount: coupon?.discountAmount ?? 0 }),
    [cart, tierDiscountPercent, coupon]
  );

  const totals = React.useMemo(() => {
    const amountPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
    // Points settle part of the bill without money changing hands, so they
    // reduce what is still due alongside the payments.
    const redeemedValue = Math.min(round2(redeemPoints * loyalty.currencyPerPoint), computed.totalAmount);
    return {
      ...computed,
      amountPaid,
      redeemedValue,
      due: round2(computed.totalAmount - amountPaid - redeemedValue),
    };
  }, [computed, payments, redeemPoints, loyalty.currencyPerPoint]);

  // Redeeming more than the bill is worth just burns points, so cap the
  // "Max" shortcut at what this bill can actually absorb.
  const maxUsefulPoints =
    loyalty.currencyPerPoint > 0 ? Math.min(availablePoints, Math.ceil(totals.totalAmount / loyalty.currencyPerPoint)) : availablePoints;

  function resetForm() {
    setCart([]);
    setDocType("sale");
    setCustomerId("walkin");
    setSalespersonId("none");
    setWarehouseId(warehouses[0]?.id ?? "");
    setOriginalSaleId("none");
    setNotes("");
    setRedeemPoints(0);
    setCoupon(null);
    setCouponDraft("");
    setPayments([{ method: "cash", amount: 0 }]);
    setEditingSaleId(null);
    setJustCompleted(null);
  }

  /**
   * Prices the code against this bill. The server decides what it is worth —
   * this only shows the answer, and `saveSale` asks again before committing,
   * so a code that runs out between the two is caught.
   */
  async function applyCoupon() {
    const code = couponDraft.trim();
    if (!code) return;
    setCheckingCoupon(true);
    // Coupons come off what is left after line discounts and the loyalty tier.
    const beforeCoupon = computeSaleTotals(cart, { tierDiscountPercent });
    const result = await checkCoupon({
      code,
      discountableAmount: round2(beforeCoupon.subtotal - beforeCoupon.discountAmount),
      customerId: customerId === "walkin" ? null : customerId,
    });
    setCheckingCoupon(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setCoupon({ code: result.code, discountAmount: result.discountAmount, description: result.description });
    setCouponDraft("");
  }

  async function handleSave(isDraft: boolean) {
    if (cart.length === 0) {
      toast.error("Add at least one item first.");
      return;
    }
    // Serials only matter once the document is final; a held bill can be
    // resumed and completed later, when the units are actually in hand.
    if (!isDraft && movesStock) {
      const missing = cart.find(
        (l) => productById[l.productId]?.trackSerial && l.serials.length !== Math.round(l.quantity)
      );
      if (missing) {
        toast.error(`${missing.name}: pick ${Math.round(missing.quantity)} serial number(s).`);
        return;
      }
    }
    setSaving(true);
    const result = await saveSale(editingSaleId, {
      docType,
      isDraft,
      warehouseId,
      counterId,
      originalSaleId: docType === "sale_return" ? originalSaleId : "none",
      customerId,
      salespersonId,
      notes,
      couponCode: isDraft ? undefined : coupon?.code,
      redeemPoints: isDraft ? 0 : redeemPoints,
      items: cart.map((l) => ({
        productId: l.productId,
        itemCode: l.itemCode,
        name: l.name,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountPercent: l.discountPercent,
        taxRatePercent: l.taxRatePercent,
        serialNumbers: l.serials.join(","),
      })),
      payments: isDraft ? [] : payments.filter((p) => p.amount > 0),
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(isDraft ? `Held as ${result.docNumber}` : `${SALE_DOC_TYPE_LABELS[docType]} ${result.docNumber} completed`);
    const completed = !isDraft && result.saleId && result.docNumber ? { id: result.saleId, docNumber: result.docNumber } : null;
    resetForm();
    if (completed) setJustCompleted(completed);
    router.refresh();
  }

  async function resumeSale(saleId: string) {
    const data = await getSaleWithItems(saleId);
    if (!data) {
      toast.error("Could not load that bill.");
      return;
    }
    const validItems = data.items.filter((i): i is typeof i & { productId: string } => !!i.productId);
    if (validItems.length < data.items.length) {
      toast.error("Some items on this bill no longer exist and were dropped.");
    }
    setDocType(data.sale.docType);
    setCustomerId(data.sale.customerId ?? "walkin");
    setSalespersonId(data.sale.salespersonId ?? "none");
    setWarehouseId(data.sale.warehouseId ?? warehouses[0]?.id ?? "");
    setCounterId(data.sale.counterId ?? "none");
    setOriginalSaleId(data.sale.originalSaleId ?? "none");
    setNotes(data.sale.notes ?? "");
    setCart(
      validItems.map((i) => ({
        productId: i.productId,
        itemCode: i.itemCode,
        name: i.name,
        quantity: parseFloat(i.quantity),
        unitPrice: parseFloat(i.unitPrice),
        discountPercent: parseFloat(i.discountPercent),
        taxRatePercent: parseFloat(i.taxRatePercent),
        serials: [],
      }))
    );
    setEditingSaleId(saleId);
    setTab("sell");
    toast.success(`Resumed ${data.sale.docNumber}`);
  }

  async function discardSale(saleId: string) {
    if (!confirm("Discard this held bill? This cannot be undone.")) return;
    const result = await discardHeldSale(saleId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Held bill discarded");
    if (editingSaleId === saleId) resetForm();
    router.refresh();
  }

  async function confirmCancel(reason: string) {
    if (!cancelTarget) return;
    setSaving(true);
    const result = await cancelSale(cancelTarget.id, reason);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${cancelTarget.docNumber} cancelled — stock, books and points reversed`);
    setCancelTarget(null);
    router.refresh();
  }

  if (!canManage) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">You have view-only access to billing.</CardContent>
      </Card>
    );
  }

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as "sell" | "held" | "recent")} className="space-y-4">
      <TabsList>
        <TabsTrigger value="sell">
          <ShoppingCart className="h-4 w-4" />
          Bill
        </TabsTrigger>
        <TabsTrigger value="held">
          <PauseCircle className="h-4 w-4" />
          Held Bills ({heldSales.length})
        </TabsTrigger>
        <TabsTrigger value="recent">
          <Receipt className="h-4 w-4" />
          Recent Bills
        </TabsTrigger>
      </TabsList>

      <TabsContent value="sell" className="space-y-4">
        {justCompleted && (
          <div className="flex items-center justify-between rounded-lg border border-chart-3/40 bg-chart-3/5 px-4 py-2 text-sm">
            <span>{justCompleted.docNumber} completed.</span>
            <div className="flex items-center gap-2">
              <PrintSaleButton saleId={justCompleted.id} company={company} design={invoiceDesign} label={`Print ${justCompleted.docNumber}`} />
              <Button variant="ghost" size="icon" aria-label="Dismiss" onClick={() => setJustCompleted(null)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
        {editingSaleId && (
          <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm">
            <span>Editing a held bill.</span>
            <Button variant="ghost" size="sm" onClick={resetForm}>
              <X className="h-3.5 w-3.5" />
              Start new bill
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
              {filtered.map((p) => {
                const stock = stockByProduct[p.id] ?? 0;
                const isOut = stock <= 0;
                const isLow = !isOut && stock <= 10;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProduct(p)}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                      isOut
                        ? "border-destructive/40 bg-destructive/10 opacity-70 hover:bg-destructive/15"
                        : isLow
                          ? "border-yellow-500/40 bg-yellow-500/10 hover:bg-yellow-500/15"
                          : "border-border hover:border-primary/40 hover:bg-accent/40"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.itemCode}</p>
                      {isOut && <p className="text-xs font-medium text-destructive">Out of stock</p>}
                      {isLow && <p className="text-xs font-medium text-yellow-500">Low stock ({stock})</p>}
                    </div>
                    <Badge variant="secondary" className="shrink-0 ml-2">
                      {money(parseFloat(p.sellingPrice) || 0)}
                    </Badge>
                  </button>
                );
              })}
              {filtered.length === 0 && <p className="col-span-2 py-6 text-center text-sm text-muted-foreground">No products match.</p>}
            </div>
          </div>

          <div className="space-y-4 lg:col-span-2">
            {/* Cart preview — shows items and quick qty controls */}
            <Card>
              <CardContent className="py-3">
                {cart.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No items added yet</p>
                ) : (
                  <div className="space-y-1.5">
                    {cart.map((l) => (
                      <div key={l.productId} className="flex items-center gap-2 rounded-lg bg-accent/20 px-2.5 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium leading-tight">{l.name}</p>
                          <p className="text-xs text-muted-foreground">{money(l.unitPrice)} each</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            aria-label="Decrease quantity"
                            onClick={() => l.quantity > 1 ? updateLine(l.productId, { quantity: l.quantity - 1 }) : removeLine(l.productId)}
                            className="flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-6 text-center text-sm font-semibold tabular-nums">{l.quantity}</span>
                          <button
                            type="button"
                            aria-label="Increase quantity"
                            onClick={() => updateLine(l.productId, { quantity: l.quantity + 1 })}
                            className="flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <span className="w-16 text-right text-sm font-semibold tabular-nums">{money(l.quantity * l.unitPrice)}</span>
                        <button
                          type="button"
                          aria-label="Remove item"
                          onClick={() => removeLine(l.productId)}
                          className="text-muted-foreground/50 hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3 py-4">
                <div className="grid grid-cols-2 gap-2">
                  <Select
                    items={docTypeItems}
                    value={docType}
                    onValueChange={(v) => {
                      const next = v as (typeof SALE_DOC_TYPES)[number];
                      setDocType(next);
                      // Redemption and coupons only apply to a completed sale
                      // — carrying them across a doc-type switch would only
                      // surface as a save-time error from the server.
                      if (next !== "sale") {
                        setRedeemPoints(0);
                        setCoupon(null);
                      }
                      if (next !== "sale" && next !== "sale_return") {
                        setPayments([{ method: "cash", amount: 0 }]);
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SALE_DOC_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {SALE_DOC_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select items={salespersonItems} value={salespersonId} onValueChange={(v) => setSalespersonId(v ?? "none")}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Salesperson" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No salesperson</SelectItem>
                      {salespersons.map((s) => (
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
                      <p className="text-xs text-destructive">Set up a warehouse under Settings before completing this bill.</p>
                    </div>
                  )
                )}
                {counters.length > 0 && (
                  <Select items={counterItems} value={counterId} onValueChange={(v) => setCounterId(v ?? "none")}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Counter" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No counter</SelectItem>
                      {counters.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {docType === "sale_return" && (
                  <Select items={originalSaleItems} value={originalSaleId} onValueChange={(v) => setOriginalSaleId(v ?? "none")}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Return against bill" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not against a specific bill</SelectItem>
                      {returnableSales.map((rs) => (
                        <SelectItem key={rs.id} value={rs.id}>
                          {rs.docNumber} — {money(parseFloat(rs.totalAmount))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Select items={customerItems} value={customerId} onValueChange={(v) => {
                      setCustomerId(v ?? "walkin");
                      setRedeemPoints(0);
                    }}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Customer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="walkin">Walk-in Customer</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                        {c.phone ? ` (${c.phone})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                {totals.couponDiscountAmount > 0 && coupon && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span className="pl-3">incl. coupon {coupon.code}</span>
                    <span>-{money(totals.couponDiscountAmount)}</span>
                  </div>
                )}
                {totals.tierDiscountAmount > 0 && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span className="pl-3">
                      incl. {docType === "sale_return" ? "tier rate from original bill" : activeTier?.name} ({tierDiscountPercent}%)
                    </span>
                    <span>-{money(totals.tierDiscountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span>{money(totals.taxAmount)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-1.5 text-base font-semibold">
                  <span>Total</span>
                  <span>{money(totals.totalAmount)}</span>
                </div>
                {totals.redeemedValue > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Points redeemed</span>
                    <span>-{money(totals.redeemedValue)}</span>
                  </div>
                )}
                <div className="flex justify-between text-muted-foreground">
                  <span>Paid</span>
                  <span>{money(totals.amountPaid)}</span>
                </div>
                <div className={`flex justify-between font-medium ${totals.due > 0.004 ? "text-destructive" : "text-muted-foreground"}`}>
                  <span>Due</span>
                  <span>{money(totals.due)}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-2 py-4">
                {docType === "sale" && (
                  <div className="mb-2 space-y-1.5 rounded-lg border border-border p-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Coupon</p>
                    {coupon ? (
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="gap-1">
                          <Ticket className="h-3 w-3" />
                          {coupon.code} — {coupon.description}
                        </Badge>
                        <span className="text-sm font-medium">-{money(totals.couponDiscountAmount)}</span>
                        <Button variant="ghost" size="icon" aria-label="Remove coupon" onClick={() => setCoupon(null)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Input
                          value={couponDraft}
                          onChange={(e) => setCouponDraft(e.target.value.toUpperCase())}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void applyCoupon();
                            }
                          }}
                          placeholder="Coupon code"
                          className="font-mono"
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={checkingCoupon || couponDraft.trim().length === 0 || cart.length === 0}
                          onClick={() => void applyCoupon()}
                        >
                          {checkingCoupon ? "Checking…" : "Apply"}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
                {docType === "sale" && loyalty.enabled && selectedCustomer && (
                  <div className="mb-2 space-y-1 rounded-lg border border-border p-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold uppercase tracking-wide text-muted-foreground">Loyalty</span>
                      <span className="text-muted-foreground">{availablePoints} pts available</span>
                    </div>
                    {activeTier && (
                      <Badge variant="secondary" className="gap-1">
                        <Award className="h-3 w-3" />
                        {activeTier.name}
                        {activeTier.discountPercent > 0 ? ` — ${activeTier.discountPercent}% off` : " — no discount"}
                      </Badge>
                    )}
                    {availablePoints >= loyalty.minPointsToRedeem ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          max={availablePoints}
                          value={redeemPoints || ""}
                          onChange={(e) => setRedeemPoints(Math.max(0, Math.min(availablePoints, parseInt(e.target.value) || 0)))}
                          placeholder="Points to redeem"
                        />
                        <Button variant="secondary" size="sm" onClick={() => setRedeemPoints(maxUsefulPoints)}>
                          Max
                        </Button>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {loyalty.minPointsToRedeem} points needed to redeem — this customer has {availablePoints}.
                      </p>
                    )}
                  </div>
                )}
                {docType === "sale" || docType === "sale_return" ? (
                  <>
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
                        {SALE_PAYMENT_METHODS.map((m) => (
                          <SelectItem key={m} value={m}>
                            {SALE_PAYMENT_METHOD_LABELS[m]}
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
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => setPayments([{ method: payments[0]?.method ?? "cash", amount: round2(totals.totalAmount) }])}
                  >
                    Full amount
                  </Button>
                </div>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {SALE_DOC_TYPE_LABELS[docType]} documents don&apos;t collect payment — that happens when it&apos;s converted to a sale.
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" disabled={saving || cart.length === 0} onClick={() => handleSave(true)}>
                Hold Bill
              </Button>
              <Button className="flex-1" disabled={saving || cart.length === 0} onClick={() => handleSave(false)}>
                {saving ? "Saving…" : `Complete ${SALE_DOC_TYPE_LABELS[docType]}`}
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
                  <TableHead className="w-24">Qty</TableHead>
                  <TableHead className="w-28">Price</TableHead>
                  <TableHead className="w-24">Disc %</TableHead>
                  <TableHead className="w-24">Tax %</TableHead>
                  <TableHead className="text-right">Line Total</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {cart.map((l, index) => {
                  // Straight from the shared engine, so the row already
                  // carries its share of any bill-level discount and the
                  // column adds up to the Total above it.
                  const line = computed.lines[index];
                  return (
                    <TableRow key={l.productId}>
                      <TableCell>
                        <p className="font-medium">{l.name}</p>
                        <p className="text-xs text-muted-foreground">{l.itemCode}</p>
                        {movesStock && productById[l.productId]?.trackSerial && (
                          <SerialPicker
                            line={l}
                            available={serialsByProduct[l.productId] ?? []}
                            typed={serialsComeBackIn}
                            takenElsewhere={cart.filter((other) => other.productId === l.productId && other !== l).flatMap((o) => o.serials)}
                            onChange={(serials) => updateLine(l.productId, { serials })}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={l.quantity}
                          min={0.001}
                          step="any"
                          onChange={(e) => updateLine(l.productId, { quantity: parseFloat(e.target.value) || 0 })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={l.unitPrice}
                          step="any"
                          onChange={(e) => updateLine(l.productId, { unitPrice: parseFloat(e.target.value) || 0 })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={l.discountPercent}
                          step="any"
                          onChange={(e) => updateLine(l.productId, { discountPercent: parseFloat(e.target.value) || 0 })}
                        />
                      </TableCell>
                      <TableCell>
                        <TaxRateCell
                          value={l.taxRatePercent}
                          options={taxRateOptions}
                          onChange={(percent) => updateLine(l.productId, { taxRatePercent: percent })}
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {money(line.lineTotal)}
                        {line.billDiscountAmount > 0 && (
                          <span className="block text-xs font-normal text-muted-foreground">incl. -{money(line.billDiscountAmount)}</span>
                        )}
                      </TableCell>
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
        {heldSales.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">No held bills.</CardContent>
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
                {heldSales.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.docNumber}</TableCell>
                    <TableCell>{SALE_DOC_TYPE_LABELS[s.docType as (typeof SALE_DOC_TYPES)[number]]}</TableCell>
                    <TableCell>{money(parseFloat(s.totalAmount))}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="secondary" size="sm" onClick={() => resumeSale(s.id)}>
                          Resume
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Discard" onClick={() => discardSale(s.id)}>
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
        {recentSales.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">No completed bills yet.</CardContent>
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Doc No.</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Counter</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentSales.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.docNumber}</TableCell>
                    <TableCell>{SALE_DOC_TYPE_LABELS[r.docType as (typeof SALE_DOC_TYPES)[number]]}</TableCell>
                    <TableCell>{r.customerName ?? "Walk-in"}</TableCell>
                    <TableCell>{counters.find((c) => c.id === r.counterId)?.label ?? "—"}</TableCell>
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
                        <PrintSaleButton saleId={r.id} company={company} design={invoiceDesign} />
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
        description="Stock goes back on the shelf, the journal entry is reversed and any loyalty points this bill moved are undone. The bill stays on record, marked cancelled."
        onClose={() => setCancelTarget(null)}
        onConfirm={confirmCancel}
      />
    </Tabs>
  );
}

type InvoiceDetail = Awaited<ReturnType<typeof getInvoiceData>>;

/**
 * Prints one bill through the business's saved invoice design.
 *
 * Fetches the full invoice data on click (the POS list only carries summary
 * columns), renders it off-screen with the same `InvoiceDocument` the
 * designer previews with, then hands that element to the print service —
 * so what a cashier prints can never drift from what Invoice Designer shows.
 */
const PRINT_SIZES = [
  { value: "a4", label: "A4" },
  { value: "a5", label: "A5" },
  { value: "80mm", label: "80mm" },
  { value: "58mm", label: "58mm" },
] as const;
type PrintSize = (typeof PRINT_SIZES)[number]["value"];

function PrintSaleButton({
  saleId,
  company,
  design,
  label,
}: {
  saleId: string;
  company: InvoiceCompany | null;
  design: InvoiceDesign;
  label?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [detail, setDetail] = React.useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [size, setSize] = React.useState<PrintSize>(design.paper as PrintSize);
  const activeDesign = React.useMemo(() => ({ ...design, paper: size }), [design, size]);

  async function handleClick() {
    setLoading(true);
    try {
      const data = await getInvoiceData(saleId);
      if (!data) { toast.error("Could not load that bill."); return; }
      setDetail(data);
    } catch {
      toast.error("Could not load that bill.");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (!detail || !ref.current) return;
    const element = ref.current;
    void getPrintService()
      .print({ element, format: size as PrintFormat, title: detail.sale.docNumber })
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
            <InvoiceDocument design={activeDesign} company={company} sale={detail.sale} lines={detail.lines} />
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Tax % for a cart line: a dropdown of the business's configured tax rates
 * when there are any, with a "Custom %" escape hatch for a one-off line —
 * rather than a bare number input that lets any figure through unchecked.
 */
function TaxRateCell({
  value,
  options,
  onChange,
}: {
  value: number;
  options: { value: string; label: string }[];
  onChange: (percent: number) => void;
}) {
  const matched = options.some((o) => parseFloat(o.value) === value);
  const [custom, setCustom] = React.useState(!matched);

  if (options.length === 0 || custom) {
    return (
      <div className="flex items-center gap-1">
        <Input type="number" value={value} step="any" onChange={(e) => onChange(parseFloat(e.target.value) || 0)} />
        {options.length > 0 && (
          <Button type="button" variant="ghost" size="sm" className="shrink-0 px-1.5" onClick={() => setCustom(false)}>
            Rates
          </Button>
        )}
      </div>
    );
  }

  const selectItems = [...options, { value: "custom", label: "Custom %" }];
  return (
    <Select
      items={selectItems}
      value={String(value)}
      onValueChange={(v) => {
        if (!v || v === "custom") {
          setCustom(true);
          return;
        }
        onChange(parseFloat(v) || 0);
      }}
    >
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
        <SelectItem value="custom">Custom %</SelectItem>
      </SelectContent>
    </Select>
  );
}

/**
 * Serial entry for a line whose product is tracked one unit at a time.
 *
 * Going out, the cashier picks from what is actually in stock — typing a
 * serial that was never received is the mistake worth preventing. Coming back
 * in on a return, the units are by definition not in stock, so the serials are
 * typed or scanned instead.
 */
function SerialPicker({
  line,
  available,
  typed,
  takenElsewhere,
  onChange,
}: {
  line: CartLine;
  available: string[];
  typed: boolean;
  takenElsewhere: string[];
  onChange: (serials: string[]) => void;
}) {
  const [draft, setDraft] = React.useState("");
  const needed = Math.round(line.quantity);
  const selectable = available.filter((s) => !line.serials.includes(s) && !takenElsewhere.includes(s));
  const selectableItems = React.useMemo(() => selectable.map((s) => ({ value: s, label: s })), [selectable]);

  function add(serial: string) {
    const clean = serial.trim().toUpperCase();
    if (!clean || line.serials.includes(clean)) return;
    onChange([...line.serials, clean]);
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

      {line.serials.length < needed &&
        (typed ? (
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(draft);
              }
            }}
            placeholder="Scan or type a serial, then Enter"
            className="h-8 font-mono text-xs"
          />
        ) : selectable.length === 0 ? (
          <p className="text-[11px] text-destructive">No more of this item is in stock with a serial number.</p>
        ) : (
          <Select items={selectableItems} value="" onValueChange={(v) => v && add(v)}>
            <SelectTrigger className="h-8 w-full text-xs">
              <SelectValue placeholder="Pick a serial in stock" />
            </SelectTrigger>
            <SelectContent>
              {selectable.map((serial) => (
                <SelectItem key={serial} value={serial}>
                  {serial}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
    </div>
  );
}
