"use client";

import * as React from "react";
import { toast } from "sonner";
import { Search, Printer, Camera } from "lucide-react";
import { getProductImagesFor } from "@/app/actions/products";
import { getPrintService } from "@/lib/print";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

type Product = { id: string; itemCode: string; name: string; barcode: string | null; sellingPrice: string; mrp: string };
type Company = { name: string } | null;

/**
 * Builds a printable product catalogue — a shop picks which products to
 * include, their photos load in, and "Print / Save as PDF" turns it into a
 * file that's easy to send over WhatsApp or email. No public storefront or
 * new hosting is involved: the PDF itself is the thing that goes out.
 */
export function CatalogueBuilder({
  products,
  company,
  imageProductIds,
}: {
  products: Product[];
  company: Company;
  imageProductIds: string[];
}) {
  const sheetRef = React.useRef<HTMLDivElement>(null);
  const [search, setSearch] = React.useState("");
  const [onlyWithPhotos, setOnlyWithPhotos] = React.useState(true);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [priceField, setPriceField] = React.useState<"sellingPrice" | "mrp">("sellingPrice");
  const [images, setImages] = React.useState<Record<string, string>>({});
  const [loadingImages, setLoadingImages] = React.useState(false);
  const hasPhoto = React.useMemo(() => new Set(imageProductIds), [imageProductIds]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => !onlyWithPhotos || hasPhoto.has(p.id))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.itemCode.toLowerCase().includes(q))
      .slice(0, 200);
  }, [products, search, onlyWithPhotos, hasPhoto]);

  function toggle(productId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  // Only the products actually chosen ever have their image bytes fetched —
  // browsing the picker above never pulls a single photo down.
  async function buildPreview() {
    const ids = [...selected].filter((id) => hasPhoto.has(id));
    if (ids.length === 0) {
      setImages({});
      return;
    }
    setLoadingImages(true);
    try {
      setImages(await getProductImagesFor(ids));
    } catch {
      toast.error("Could not load the photos for this catalogue.");
    } finally {
      setLoadingImages(false);
    }
  }

  const selectedProducts = products.filter((p) => selected.has(p.id));

  return (
    <div className="space-y-4">
      <Card className="print:hidden">
        <CardContent className="space-y-4 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-56 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…" className="pl-9" />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={onlyWithPhotos} onChange={(e) => setOnlyWithPhotos(e.target.checked)} className="h-4 w-4 accent-primary" />
              Only products with a photo
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Show
              <select
                value={priceField}
                onChange={(e) => setPriceField(e.target.value as "sellingPrice" | "mrp")}
                className="rounded-md border border-border bg-background px-2 py-1 text-sm"
              >
                <option value="sellingPrice">Selling price</option>
                <option value="mrp">MRP</option>
              </select>
            </label>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            {filtered.map((p) => (
              <label key={p.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 accent-primary" />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {hasPhoto.has(p.id) && <Camera className="h-3.5 w-3.5 shrink-0 text-primary" />}
              </label>
            ))}
            {filtered.length === 0 && <p className="col-span-3 py-4 text-center text-sm text-muted-foreground">No products match.</p>}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{selected.size} product{selected.size === 1 ? "" : "s"} selected</p>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={selected.size === 0 || loadingImages} onClick={() => void buildPreview()}>
                {loadingImages ? "Loading photos…" : "Build catalogue"}
              </Button>
              <Button
                disabled={selectedProducts.length === 0}
                onClick={() => {
                  if (sheetRef.current) void getPrintService().print({ element: sheetRef.current, format: "a4", title: "Catalogue" });
                }}
              >
                <Printer className="h-4 w-4" />
                Print / Save as PDF
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div ref={sheetRef} className="rounded-lg border border-border bg-background p-4">
        {company?.name && <h2 className="mb-3 text-center text-xl font-bold">{company.name}</h2>}
        {selectedProducts.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground print:hidden">
            Pick products above and click &quot;Build catalogue&quot; to see the sheet here.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {selectedProducts.map((p) => (
              <div key={p.id} className="flex flex-col overflow-hidden rounded-lg border border-border" style={{ breakInside: "avoid" }}>
                <div className="flex aspect-square items-center justify-center bg-muted/40">
                  {images[p.id] ? (
                    // Small, locally resized data URIs — no remote host to configure for next/image.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={images[p.id]} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs text-muted-foreground">No photo</span>
                  )}
                </div>
                <div className="space-y-0.5 p-2">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.itemCode}</p>
                  <p className="text-sm font-semibold">₹{parseFloat(p[priceField] || "0").toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
