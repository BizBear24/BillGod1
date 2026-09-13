"use client";

import * as React from "react";
import { toast } from "sonner";
import { Search, Printer, Camera, X, CheckSquare, Square } from "lucide-react";
import { getProductImagesFor } from "@/app/actions/products";
import { getPrintService } from "@/lib/print";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Product = {
  id: string;
  itemCode: string;
  name: string;
  categoryId: string | null;
  brandId: string | null;
  sellingPrice: string;
  mrp: string;
};
type Lookup = { id: string; name: string };

const NONE = "all";
const PAGE_SIZE = 60;

/**
 * The Catalogue module: a full browsing-and-building tool for turning the
 * product list into something a shop can send a customer — filter down to
 * what belongs in this particular catalogue (a category, a brand, a price
 * band, only what's in stock), see actual photos while you pick, then print
 * or save the sheet as a PDF. Its own page and its own nav entry, not a tab
 * buried inside Barcodes & Printing.
 */
export function CatalogueModule({
  products,
  categories,
  brands,
  stockByProduct,
  imageProductIds,
  companyName,
}: {
  products: Product[];
  categories: Lookup[];
  brands: Lookup[];
  stockByProduct: Record<string, number>;
  imageProductIds: string[];
  companyName: string | null;
}) {
  const sheetRef = React.useRef<HTMLDivElement>(null);
  const hasPhoto = React.useMemo(() => new Set(imageProductIds), [imageProductIds]);
  const categoryName = React.useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const brandName = React.useMemo(() => new Map(brands.map((b) => [b.id, b.name])), [brands]);

  const [search, setSearch] = React.useState("");
  const [categoryId, setCategoryId] = React.useState(NONE);
  const [brandId, setBrandId] = React.useState(NONE);
  const [minPrice, setMinPrice] = React.useState("");
  const [maxPrice, setMaxPrice] = React.useState("");
  const [stockFilter, setStockFilter] = React.useState<"all" | "in" | "out">("all");
  const [onlyWithPhoto, setOnlyWithPhoto] = React.useState(false);
  const [sortBy, setSortBy] = React.useState<"name" | "price-asc" | "price-desc" | "stock-desc">("name");
  const [priceField, setPriceField] = React.useState<"sellingPrice" | "mrp">("sellingPrice");
  const [columns, setColumns] = React.useState(4);

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [thumbnails, setThumbnails] = React.useState<Record<string, string>>({});
  const [sheetImages, setSheetImages] = React.useState<Record<string, string>>({});
  const [building, setBuilding] = React.useState(false);
  const [built, setBuilt] = React.useState(false);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const min = parseFloat(minPrice);
    const max = parseFloat(maxPrice);
    let rows = products.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !p.itemCode.toLowerCase().includes(q)) return false;
      if (categoryId !== NONE && p.categoryId !== categoryId) return false;
      if (brandId !== NONE && p.brandId !== brandId) return false;
      if (onlyWithPhoto && !hasPhoto.has(p.id)) return false;
      const price = parseFloat(p[priceField]) || 0;
      if (Number.isFinite(min) && price < min) return false;
      if (Number.isFinite(max) && price > max) return false;
      const stock = stockByProduct[p.id] ?? 0;
      if (stockFilter === "in" && stock <= 0) return false;
      if (stockFilter === "out" && stock > 0) return false;
      return true;
    });

    rows = rows.sort((a, b) => {
      if (sortBy === "price-asc") return (parseFloat(a[priceField]) || 0) - (parseFloat(b[priceField]) || 0);
      if (sortBy === "price-desc") return (parseFloat(b[priceField]) || 0) - (parseFloat(a[priceField]) || 0);
      if (sortBy === "stock-desc") return (stockByProduct[b.id] ?? 0) - (stockByProduct[a.id] ?? 0);
      return a.name.localeCompare(b.name);
    });
    return rows;
  }, [products, search, categoryId, brandId, onlyWithPhoto, hasPhoto, priceField, minPrice, maxPrice, stockFilter, sortBy, stockByProduct]);

  const visible = filtered.slice(0, PAGE_SIZE);

  // Only ever fetches photo bytes for the page of results actually on screen,
  // and only the ones with a photo to begin with — browsing never pays for
  // images nobody scrolled to.
  React.useEffect(() => {
    const need = visible.filter((p) => hasPhoto.has(p.id) && !(p.id in thumbnails)).map((p) => p.id);
    if (need.length === 0) return;
    let cancelled = false;
    void getProductImagesFor(need).then((result) => {
      if (!cancelled) setThumbnails((prev) => ({ ...prev, ...result }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.map((p) => p.id).join(",")]);

  function toggle(productId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
    setBuilt(false);
  }

  function selectAllFiltered() {
    setSelected(new Set(filtered.map((p) => p.id)));
    setBuilt(false);
  }

  function clearSelection() {
    setSelected(new Set());
    setBuilt(false);
  }

  function resetFilters() {
    setSearch("");
    setCategoryId(NONE);
    setBrandId(NONE);
    setMinPrice("");
    setMaxPrice("");
    setStockFilter("all");
    setOnlyWithPhoto(false);
    setSortBy("name");
  }

  async function buildSheet() {
    const ids = [...selected].filter((id) => hasPhoto.has(id) && !(id in sheetImages));
    setBuilding(true);
    try {
      if (ids.length > 0) {
        const fetched = await getProductImagesFor(ids);
        setSheetImages((prev) => ({ ...prev, ...fetched }));
      }
      setBuilt(true);
    } catch {
      toast.error("Could not load photos for this catalogue.");
    } finally {
      setBuilding(false);
    }
  }

  const selectedProducts = products.filter((p) => selected.has(p.id));
  const categoryItems = [{ value: NONE, label: "All categories" }, ...categories.map((c) => ({ value: c.id, label: c.name }))];
  const brandItems = [{ value: NONE, label: "All brands" }, ...brands.map((b) => ({ value: b.id, label: b.name }))];
  const stockItems = [
    { value: "all", label: "All stock" },
    { value: "in", label: "In stock only" },
    { value: "out", label: "Out of stock only" },
  ];
  const sortItems = [
    { value: "name", label: "Name A–Z" },
    { value: "price-asc", label: "Price: low to high" },
    { value: "price-desc", label: "Price: high to low" },
    { value: "stock-desc", label: "Stock: most first" },
  ];

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------------- filters */}
      <Card className="print:hidden">
        <CardContent className="space-y-3 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative min-w-48 flex-1">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Search</label>
              <Search className="absolute left-3 top-[34px] h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or item code…" className="pl-9" />
            </div>
            <div className="w-40">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Category</label>
              <Select items={categoryItems} value={categoryId} onValueChange={(v) => setCategoryId(v ?? NONE)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categoryItems.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-40">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Brand</label>
              <Select items={brandItems} value={brandId} onValueChange={(v) => setBrandId(v ?? NONE)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {brandItems.map((b) => (
                    <SelectItem key={b.value} value={b.value}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-24">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Min ₹</label>
              <Input type="number" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder="0" />
            </div>
            <div className="w-24">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Max ₹</label>
              <Input type="number" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="Any" />
            </div>
            <div className="w-36">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Stock</label>
              <Select items={stockItems} value={stockFilter} onValueChange={(v) => setStockFilter((v as typeof stockFilter) ?? "all")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stockItems.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-40">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Sort by</label>
              <Select items={sortItems} value={sortBy} onValueChange={(v) => setSortBy((v as typeof sortBy) ?? "name")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sortItems.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <X className="h-3.5 w-3.5" />
              Reset
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={onlyWithPhoto} onChange={(e) => setOnlyWithPhoto(e.target.checked)} className="h-4 w-4 accent-primary" />
              Only products with a photo
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Show price
              <select
                value={priceField}
                onChange={(e) => setPriceField(e.target.value as "sellingPrice" | "mrp")}
                className="rounded-md border border-border bg-background px-2 py-1 text-sm"
              >
                <option value="sellingPrice">Selling price</option>
                <option value="mrp">MRP</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Sheet columns
              <select
                value={columns}
                onChange={(e) => setColumns(parseInt(e.target.value, 10))}
                className="rounded-md border border-border bg-background px-2 py-1 text-sm"
              >
                {[2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} across
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-muted-foreground">
              {filtered.length} product{filtered.length === 1 ? "" : "s"} match
              {filtered.length > PAGE_SIZE ? ` · showing first ${PAGE_SIZE}` : ""}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------ result grid */}
      <Card className="print:hidden">
        <CardContent className="space-y-3 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={selectAllFiltered} disabled={filtered.length === 0}>
                <CheckSquare className="h-3.5 w-3.5" />
                Select all filtered
              </Button>
              <Button variant="ghost" size="sm" onClick={clearSelection} disabled={selected.size === 0}>
                <Square className="h-3.5 w-3.5" />
                Clear
              </Button>
              <p className="text-sm text-muted-foreground">{selected.size} selected</p>
            </div>
            <div className="flex gap-2">
              <Button disabled={selected.size === 0 || building} onClick={() => void buildSheet()}>
                {building ? "Loading photos…" : "Preview catalogue"}
              </Button>
              <Button
                variant="secondary"
                disabled={!built}
                onClick={() => {
                  if (sheetRef.current) void getPrintService().print({ element: sheetRef.current, format: "a4", title: "Catalogue" });
                }}
              >
                <Printer className="h-4 w-4" />
                Print / Save as PDF
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {visible.map((p) => {
              const isSelected = selected.has(p.id);
              const stock = stockByProduct[p.id] ?? 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  className={`flex flex-col overflow-hidden rounded-lg border text-left transition-colors ${
                    isSelected ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/40"
                  }`}
                >
                  <div className="relative flex aspect-square items-center justify-center bg-muted/40">
                    {thumbnails[p.id] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumbnails[p.id]} alt={p.name} className="h-full w-full object-cover" />
                    ) : hasPhoto.has(p.id) ? (
                      <Camera className="h-6 w-6 text-muted-foreground/50" />
                    ) : (
                      <span className="text-[11px] text-muted-foreground">No photo</span>
                    )}
                    <span
                      className={`absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-md border-2 ${
                        isSelected ? "border-primary bg-primary text-primary-foreground" : "border-white/70 bg-black/20"
                      }`}
                    >
                      {isSelected && <CheckSquare className="h-3 w-3" />}
                    </span>
                  </div>
                  <div className="space-y-0.5 p-2">
                    <p className="truncate text-xs font-medium">{p.name}</p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {[p.categoryId ? categoryName.get(p.categoryId) : null, p.brandId ? brandName.get(p.brandId) : null]
                        .filter(Boolean)
                        .join(" · ") || p.itemCode}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">₹{(parseFloat(p[priceField]) || 0).toFixed(2)}</span>
                      {stock <= 0 ? (
                        <Badge variant="destructive" className="px-1 py-0 text-[9px]">
                          Out
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">{stock} in stock</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && <p className="col-span-full py-8 text-center text-sm text-muted-foreground">No products match these filters.</p>}
          </div>
        </CardContent>
      </Card>

      {/* -------------------------------------------------------------- preview */}
      <Card className="print:hidden">
        <CardContent className="flex items-center justify-between py-4">
          <div>
            <p className="text-sm font-semibold">Preview</p>
            <p className="text-xs text-muted-foreground">Exactly what will print or save as a PDF — nothing changes between this and the sheet.</p>
          </div>
          {built && selectedProducts.length > 0 && (
            <Badge variant="secondary">
              {selectedProducts.length} product{selectedProducts.length === 1 ? "" : "s"} on sheet
            </Badge>
          )}
        </CardContent>
      </Card>
      <div ref={sheetRef} className="rounded-lg border border-border bg-background p-4">
        {companyName && <h2 className="mb-3 text-center text-xl font-bold">{companyName}</h2>}
        {!built || selectedProducts.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground print:hidden">
            Select products above and click &quot;Preview catalogue&quot; to see it here.
          </p>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {selectedProducts.map((p) => (
              <div key={p.id} className="flex flex-col overflow-hidden rounded-lg border border-border" style={{ breakInside: "avoid" }}>
                <div className="flex aspect-square items-center justify-center bg-muted/40">
                  {sheetImages[p.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={sheetImages[p.id]} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs text-muted-foreground">No photo</span>
                  )}
                </div>
                <div className="space-y-0.5 p-2">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.itemCode}</p>
                  <p className="text-sm font-semibold">₹{(parseFloat(p[priceField]) || 0).toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
