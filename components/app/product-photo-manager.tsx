"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, Search, Trash2, Upload } from "lucide-react";
import { getProductImage, setProductImage } from "@/app/actions/products";
import { resizeImageFile } from "@/lib/images/resize-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

type Product = { id: string; itemCode: string; name: string };

/**
 * Product photos live in their own table (see productImages in
 * db/schema/products.ts), so they're managed here rather than as a field in
 * the generic Add/Edit dialog — that keeps the big product list query (used
 * by Billing, Purchase, Barcodes...) from ever having to carry image bytes.
 */
export function ProductPhotoManager({
  products,
  imageProductIds,
  canManage,
}: {
  products: Product[];
  imageProductIds: string[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const hasImage = React.useMemo(() => new Set(imageProductIds), [imageProductIds]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 8);
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.itemCode.toLowerCase().includes(q)).slice(0, 8);
  }, [products, search]);

  async function selectProduct(productId: string) {
    setSelectedId(productId);
    setPreview(null);
    setLoading(true);
    try {
      setPreview(await getProductImage(productId));
    } catch {
      toast.error("Could not load that product's photo.");
    } finally {
      setLoading(false);
    }
  }

  async function handleFile(file: File) {
    if (!selectedId) return;
    try {
      const dataUrl = await resizeImageFile(file);
      setSaving(true);
      const result = await setProductImage(selectedId, dataUrl);
      setSaving(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setPreview(dataUrl);
      toast.success("Photo saved");
      router.refresh();
    } catch (err) {
      setSaving(false);
      toast.error(err instanceof Error ? err.message : "Could not process that image.");
    }
  }

  async function removePhoto() {
    if (!selectedId) return;
    setSaving(true);
    const result = await setProductImage(selectedId, null);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setPreview(null);
    toast.success("Photo removed");
    router.refresh();
  }

  const selectedProduct = products.find((p) => p.id === selectedId) ?? null;

  return (
    <Card>
      <CardContent className="space-y-4 py-6">
        <div className="flex items-center gap-2">
          <Camera className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold leading-tight">Product Photos</h2>
            <p className="text-xs text-muted-foreground">
              Add a picture to any product — it shows up wherever the product does (Billing, Purchase, this list), and the Catalogue tab can
              turn it into a printable sheet to send customers.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a product…" className="pl-9" />
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-1.5">
              {filtered.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No products match.</p>}
              {filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => void selectProduct(p.id)}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/40 ${
                    selectedId === p.id ? "bg-accent/60" : ""
                  }`}
                >
                  <span className="truncate">
                    {p.name} <span className="text-xs text-muted-foreground">{p.itemCode}</span>
                  </span>
                  {hasImage.has(p.id) && <Camera className="h-3.5 w-3.5 shrink-0 text-primary" />}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {!selectedProduct ? (
              <p className="flex h-full min-h-40 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                Pick a product to add or change its photo.
              </p>
            ) : (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <p className="text-sm font-medium">{selectedProduct.name}</p>
                <div className="flex h-40 items-center justify-center overflow-hidden rounded-md bg-muted/40">
                  {loading ? (
                    <p className="text-xs text-muted-foreground">Loading…</p>
                  ) : preview ? (
                    // Resized client-side to a small data URI — a plain <img> is fine, no remote host to configure.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview} alt={selectedProduct.name} className="h-full w-full object-contain" />
                  ) : (
                    <p className="text-xs text-muted-foreground">No photo yet</p>
                  )}
                </div>
                {canManage && (
                  <div className="flex gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void handleFile(file);
                      }}
                    />
                    <Button size="sm" variant="secondary" disabled={saving} onClick={() => fileInputRef.current?.click()}>
                      <Upload className="h-3.5 w-3.5" />
                      {saving ? "Saving…" : preview ? "Replace photo" : "Upload photo"}
                    </Button>
                    {preview && (
                      <Button size="sm" variant="ghost" disabled={saving} onClick={() => void removePhoto()}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        Remove
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
