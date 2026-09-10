"use client";

import * as React from "react";
import { BarcodeSvg, type LabelSymbology } from "@/components/app/barcode-svg";
import { LABEL_FIELDS, type LabelDesign, type LabelElement } from "@/lib/print/templates";

/**
 * Draws one label from a design.
 *
 * Shared by the designer's canvas and the actual print sheet, so what a shop
 * arranges on screen is literally what comes out of the printer — there is no
 * second layout engine that could drift from the first.
 *
 * Everything in a design is millimetres; `pxPerMm` is the only place that
 * becomes pixels. Print uses a CSS `mm` box so the browser handles the real
 * physical scaling.
 */

export type LabelUnit = "px" | "mm";

export type LabelData = {
  name: string;
  itemCode: string;
  barcode: string;
  sellingPrice: string;
  mrp: string;
  unit: string;
  companyName: string;
};

/** Resolves a `field` element's binding against the product being labelled. */
export function resolveLabelValue(key: string, data: LabelData): string {
  switch (key) {
    case "product.name":
      return data.name;
    case "product.itemCode":
      return data.itemCode;
    case "product.barcode":
      return data.barcode || data.itemCode;
    case "product.sellingPrice":
      return data.sellingPrice;
    case "product.mrp":
      return data.mrp;
    case "product.unit":
      return data.unit;
    case "company.name":
      return data.companyName;
    default:
      return "";
  }
}

export const SAMPLE_LABEL_DATA: LabelData = {
  name: "Blue Cotton Shirt",
  itemCode: "SKU-001",
  barcode: "8901234567890",
  sellingPrice: "₹1000.00",
  mrp: "₹1200.00",
  unit: "Piece",
  companyName: "Your Shop",
};

export function labelFieldLabel(key: string): string {
  return LABEL_FIELDS.find((f) => f.key === key)?.label ?? key;
}

function LabelElementView({
  element,
  data,
  pxPerMm,
  unit,
}: {
  element: LabelElement;
  data: LabelData;
  pxPerMm: number;
  unit: LabelUnit;
}) {
  // On screen everything is pixels at a chosen zoom; on paper it is real
  // millimetres and points, so the browser does the physical scaling and a
  // 50 mm label actually measures 50 mm.
  const mm = (value: number) => (unit === "mm" ? `${value}mm` : `${value * pxPerMm}px`);

  const common: React.CSSProperties = {
    position: "absolute",
    left: mm(element.x),
    top: mm(element.y),
    width: mm(element.w),
    height: mm(element.h),
    overflow: "hidden",
  };

  if (element.type === "line") {
    return <div style={{ ...common, background: "#000", height: unit === "mm" ? `${Math.max(0.2, element.h)}mm` : `${Math.max(1, element.h * pxPerMm)}px` }} />;
  }
  if (element.type === "box") {
    return <div style={{ ...common, border: "1px solid #000" }} />;
  }

  if (element.type === "barcode" || element.type === "qr") {
    const value = resolveLabelValue(element.value, data) || data.itemCode;
    const symbology = (element.type === "qr" ? "qr" : element.symbology) as LabelSymbology;
    return (
      <div style={{ ...common, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <BarcodeSvg
          symbology={symbology}
          value={value}
          // The SVG is scaled to the element box, so the design's millimetres
          // decide the printed size rather than these pixel hints.
          moduleWidth={1}
          height={Math.max(12, element.h * (unit === "mm" ? 3.78 : pxPerMm) * (element.showValue ? 0.72 : 0.95))}
          qrSize={Math.max(20, Math.min(element.w, element.h) * (unit === "mm" ? 3.78 : pxPerMm))}
          showText={element.type === "barcode" && element.showValue}
          className="max-h-full max-w-full [&>svg]:h-full [&>svg]:w-full"
        />
      </div>
    );
  }

  const text = element.type === "field" ? resolveLabelValue(element.value, data) : element.value;
  return (
    <div
      style={{
        ...common,
        display: "flex",
        alignItems: "center",
        justifyContent: element.align === "center" ? "center" : element.align === "right" ? "flex-end" : "flex-start",
        fontSize: unit === "mm" ? `${element.fontSize}pt` : `${element.fontSize * (pxPerMm / 3.78)}px`,
        fontWeight: element.bold ? 700 : 400,
        lineHeight: 1.1,
        textAlign: element.align,
        color: "#000",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </div>
  );
}

/**
 * One label. `unit` decides whether it is drawn for a screen (pixels at a
 * chosen zoom) or for paper (real millimetres) — the geometry in the design is
 * the same either way, which is what keeps preview and print identical.
 */
export function LabelPreview({
  design,
  data,
  pxPerMm = 1,
  unit = "px",
  className,
  style,
}: {
  design: LabelDesign;
  data: LabelData;
  pxPerMm?: number;
  unit?: LabelUnit;
  className?: string;
  style?: React.CSSProperties;
}) {
  const size = (value: number) => (unit === "mm" ? `${value}mm` : `${value * pxPerMm}px`);
  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: size(design.widthMm),
        height: size(design.heightMm),
        background: "#fff",
        border: design.showBorder ? "1px solid #000" : "1px solid transparent",
        boxSizing: "border-box",
        ...style,
      }}
    >
      {design.elements.map((element) => (
        <LabelElementView key={element.id} element={element} data={data} pxPerMm={pxPerMm} unit={unit} />
      ))}
    </div>
  );
}
