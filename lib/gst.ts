import type { GST_TYPES } from "./validation/common";

export type GstType = (typeof GST_TYPES)[number];

/**
 * Splits a line's tax amount by its GST type: the whole amount as IGST
 * (inter-state), or halved into CGST + SGST (intra-state). The one place
 * this arithmetic lives — purchase and sales totals, and their printed
 * documents, all call this instead of re-deriving the halving themselves.
 */
export function splitGstAmount(taxAmount: number, gstType: GstType): { igst: number; cgst: number; sgst: number } {
  if (gstType === "igst") return { igst: taxAmount, cgst: 0, sgst: 0 };
  const half = taxAmount / 2;
  return { igst: 0, cgst: half, sgst: half };
}

/** Sums the IGST/CGST/SGST split across every line of a document. */
export function sumGstSplits(lines: { taxAmount: number; gstType: GstType }[]): { igst: number; cgst: number; sgst: number } {
  return lines.reduce(
    (acc, l) => {
      const s = splitGstAmount(l.taxAmount, l.gstType);
      return { igst: acc.igst + s.igst, cgst: acc.cgst + s.cgst, sgst: acc.sgst + s.sgst };
    },
    { igst: 0, cgst: 0, sgst: 0 }
  );
}
