"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Trash2, Boxes, ArrowLeftRight, ClipboardList, AlertTriangle, Skull, Gauge, ScanBarcode } from "lucide-react";
import { createTransfer, createAdjustment } from "@/app/actions/inventory";
import { updateProductDiscount } from "@/app/actions/products";
import { ADJUSTMENT_REASONS, ADJUSTMENT_REASON_LABELS } from "@/lib/validation/inventory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/lib/utils";

type Warehouse = { id: string; name: string; label: string };
type Product = { id: string; itemCode: string; name: string; reorderLevel: string; minStock: string; defaultDiscountPercent: string };
type StockByProduct = Record<string, { total: number; byWarehouse: Record<string, number> }>;
type Transfer = { id: string; docNumber: string; fromWarehouseId: string; toWarehouseId: string; notes: string | null; createdAt: Date };
type Adjustment = { id: string; docNumber: string; warehouseId: string; reason: string; notes: string | null; createdAt: Date };
type LowStockRow = { product: Product; currentStock: number };
type FastSlowRow = { product: Product; unitsSold: number };

type Line = { productId: string; itemCode: string; name: string; quantity: number; batchNumber: string };

type SerialRow = {
  key: string;
  itemCode: string;
  productName: string;
  serial: string;
  status: "in_stock" | "sold";
  lastDocument: string | null;
  lastMovedAt: Date;
  movements: number;
};
type SerialRegister = { rows: SerialRow[]; summary: { tracked: number; inStock: number } };

const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3));

export function InventoryManager({
  warehouses,
  products,
  stockByProduct,
  transfers,
  adjustments,
  lowStock,
  deadStock,
  fastSlow,
  serialRegister,
  canManage,
}: {
  warehouses: Warehouse[];
  products: Product[];
  stockByProduct: StockByProduct;
  transfers: Transfer[];
  adjustments: Adjustment[];
  lowStock: LowStockRow[];
  deadStock: LowStockRow[];
  fastSlow: FastSlowRow[];
  serialRegister: SerialRegister;
  canManage: boolean;
}) {
  const [tab, setTab] = React.useState("levels");
  const warehouseName = React.useCallback((id: string) => warehouses.find((w) => w.id === id)?.label ?? "—", [warehouses]);

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-4">
      <TabsList>
        <TabsTrigger value="levels">
          <Boxes className="h-4 w-4" />
          Stock Levels
        </TabsTrigger>
        <TabsTrigger value="transfers">
          <ArrowLeftRight className="h-4 w-4" />
          Transfers
        </TabsTrigger>
        <TabsTrigger value="adjustments">
          <ClipboardList className="h-4 w-4" />
          Adjustments
        </TabsTrigger>
        <TabsTrigger value="serials">
          <ScanBarcode className="h-4 w-4" />
          Serials ({serialRegister.summary.inStock})
        </TabsTrigger>
        <TabsTrigger value="reports">
          <Gauge className="h-4 w-4" />
          Reports
        </TabsTrigger>
      </TabsList>

      <TabsContent value="serials">
        <SerialRegisterTable register={serialRegister} />
      </TabsContent>

      <TabsContent value="levels">
        <StockLevelsTable products={products} warehouses={warehouses} stockByProduct={stockByProduct} canManage={canManage} />
      </TabsContent>

      <TabsContent value="transfers" className="space-y-4">
        {canManage && <TransferForm warehouses={warehouses} products={products} />}
        <Card>
          <CardContent className="py-4">
            <p className="mb-3 text-sm font-semibold">Recent Transfers</p>
            {transfers.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No transfers yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Doc No.</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transfers.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.docNumber}</TableCell>
                        <TableCell>{warehouseName(t.fromWarehouseId)}</TableCell>
                        <TableCell>{warehouseName(t.toWarehouseId)}</TableCell>
                        <TableCell>{formatDate(t.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="adjustments" className="space-y-4">
        {canManage && <AdjustmentForm warehouses={warehouses} products={products} />}
        <Card>
          <CardContent className="py-4">
            <p className="mb-3 text-sm font-semibold">Recent Adjustments</p>
            {adjustments.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No adjustments yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Doc No.</TableHead>
                      <TableHead>Warehouse</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {adjustments.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{a.docNumber}</TableCell>
                        <TableCell>{warehouseName(a.warehouseId)}</TableCell>
                        <TableCell>{ADJUSTMENT_REASON_LABELS[a.reason as (typeof ADJUSTMENT_REASONS)[number]] ?? a.reason}</TableCell>
                        <TableCell>{formatDate(a.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="reports" className="space-y-6">
        <ReportCard
          icon={AlertTriangle}
          title="Low Stock"
          description="Products at or below their reorder level."
          rows={lowStock}
          emptyLabel="Nothing is low on stock."
          valueLabel="Current Stock"
          getValue={(r) => qty(r.currentStock)}
        />
        <ReportCard
          icon={Skull}
          title="Dead Stock"
          description="In stock, but with no sales in the last 60 days."
          rows={deadStock}
          emptyLabel="No dead stock detected."
          valueLabel="Current Stock"
          getValue={(r) => qty(r.currentStock)}
        />
        <ReportCard
          icon={Gauge}
          title="Fast / Slow Moving (last 30 days)"
          description="Products ranked by units sold — top rows move fastest, zero means slow/no movement."
          rows={fastSlow}
          emptyLabel="No sales recorded yet."
          valueLabel="Units Sold"
          getValue={(r) => qty(r.unitsSold)}
        />
      </TabsContent>
    </Tabs>
  );
}

function StockLevelsTable({
  products,
  warehouses,
  stockByProduct,
  canManage,
}: {
  products: Product[];
  warehouses: Warehouse[];
  stockByProduct: StockByProduct;
  canManage: boolean;
}) {
  const [search, setSearch] = React.useState("");
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.itemCode.toLowerCase().includes(q));
  }, [products, search]);
  const showPerWarehouse = warehouses.length > 1;

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…" className="pl-9" />
        </div>
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No products match.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item Code</TableHead>
                  <TableHead>Name</TableHead>
                  {showPerWarehouse && warehouses.map((w) => <TableHead key={w.id}>{w.label}</TableHead>)}
                  <TableHead>Total Stock</TableHead>
                  <TableHead>Reorder Level</TableHead>
                  <TableHead>Discount %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const stock = stockByProduct[p.id];
                  const total = stock?.total ?? 0;
                  const reorder = parseFloat(p.reorderLevel) || parseFloat(p.minStock) || 0;
                  const low = reorder > 0 && total <= reorder;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>{p.itemCode}</TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      {showPerWarehouse &&
                        warehouses.map((w) => {
                          // A branch can be out or low on its own even when the
                          // business total looks fine — that mismatch is exactly
                          // what tells a manager where to transfer stock from.
                          const branchQty = stock?.byWarehouse[w.id] ?? 0;
                          const branchOut = branchQty <= 0;
                          const branchLow = !branchOut && reorder > 0 && branchQty <= reorder;
                          return (
                            <TableCell key={w.id} className={branchOut ? "font-semibold text-destructive" : branchLow ? "font-medium text-amber-600" : ""}>
                              {qty(branchQty)}
                              {branchOut && <span className="ml-1 text-[10px] uppercase">out</span>}
                            </TableCell>
                          );
                        })}
                      <TableCell>
                        <span className={low ? "font-semibold text-destructive" : ""}>{qty(total)}</span>
                        {low && (
                          <Badge variant="destructive" className="ml-2">
                            Low
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{reorder > 0 ? qty(reorder) : "—"}</TableCell>
                      <TableCell>
                        <DiscountCell productId={p.id} value={p.defaultDiscountPercent} canManage={canManage} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Inline-editable default discount %, saved on blur — the item-wise discount the product carries into every future bill. */
function DiscountCell({ productId, value, canManage }: { productId: string; value: string; canManage: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = React.useState(value);
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => setDraft(value), [value]);

  async function save() {
    const next = Math.max(0, Math.min(100, parseFloat(draft) || 0));
    setDraft(String(next));
    if (next === (parseFloat(value) || 0)) return;
    setSaving(true);
    const result = await updateProductDiscount(productId, next);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Discount set to ${next}%`);
    router.refresh();
  }

  if (!canManage) return <span className="text-muted-foreground">{parseFloat(value) || 0}%</span>;

  return (
    <div className="flex items-center gap-1">
      <Input
        type="number"
        min={0}
        max={100}
        step="any"
        value={draft}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        className="h-7 w-16 text-right"
      />
      <span className="text-xs text-muted-foreground">%</span>
    </div>
  );
}

function ProductPicker({ products, onAdd }: { products: Product[]; onAdd: (p: Product) => void }) {
  const [search, setSearch] = React.useState("");
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 12);
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.itemCode.toLowerCase().includes(q)).slice(0, 12);
  }, [products, search]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products to add…" className="pl-9" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {filtered.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onAdd(p)}
            className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-left text-sm transition-colors hover:border-primary/40 hover:bg-accent/40"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{p.name}</p>
              <p className="text-xs text-muted-foreground">{p.itemCode}</p>
            </div>
          </button>
        ))}
        {filtered.length === 0 && <p className="col-span-2 py-4 text-center text-sm text-muted-foreground">No products match.</p>}
      </div>
    </div>
  );
}

function TransferForm({ warehouses, products }: { warehouses: Warehouse[]; products: Product[] }) {
  const router = useRouter();
  const [fromWarehouseId, setFromWarehouseId] = React.useState(warehouses[0]?.id ?? "");
  const [toWarehouseId, setToWarehouseId] = React.useState(warehouses[1]?.id ?? "");
  const [lines, setLines] = React.useState<Line[]>([]);
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const warehouseItems = React.useMemo(() => warehouses.map((w) => ({ value: w.id, label: w.label })), [warehouses]);

  function addLine(p: Product) {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === p.id);
      if (existing) return prev.map((l) => (l.productId === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { productId: p.id, itemCode: p.itemCode, name: p.name, quantity: 1, batchNumber: "" }];
    });
  }

  if (warehouses.length < 2) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Transfers need at least two warehouses. Add another branch under Settings first.
        </CardContent>
      </Card>
    );
  }

  async function handleSave() {
    if (fromWarehouseId === toWarehouseId) {
      toast.error("Source and destination must be different.");
      return;
    }
    if (lines.length === 0) {
      toast.error("Add at least one item.");
      return;
    }
    setSaving(true);
    const result = await createTransfer({ fromWarehouseId, toWarehouseId, notes, items: lines });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Transfer ${result.docNumber} completed`);
    setLines([]);
    setNotes("");
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <p className="text-sm font-semibold">New Transfer</p>
        <div className="grid grid-cols-2 gap-2">
          <Select items={warehouseItems} value={fromWarehouseId} onValueChange={(v) => setFromWarehouseId(v ?? "")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="From warehouse" />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select items={warehouseItems} value={toWarehouseId} onValueChange={(v) => setToWarehouseId(v ?? "")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="To warehouse" />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ProductPicker products={products} onAdd={addLine} />

        {lines.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-24">Qty</TableHead>
                  <TableHead className="w-32">Batch</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => (
                  <TableRow key={l.productId}>
                    <TableCell>
                      <p className="font-medium">{l.name}</p>
                      <p className="text-xs text-muted-foreground">{l.itemCode}</p>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={l.quantity}
                        min={0.001}
                        step="any"
                        onChange={(e) =>
                          setLines((prev) => prev.map((row) => (row.productId === l.productId ? { ...row, quantity: parseFloat(e.target.value) || 0 } : row)))
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={l.batchNumber}
                        onChange={(e) =>
                          setLines((prev) => prev.map((row) => (row.productId === l.productId ? { ...row, batchNumber: e.target.value } : row)))
                        }
                        placeholder="—"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove"
                        onClick={() => setLines((prev) => prev.filter((row) => row.productId !== l.productId))}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" />
        <Button disabled={saving || lines.length === 0} onClick={handleSave}>
          {saving ? "Saving…" : "Complete Transfer"}
        </Button>
      </CardContent>
    </Card>
  );
}

function AdjustmentForm({ warehouses, products }: { warehouses: Warehouse[]; products: Product[] }) {
  const router = useRouter();
  const [warehouseId, setWarehouseId] = React.useState(warehouses[0]?.id ?? "");
  const [reason, setReason] = React.useState<(typeof ADJUSTMENT_REASONS)[number]>("stock_take");
  const [lines, setLines] = React.useState<Line[]>([]);
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const warehouseItems = React.useMemo(() => warehouses.map((w) => ({ value: w.id, label: w.label })), [warehouses]);
  const reasonItems = React.useMemo(() => ADJUSTMENT_REASONS.map((r) => ({ value: r, label: ADJUSTMENT_REASON_LABELS[r] })), []);

  function addLine(p: Product) {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === p.id);
      if (existing) return prev;
      return [...prev, { productId: p.id, itemCode: p.itemCode, name: p.name, quantity: 1, batchNumber: "" }];
    });
  }

  if (warehouses.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Set up a company and branch first — adjustments belong to a warehouse.
        </CardContent>
      </Card>
    );
  }

  async function handleSave() {
    if (lines.length === 0) {
      toast.error("Add at least one item.");
      return;
    }
    setSaving(true);
    const result = await createAdjustment({
      warehouseId,
      reason,
      notes,
      items: lines.map((l) => ({ productId: l.productId, itemCode: l.itemCode, name: l.name, quantityDelta: l.quantity, batchNumber: l.batchNumber })),
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Adjustment ${result.docNumber} completed`);
    setLines([]);
    setNotes("");
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <p className="text-sm font-semibold">New Adjustment</p>
        <div className="grid grid-cols-2 gap-2">
          <Select items={warehouseItems} value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? "")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Warehouse" />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select items={reasonItems} value={reason} onValueChange={(v) => setReason((v ?? "other") as (typeof ADJUSTMENT_REASONS)[number])}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Reason" />
            </SelectTrigger>
            <SelectContent>
              {ADJUSTMENT_REASONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {ADJUSTMENT_REASON_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ProductPicker products={products} onAdd={addLine} />

        {lines.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-32">Qty (+/-)</TableHead>
                  <TableHead className="w-32">Batch</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => (
                  <TableRow key={l.productId}>
                    <TableCell>
                      <p className="font-medium">{l.name}</p>
                      <p className="text-xs text-muted-foreground">{l.itemCode}</p>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={l.quantity}
                        step="any"
                        onChange={(e) =>
                          setLines((prev) => prev.map((row) => (row.productId === l.productId ? { ...row, quantity: parseFloat(e.target.value) || 0 } : row)))
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={l.batchNumber}
                        onChange={(e) =>
                          setLines((prev) => prev.map((row) => (row.productId === l.productId ? { ...row, batchNumber: e.target.value } : row)))
                        }
                        placeholder="—"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove"
                        onClick={() => setLines((prev) => prev.filter((row) => row.productId !== l.productId))}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Positive quantity adds stock (found), negative removes it (damaged / lost).</p>

        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" />
        <Button disabled={saving || lines.length === 0} onClick={handleSave}>
          {saving ? "Saving…" : "Complete Adjustment"}
        </Button>
      </CardContent>
    </Card>
  );
}

function ReportCard<T extends { product: Product }>({
  icon: Icon,
  title,
  description,
  rows,
  emptyLabel,
  valueLabel,
  getValue,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  rows: T[];
  emptyLabel: string;
  valueLabel: string;
  getValue: (row: T) => string;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-semibold leading-tight">{title}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">{valueLabel}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 20).map((row) => (
                  <TableRow key={row.product.id}>
                    <TableCell>{row.product.itemCode}</TableCell>
                    <TableCell className="font-medium">{row.product.name}</TableCell>
                    <TableCell className="text-right">{getValue(row)}</TableCell>
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
 * Every serial-tracked unit the shop has ever handled, and whether it is still
 * on the shelf. Status comes from netting the movement ledger, so a unit that
 * was sold, returned and sold again reads correctly rather than being stuck on
 * whatever a status column was last set to.
 */
function SerialRegisterTable({ register }: { register: SerialRegister }) {
  const [search, setSearch] = React.useState("");
  const [onlyInStock, setOnlyInStock] = React.useState(false);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return register.rows.filter((r) => {
      if (onlyInStock && r.status !== "in_stock") return false;
      if (!q) return true;
      return r.serial.toLowerCase().includes(q) || r.productName.toLowerCase().includes(q) || r.itemCode.toLowerCase().includes(q);
    });
  }, [register.rows, search, onlyInStock]);

  if (register.summary.tracked === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No serial numbers recorded yet. Turn on &ldquo;Track serial numbers&rdquo; on a product, then enter one serial per unit when you
          receive it on a purchase.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search a serial, item code or product…"
              className="pl-9"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={onlyInStock}
              onChange={(e) => setOnlyInStock(e.target.checked)}
              className="h-4 w-4 cursor-pointer rounded border-border accent-primary"
            />
            In stock only
          </label>
          <p className="text-xs text-muted-foreground">
            {register.summary.inStock} of {register.summary.tracked} units in stock
          </p>
        </div>

        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No serials match.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serial</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last document</TableHead>
                  <TableHead className="text-right">Movements</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell className="font-mono text-xs">{r.serial}</TableCell>
                    <TableCell>
                      <p className="font-medium">{r.productName}</p>
                      <p className="text-xs text-muted-foreground">{r.itemCode}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.status === "in_stock" ? "secondary" : "outline"}>
                        {r.status === "in_stock" ? "In stock" : "Sold"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{r.lastDocument ?? "—"}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{r.movements}</TableCell>
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
