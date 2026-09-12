"use client";

import * as React from "react";
import { BarcodeSvg } from "@/components/app/barcode-svg";
import { INVOICE_PAPERS, amountInWords, type InvoiceDesign } from "@/lib/print/templates";
import { formatDateTime } from "@/lib/utils";
import type { InvoiceCompany } from "@/components/app/invoice-document";

/**
 * Renders a purchase document (Goods Receipt Note / Purchase Invoice /
 * Purchase Return) for printing.
 *
 * Deliberately a separate, simpler component from `InvoiceDocument` rather
 * than a prop-mapped reuse of it — a purchase has no loyalty tier, coupon or
 * bill-level discount to render, and a supplier block instead of a customer
 * one. It borrows the same `InvoiceDesign` (paper size, margins, accent
 * colour, fonts) so a shop's printed purchase paperwork matches its sales
 * paperwork without a second designer to maintain.
 */

export type PurchaseLine = {
  id: string;
  itemCode: string;
  name: string;
  hsn: string | null;
  quantity: string;
  unitCost: string;
  discountPercent: string;
  taxRatePercent: string;
  taxAmount: string;
  lineTotal: string;
};

export type PurchaseDetail = {
  docNumber: string;
  docType: string;
  status: string;
  createdAt: Date;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  roundOff: string;
  totalAmount: string;
  amountPaid: string;
  supplierInvoiceNumber: string | null;
  supplierName: string;
  supplierPhone: string | null;
  supplierGstin: string | null;
};

const DOC_TITLES: Record<string, string> = {
  purchase_order: "PURCHASE ORDER",
  purchase: "GOODS RECEIPT NOTE",
  purchase_return: "PURCHASE RETURN",
};

const num = (value: string | number) => (typeof value === "number" ? value : parseFloat(value) || 0);
const money = (value: string | number) => num(value).toFixed(2);

export function PurchaseDocument({
  design,
  company,
  purchase,
  lines,
  className,
}: {
  design: InvoiceDesign;
  company: InvoiceCompany | null;
  purchase: PurchaseDetail;
  lines: PurchaseLine[];
  className?: string;
}) {
  const paper = INVOICE_PAPERS.find((p) => p.value === design.paper) ?? INVOICE_PAPERS[0];
  const narrow = design.paper === "58mm" || design.paper === "80mm";
  const base = (narrow ? 9 : 11) * design.fontScale;
  const balance = num(purchase.totalAmount) - num(purchase.amountPaid);

  return (
    <div
      className={className}
      style={{
        width: `${paper.widthMm}mm`,
        maxWidth: "100%",
        padding: `${design.marginMm}mm`,
        background: "#fff",
        color: "#000",
        fontSize: `${base}px`,
        lineHeight: 1.35,
        boxSizing: "border-box",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: `${base * 0.6}px` }}>
        <p style={{ fontSize: `${base * 1.35}px`, fontWeight: 700, letterSpacing: "0.06em", color: design.accentColor }}>
          {DOC_TITLES[purchase.docType] ?? "PURCHASE DOCUMENT"}
        </p>
        {design.showCompanyBlock && company && (
          <>
            <p style={{ fontSize: `${base * 1.15}px`, fontWeight: 700 }}>{company.name}</p>
            {company.addressLine1 && <p>{company.addressLine1}</p>}
            {(company.city || company.state) && <p>{[company.city, company.state].filter(Boolean).join(", ")}</p>}
            {design.showGstin && company.gstin && <p>GSTIN: {company.gstin}</p>}
            {company.phone && <p>Ph: {company.phone}</p>}
          </>
        )}
      </div>

      {purchase.status === "cancelled" && (
        <p style={{ textAlign: "center", border: "1px solid #000", padding: `${base * 0.3}px`, fontWeight: 700, marginBottom: `${base * 0.5}px` }}>
          CANCELLED
        </p>
      )}

      <div style={{ borderTop: "1px dashed #000", margin: `${base * 0.4}px 0` }} />

      <div style={narrow ? {} : { display: "flex", justifyContent: "space-between", gap: `${base}px` }}>
        <div>
          <p>
            <strong>Doc:</strong> {purchase.docNumber}
          </p>
          <p>
            <strong>Date:</strong> {formatDateTime(purchase.createdAt)}
          </p>
          {purchase.supplierInvoiceNumber && (
            <p>
              <strong>Supplier Inv:</strong> {purchase.supplierInvoiceNumber}
            </p>
          )}
        </div>
        <div style={narrow ? {} : { textAlign: "right" }}>
          <p>
            <strong>Supplier:</strong> {purchase.supplierName}
          </p>
          {purchase.supplierPhone && <p>{purchase.supplierPhone}</p>}
          {design.showGstin && purchase.supplierGstin && <p>GSTIN: {purchase.supplierGstin}</p>}
        </div>
      </div>

      <div style={{ borderTop: "1px dashed #000", margin: `${base * 0.4}px 0` }} />

      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "6%" }} />
          <col style={{ width: narrow ? "40%" : "32%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "14%" }} />
          {!narrow && <col style={{ width: "10%" }} />}
          <col style={{ width: "16%" }} />
        </colgroup>
        <thead>
          <tr style={{ borderBottom: `1px solid ${design.accentColor}` }}>
            <Th base={base} accent={design.accentColor} align="left">
              #
            </Th>
            <Th base={base} accent={design.accentColor} align="left">
              Item
            </Th>
            <Th base={base} accent={design.accentColor} align="right">
              Qty
            </Th>
            <Th base={base} accent={design.accentColor} align="right">
              Rate
            </Th>
            <Th base={base} accent={design.accentColor} align="right">
              GST %
            </Th>
            {!narrow && (
              <Th base={base} accent={design.accentColor} align="right">
                GST Amt
              </Th>
            )}
            <Th base={base} accent={design.accentColor} align="right">
              Amount
            </Th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={line.id} style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
              <Td base={base} align="left">
                {index + 1}
              </Td>
              <Td base={base} align="left">
                {line.name}
                <span style={{ display: "block", fontSize: `${base * 0.85}px`, opacity: 0.75 }}>
                  {line.itemCode}
                  {line.hsn ? ` · HSN ${line.hsn}` : ""}
                </span>
              </Td>
              <Td base={base} align="right">
                {num(line.quantity)}
              </Td>
              <Td base={base} align="right">
                {money(line.unitCost)}
              </Td>
              <Td base={base} align="right">
                {num(line.taxRatePercent) ? `${num(line.taxRatePercent)}%` : "—"}
              </Td>
              {!narrow && (
                <Td base={base} align="right">
                  {money(line.taxAmount)}
                </Td>
              )}
              <Td base={base} align="right">
                {money(line.lineTotal)}
              </Td>
            </tr>
          ))}
          {lines.length === 0 && (
            <tr>
              <td colSpan={narrow ? 6 : 7} style={{ textAlign: "center", padding: `${base}px` }}>
                No items on this document.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div style={{ borderTop: "1px dashed #000", margin: `${base * 0.4}px 0` }} />

      <div style={{ marginLeft: "auto", maxWidth: narrow ? "100%" : "62mm", breakInside: "avoid", pageBreakInside: "avoid" }}>
        <TotalRow label="Subtotal" value={money(purchase.subtotal)} base={base} />
        {num(purchase.discountAmount) > 0 && <TotalRow label="Discount" value={`-${money(purchase.discountAmount)}`} base={base} />}
        {num(purchase.taxAmount) > 0 && <TotalRow label="Tax" value={money(purchase.taxAmount)} base={base} />}
        {num(purchase.roundOff) !== 0 && <TotalRow label="Round off" value={money(purchase.roundOff)} base={base} />}
        <TotalRow label="Total" value={money(purchase.totalAmount)} base={base} strong accent={design.accentColor} />
        <TotalRow label="Paid" value={money(purchase.amountPaid)} base={base} />
        <TotalRow label="Balance" value={money(balance)} base={base} strong />
      </div>

      {!narrow && (
        <p style={{ marginTop: `${base * 0.4}px`, fontStyle: "italic", breakInside: "avoid" }}>{amountInWords(num(purchase.totalAmount))}</p>
      )}

      <div style={{ marginTop: `${base * 0.8}px`, breakInside: "avoid", pageBreakInside: "avoid" }}>
        {design.showSignature && (
          <div style={{ marginTop: `${base * 2.2}px`, textAlign: "right" }}>
            <span style={{ borderTop: "1px solid #000", paddingTop: `${base * 0.2}px` }}>{design.signatureLabel}</span>
          </div>
        )}
        {design.showBarcode && (
          <div style={{ marginTop: `${base * 0.6}px`, display: "flex", justifyContent: "center" }}>
            <BarcodeSvg symbology="code128" value={purchase.docNumber} moduleWidth={1} height={28} />
          </div>
        )}
      </div>
    </div>
  );
}

function Th({ base, accent, align, children }: { base: number; accent: string; align: "left" | "right"; children: React.ReactNode }) {
  return (
    <th style={{ textAlign: align, padding: `${base * 0.2}px ${base * 0.15}px`, fontWeight: 700, color: accent }}>{children}</th>
  );
}

function Td({ base, align, children }: { base: number; align: "left" | "right"; children: React.ReactNode }) {
  return (
    <td style={{ textAlign: align, padding: `${base * 0.18}px ${base * 0.15}px`, verticalAlign: "top", wordBreak: "break-word" }}>{children}</td>
  );
}

function TotalRow({ label, value, base, strong, accent }: { label: string; value: string; base: number; strong?: boolean; accent?: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        fontWeight: strong ? 700 : 400,
        fontSize: strong ? `${base * 1.1}px` : undefined,
        color: strong && accent ? accent : undefined,
        borderTop: strong ? "1px solid #000" : undefined,
        paddingTop: strong ? `${base * 0.15}px` : undefined,
      }}
    >
      <span>{label}</span>
      <span>₹{value}</span>
    </div>
  );
}
