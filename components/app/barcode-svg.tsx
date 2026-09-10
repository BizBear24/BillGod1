"use client";

import * as React from "react";
import QRCode from "qrcode";
import { encodeBarcode, barcodeToSvg, type Symbology } from "@/lib/barcode/encoders";

export type LabelSymbology = Symbology | "qr";

export const LABEL_SYMBOLOGIES: { value: LabelSymbology; label: string }[] = [
  { value: "code128", label: "Code 128" },
  { value: "ean13", label: "EAN-13" },
  { value: "ean8", label: "EAN-8" },
  { value: "upca", label: "UPC-A" },
  { value: "qr", label: "QR Code" },
];

/** Renders QR modules with the same rectangle approach the 1D encoders use. */
function qrToSvg(value: string, size: number): string {
  const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
  const count = qr.modules.size;
  const data = qr.modules.data;
  const quiet = 2;
  const total = count + quiet * 2;
  const rects: string[] = [];
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (data[row * count + col]) rects.push(`<rect x="${col + quiet}" y="${row + quiet}" width="1" height="1" fill="#000"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#fff"/>${rects.join("")}</svg>`;
}

export function renderBarcodeSvg(
  symbology: LabelSymbology,
  value: string,
  options: { moduleWidth?: number; height?: number; showText?: boolean; qrSize?: number } = {}
): { svg: string; error: string | null } {
  try {
    if (!value.trim()) return { svg: "", error: "No value" };
    if (symbology === "qr") return { svg: qrToSvg(value, options.qrSize ?? 90), error: null };
    return {
      svg: barcodeToSvg(encodeBarcode(symbology, value), {
        moduleWidth: options.moduleWidth,
        height: options.height,
        showText: options.showText,
      }),
      error: null,
    };
  } catch (err) {
    return { svg: "", error: err instanceof Error ? err.message : "Could not encode this value" };
  }
}

export function BarcodeSvg({
  symbology,
  value,
  moduleWidth,
  height,
  showText = true,
  qrSize,
  className,
}: {
  symbology: LabelSymbology;
  value: string;
  moduleWidth?: number;
  height?: number;
  showText?: boolean;
  qrSize?: number;
  className?: string;
}) {
  const { svg, error } = React.useMemo(
    () => renderBarcodeSvg(symbology, value, { moduleWidth, height, showText, qrSize }),
    [symbology, value, moduleWidth, height, showText, qrSize]
  );

  if (error) return <span className="text-xs text-destructive">{error}</span>;
  // The SVG is built entirely from our own encoders — no user HTML reaches it.
  return <span className={className} aria-label={`${symbology} barcode for ${value}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}
