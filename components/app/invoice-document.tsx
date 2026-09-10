"use client";

import * as React from "react";
import { BarcodeSvg } from "@/components/app/barcode-svg";
import { INVOICE_COLUMNS, INVOICE_PAPERS, amountInWords, type InvoiceColumnKey, type InvoiceDesign } from "@/lib/print/templates";
import { formatDateTime } from "@/lib/utils";

/**
 * Renders a bill from an invoice design.
 *
 * The same component draws the designer's live preview and the page that
 * actually goes to the printer, so what a shop sets up is what comes out —
 * there is no second layout that could drift.
 *
 * Line items are a *band*, not free-floating boxes: a real HTML table, whose
 * header repeats on every printed page via `thead` and whose rows are allowed
 * to break naturally. That is what makes a fifty-line bill print correctly on
 * paper, which a drag-anywhere canvas could not do.
 */

export type InvoiceCompany = {
  name: string;
  gstin: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
};

export type InvoiceLine = {
  id: string;
  itemCode: string;
  name: string;
  hsn: string | null;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  billDiscountAmount: string;
  taxRatePercent: string;
  taxAmount: string;
  lineTotal: string;
};

export type InvoiceSale = {
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
  redeemedPoints: number;
  redeemedValue: string;
  loyaltyTierName: string | null;
  couponCode: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerGstin: string | null;
  salespersonName: string | null;
  counterName: string | null;
};

const num = (value: string | number) => (typeof value === "number" ? value : parseFloat(value) || 0);
const money = (value: string | number) => num(value).toFixed(2);

function cellValue(key: InvoiceColumnKey, line: InvoiceLine, index: number): string {
  switch (key) {
    case "serial":
      return String(index + 1);
    case "itemCode":
      return line.itemCode;
    case "name":
      return line.name;
    case "hsn":
      return line.hsn ?? "";
    case "quantity":
      return String(num(line.quantity));
    case "unitPrice":
      return money(line.unitPrice);
    case "discountPercent":
      return num(line.discountPercent) ? `${num(line.discountPercent)}%` : "";
    case "billDiscountAmount":
      return num(line.billDiscountAmount) ? money(line.billDiscountAmount) : "";
    case "taxRatePercent":
      return num(line.taxRatePercent) ? `${num(line.taxRatePercent)}%` : "";
    case "taxAmount":
      return money(line.taxAmount);
    case "lineTotal":
      return money(line.lineTotal);
    default:
      return "";
  }
}

export function InvoiceDocument({
  design,
  company,
  sale,
  lines,
  className,
}: {
  design: InvoiceDesign;
  company: InvoiceCompany | null;
  sale: InvoiceSale;
  lines: InvoiceLine[];
  className?: string;
}) {
  const paper = INVOICE_PAPERS.find((p) => p.value === design.paper) ?? INVOICE_PAPERS[0];
  const narrow = design.paper === "58mm" || design.paper === "80mm";
  const base = (narrow ? 9 : 11) * design.fontScale;

  const visible = design.columns.filter((c) => c.visible);
  const widthTotal = visible.reduce((s, c) => s + c.widthPercent, 0) || 1;

  const heading = (key: InvoiceColumnKey, override: string) =>
    override.trim() || INVOICE_COLUMNS.find((c) => c.key === key)?.label || key;
  const alignOf = (key: InvoiceColumnKey) => INVOICE_COLUMNS.find((c) => c.key === key)?.align ?? "left";

  const balance = num(sale.totalAmount) - num(sale.amountPaid) - num(sale.redeemedValue);

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
      {/* ------------------------------------------------------------ head */}
      <div style={{ textAlign: "center", marginBottom: `${base * 0.6}px` }}>
        <p style={{ fontSize: `${base * 1.35}px`, fontWeight: 700, letterSpacing: "0.06em", color: design.accentColor }}>{design.title}</p>
        {design.showCompanyBlock && company && (
          <>
            <p style={{ fontSize: `${base * 1.15}px`, fontWeight: 700 }}>{company.name}</p>
            {company.addressLine1 && <p>{company.addressLine1}</p>}
            {(company.city || company.state) && <p>{[company.city, company.state].filter(Boolean).join(", ")}</p>}
            {design.showGstin && company.gstin && <p>GSTIN: {company.gstin}</p>}
            {company.phone && <p>Ph: {company.phone}</p>}
          </>
        )}
        {design.headerLines.filter(Boolean).map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>

      {sale.status === "cancelled" && (
        <p
          style={{
            textAlign: "center",
            border: "1px solid #000",
            padding: `${base * 0.3}px`,
            fontWeight: 700,
            marginBottom: `${base * 0.5}px`,
          }}
        >
          CANCELLED
        </p>
      )}

      <div style={{ borderTop: "1px dashed #000", margin: `${base * 0.4}px 0` }} />

      {/* --------------------------------------------------------- meta */}
      <div style={narrow ? {} : { display: "flex", justifyContent: "space-between", gap: `${base}px` }}>
        <div>
          <p>
            <strong>Bill:</strong> {sale.docNumber}
          </p>
          <p>
            <strong>Date:</strong> {formatDateTime(sale.createdAt)}
          </p>
          <p>
            <strong>Type:</strong> {sale.docType.replace("_", " ")}
          </p>
        </div>
        <div style={narrow ? {} : { textAlign: "right" }}>
          {design.showCustomer && (
            <>
              <p>
                <strong>Customer:</strong> {sale.customerName ?? "Walk-in"}
              </p>
              {sale.customerPhone && <p>{sale.customerPhone}</p>}
              {design.showGstin && sale.customerGstin && <p>GSTIN: {sale.customerGstin}</p>}
            </>
          )}
          {design.showSalesperson && sale.salespersonName && (
            <p>
              <strong>Served by:</strong> {sale.salespersonName}
            </p>
          )}
          {design.showCounter && sale.counterName && (
            <p>
              <strong>Counter:</strong> {sale.counterName}
            </p>
          )}
        </div>
      </div>

      <div style={{ borderTop: "1px dashed #000", margin: `${base * 0.4}px 0` }} />

      {/* ------------------------------------------------ the item band */}
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <colgroup>
          {visible.map((c) => (
            <col key={c.key} style={{ width: `${(c.widthPercent / widthTotal) * 100}%` }} />
          ))}
        </colgroup>
        <thead>
          {/* Repeats at the top of every printed page. */}
          <tr style={{ borderBottom: `1px solid ${design.accentColor}` }}>
            {visible.map((c) => (
              <th
                key={c.key}
                style={{
                  textAlign: alignOf(c.key),
                  padding: `${base * 0.2}px ${base * 0.15}px`,
                  fontWeight: 700,
                  color: design.accentColor,
                }}
              >
                {heading(c.key, c.label)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={line.id} style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
              {visible.map((c) => (
                <td
                  key={c.key}
                  style={{
                    textAlign: alignOf(c.key),
                    padding: `${base * 0.18}px ${base * 0.15}px`,
                    verticalAlign: "top",
                    wordBreak: "break-word",
                  }}
                >
                  {cellValue(c.key, line, index)}
                </td>
              ))}
            </tr>
          ))}
          {lines.length === 0 && (
            <tr>
              <td colSpan={Math.max(1, visible.length)} style={{ textAlign: "center", padding: `${base}px` }}>
                No items on this bill.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div style={{ borderTop: "1px dashed #000", margin: `${base * 0.4}px 0` }} />

      {/* -------------------------------------------------------- totals */}
      <div style={{ marginLeft: "auto", maxWidth: narrow ? "100%" : "62mm", breakInside: "avoid", pageBreakInside: "avoid" }}>
        {design.showSubtotal && <TotalRow label="Subtotal" value={money(sale.subtotal)} base={base} />}
        {design.showDiscount && num(sale.discountAmount) > 0 && (
          <TotalRow
            label={sale.couponCode ? `Discount (${sale.couponCode})` : sale.loyaltyTierName ? `Discount (${sale.loyaltyTierName})` : "Discount"}
            value={`-${money(sale.discountAmount)}`}
            base={base}
          />
        )}
        {design.showTax && num(sale.taxAmount) > 0 && <TotalRow label="Tax" value={money(sale.taxAmount)} base={base} />}
        {design.showRoundOff && num(sale.roundOff) !== 0 && <TotalRow label="Round off" value={money(sale.roundOff)} base={base} />}
        <TotalRow label="Total" value={money(sale.totalAmount)} base={base} strong accent={design.accentColor} />
        {design.showLoyalty && num(sale.redeemedValue) > 0 && (
          <TotalRow label={`Points redeemed (${sale.redeemedPoints})`} value={`-${money(sale.redeemedValue)}`} base={base} />
        )}
        {design.showPaid && <TotalRow label="Paid" value={money(sale.amountPaid)} base={base} />}
        {design.showBalance && <TotalRow label="Balance" value={money(balance)} base={base} strong />}
      </div>

      {design.showAmountInWords && (
        <p style={{ marginTop: `${base * 0.4}px`, fontStyle: "italic", breakInside: "avoid" }}>
          {amountInWords(num(sale.totalAmount))}
        </p>
      )}

      {/* -------------------------------------------------------- footer */}
      <div style={{ marginTop: `${base * 0.8}px`, breakInside: "avoid", pageBreakInside: "avoid" }}>
        {design.footerLines.filter(Boolean).map((line, i) => (
          <p key={i} style={{ textAlign: "center" }}>
            {line}
          </p>
        ))}

        {design.showSignature && (
          <div style={{ marginTop: `${base * 2.2}px`, textAlign: "right" }}>
            <span style={{ borderTop: "1px solid #000", paddingTop: `${base * 0.2}px` }}>{design.signatureLabel}</span>
          </div>
        )}

        {design.showBarcode && (
          <div style={{ marginTop: `${base * 0.6}px`, display: "flex", justifyContent: "center" }}>
            <BarcodeSvg symbology="code128" value={sale.docNumber} moduleWidth={1} height={28} />
          </div>
        )}
      </div>
    </div>
  );
}

function TotalRow({
  label,
  value,
  base,
  strong,
  accent,
}: {
  label: string;
  value: string;
  base: number;
  strong?: boolean;
  accent?: string;
}) {
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

/** A believable bill for the designer's preview, so nothing has to be billed to try a layout. */
export const SAMPLE_INVOICE: { sale: InvoiceSale; lines: InvoiceLine[] } = {
  sale: {
    docNumber: "SALE-000123",
    docType: "sale",
    status: "completed",
    createdAt: new Date(),
    subtotal: "3400.00",
    discountAmount: "170.00",
    taxAmount: "161.50",
    roundOff: "0.00",
    totalAmount: "3391.50",
    amountPaid: "3000.00",
    redeemedPoints: 400,
    redeemedValue: "100.00",
    loyaltyTierName: "Gold",
    couponCode: null,
    customerName: "Anita Sharma",
    customerPhone: "9000000001",
    customerGstin: null,
    salespersonName: "Ramesh",
    counterName: "Counter 1",
  },
  lines: [
    {
      id: "s1",
      itemCode: "SKU-001",
      name: "Blue Cotton Shirt",
      hsn: "6205",
      quantity: "2",
      unitPrice: "1000.00",
      discountPercent: "0",
      billDiscountAmount: "100.00",
      taxRatePercent: "5",
      taxAmount: "95.00",
      lineTotal: "1995.00",
    },
    {
      id: "s2",
      itemCode: "SKU-002",
      name: "Denim Jeans",
      hsn: "6203",
      quantity: "1",
      unitPrice: "1400.00",
      discountPercent: "0",
      billDiscountAmount: "70.00",
      taxRatePercent: "5",
      taxAmount: "66.50",
      lineTotal: "1396.50",
    },
  ],
};
