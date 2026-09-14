/**
 * The one place a bill's arithmetic lives.
 *
 * The POS renders these numbers as the cashier types and the server recomputes
 * them from scratch before saving, so a tampered or stale client can never
 * decide what a bill is worth. Both sides import this module, which is why it
 * is pure and has no `server-only` marker.
 *
 * Bill-level discounts (a loyalty tier's percentage, a coupon) are *not* taken
 * off the grand total: they are apportioned across the lines pro-rata, so each
 * GST rate slab is reduced by its own share and the rate-wise tax stays right.
 */

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type TotalsItemInput = {
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  taxRatePercent?: number;
};

export type TotalsOptions = {
  /** Loyalty tier percentage off the whole bill. */
  tierDiscountPercent?: number;
  /** A manual "% off everything" the cashier typed in, independent of any loyalty tier. */
  billDiscountPercent?: number;
  /** Flat rupee value of an applied coupon, before capping. */
  couponDiscountAmount?: number;
};

export type ComputedLine = {
  lineSubtotal: number;
  lineDiscount: number;
  billDiscountAmount: number;
  taxableValue: number;
  taxAmount: number;
  lineTotal: number;
};

export type ComputedTotals = {
  lines: ComputedLine[];
  subtotal: number;
  /** Discounts entered per line, before any bill-level discount. */
  lineDiscountAmount: number;
  tierDiscountAmount: number;
  /** What the manual "% off everything" was actually worth, after sharing the bill with the tier discount. */
  billDiscountPercentAmount: number;
  /** What the coupon was actually worth after capping at the bill's value. */
  couponDiscountAmount: number;
  /** Line discounts + tier + coupon — what the header stores. */
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
};

/**
 * Spreads a bill-level discount over the lines in proportion to what each is
 * worth after its own discount, then puts any left-over paisa on the largest
 * line so the shares add up to the discount exactly.
 */
function apportion(total: number, weights: number[]): number[] {
  const weightSum = weights.reduce((s, w) => s + w, 0);
  if (total <= 0 || weightSum <= 0) return weights.map(() => 0);

  const shares = weights.map((w) => round2((total * w) / weightSum));
  const drift = round2(total - shares.reduce((s, v) => s + v, 0));
  if (drift !== 0) {
    let largest = 0;
    for (let i = 1; i < weights.length; i++) if (weights[i] > weights[largest]) largest = i;
    shares[largest] = round2(shares[largest] + drift);
  }
  // Apportionment can only ever reduce a line to zero, never past it.
  return shares.map((share, i) => Math.max(0, Math.min(share, weights[i])));
}

export function computeSaleTotals(items: TotalsItemInput[], options: TotalsOptions = {}): ComputedTotals {
  const bases = items.map((item) => {
    const lineSubtotal = item.quantity * item.unitPrice;
    const lineDiscount = lineSubtotal * ((item.discountPercent ?? 0) / 100);
    return { lineSubtotal, lineDiscount, base: lineSubtotal - lineDiscount };
  });

  const baseTotal = bases.reduce((s, b) => s + b.base, 0);
  const tierPercent = Math.max(0, Math.min(100, options.tierDiscountPercent ?? 0));
  const manualPercent = Math.max(0, Math.min(100, options.billDiscountPercent ?? 0));
  // The tier and the manual "% off everything" are independent settings, so
  // together they can ask for more than the bill is worth — scaled down
  // proportionally rather than letting one silently win over the other.
  const rawTierAmount = round2((baseTotal * tierPercent) / 100);
  const rawManualAmount = round2((baseTotal * manualPercent) / 100);
  const rawPercentTotal = round2(rawTierAmount + rawManualAmount);
  const percentDiscountAmount = Math.min(baseTotal, rawPercentTotal);
  const percentScale = rawPercentTotal > 0 ? percentDiscountAmount / rawPercentTotal : 1;
  const tierDiscountAmount = round2(rawTierAmount * percentScale);
  const billDiscountPercentAmount = round2(percentDiscountAmount - tierDiscountAmount);
  // A coupon can only take off what is left after those, never more.
  const couponDiscountAmount = round2(Math.max(0, Math.min(options.couponDiscountAmount ?? 0, baseTotal - percentDiscountAmount)));
  const billDiscount = round2(percentDiscountAmount + couponDiscountAmount);

  const shares = apportion(
    billDiscount,
    bases.map((b) => round2(b.base))
  );

  const lines: ComputedLine[] = bases.map((b, i) => {
    const billDiscountAmount = shares[i];
    const taxableValue = b.base - billDiscountAmount;
    const taxAmount = taxableValue * ((items[i].taxRatePercent ?? 0) / 100);
    return {
      lineSubtotal: round2(b.lineSubtotal),
      lineDiscount: round2(b.lineDiscount),
      billDiscountAmount,
      taxableValue: round2(taxableValue),
      taxAmount: round2(taxAmount),
      lineTotal: round2(taxableValue + taxAmount),
    };
  });

  const subtotal = round2(bases.reduce((s, b) => s + b.lineSubtotal, 0));
  const lineDiscountAmount = round2(bases.reduce((s, b) => s + b.lineDiscount, 0));
  const appliedBillDiscount = round2(shares.reduce((s, v) => s + v, 0));
  const discountAmount = round2(lineDiscountAmount + appliedBillDiscount);
  const taxAmount = round2(lines.reduce((s, l) => s + l.taxAmount, 0));

  return {
    lines,
    subtotal,
    lineDiscountAmount,
    tierDiscountAmount,
    billDiscountPercentAmount,
    couponDiscountAmount,
    discountAmount,
    taxAmount,
    totalAmount: round2(subtotal - discountAmount + taxAmount),
  };
}
