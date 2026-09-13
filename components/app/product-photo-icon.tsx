"use client";

import * as React from "react";
import { toast } from "sonner";
import { Camera } from "lucide-react";
import { getProductImage } from "@/app/actions/products";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

/**
 * The small camera badge that shows up wherever a product is listed — Billing,
 * Purchase, Masters, the barcode/label pickers. It only renders when the
 * product actually has a photo (from the cheap id-only list every one of
 * those pages already fetches), and the image bytes themselves are only
 * pulled down the moment someone clicks it open, never as part of the list.
 */
export function ProductPhotoIcon({ productId, productName, className }: { productId: string; productName: string; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const [src, setSrc] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function handleOpen(e: React.MouseEvent) {
    // These badges sit on top of a clickable tile/row (add-to-cart, open row) — opening the
    // lightbox must never also fire whatever the tile underneath does.
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
    if (src) return;
    setLoading(true);
    try {
      setSrc(await getProductImage(productId));
    } catch {
      toast.error("Could not load that photo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => void handleOpen(e)}
        aria-label={`View photo of ${productName}`}
        className={`inline-flex items-center justify-center rounded-full bg-primary/90 p-1 text-primary-foreground shadow-sm transition-transform hover:scale-110 ${className ?? ""}`}
      >
        <Camera className="h-3 w-3" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>{productName}</DialogTitle>
            <DialogDescription className="sr-only">Product photo</DialogDescription>
          </DialogHeader>
          <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-lg bg-muted/40">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={productName} className="max-h-[70vh] w-full object-contain" />
            ) : (
              <p className="text-sm text-muted-foreground">No photo.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
