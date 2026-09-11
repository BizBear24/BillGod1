/**
 * Which master lists a product (or similar) form can add to on the spot.
 *
 * Picking a colour used to mean abandoning a half-filled product form, going
 * to Masters, creating the colour, and starting over. These kinds can be
 * created from one typed value right where they are needed.
 *
 * `subsection` is deliberately absent: it belongs to a section, so there is no
 * single value that defines one. It stays on the Masters screen where the
 * parent can be chosen properly.
 *
 * These live here rather than beside the action because a `"use server"` file
 * may only export async functions — a plain constant exported from one is a
 * runtime error, not a type error, so it only surfaces when the page runs.
 */
export const INLINE_MASTER_KINDS = ["category", "section", "brand", "unit", "size", "color", "hsnCode", "taxRate"] as const;

export type InlineMasterKind = (typeof INLINE_MASTER_KINDS)[number];

export const INLINE_MASTER_LABELS: Record<InlineMasterKind, string> = {
  category: "category",
  section: "section",
  brand: "brand",
  unit: "unit",
  size: "size",
  color: "colour",
  hsnCode: "HSN code",
  taxRate: "tax rate",
};
