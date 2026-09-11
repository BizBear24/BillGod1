/**
 * Which master lists a product (or similar) form can add to on the spot.
 *
 * Picking a colour used to mean abandoning a half-filled product form, going
 * to Masters, creating the colour, and starting over. These kinds can be
 * created from one typed value right where they are needed.
 *
 * `subsection` needs a parent section to attach to — a name alone doesn't
 * define one — so it is only offered once a Section has been chosen elsewhere
 * in the same form. See `CrudField.dependsOn` in entity-crud-manager.tsx.
 *
 * These live here rather than beside the action because a `"use server"` file
 * may only export async functions — a plain constant exported from one is a
 * runtime error, not a type error, so it only surfaces when the page runs.
 */
export const INLINE_MASTER_KINDS = ["category", "section", "subsection", "brand", "unit", "size", "color", "hsnCode", "taxRate"] as const;

export type InlineMasterKind = (typeof INLINE_MASTER_KINDS)[number];

export const INLINE_MASTER_LABELS: Record<InlineMasterKind, string> = {
  category: "category",
  section: "section",
  subsection: "subsection",
  brand: "brand",
  unit: "unit",
  size: "size",
  color: "colour",
  hsnCode: "HSN code",
  taxRate: "tax rate",
};
