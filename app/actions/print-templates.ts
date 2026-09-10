"use server";

import { eq, and, ne, desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { printTemplates } from "@/db/schema";
import { requireSessionUser, getActiveMembership } from "@/lib/auth/session";
import { can, PERMISSIONS } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/audit";
import {
  labelDesignSchema,
  invoiceDesignSchema,
  defaultLabelDesign,
  defaultInvoiceDesign,
  type LabelDesign,
  type InvoiceDesign,
} from "@/lib/print/templates";
import type { ActionResult } from "./auth";

/**
 * Saved label and invoice designs.
 *
 * A design arrives from the browser as a plain object, so it is parsed with
 * the same Zod schema the designers build against before it is stored — a
 * malformed layout can never reach the renderer.
 */

export type StoredTemplate<T> = {
  id: string;
  name: string;
  isDefault: boolean;
  design: T;
  updatedAt: Date;
};

async function requireTemplateGate() {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership) throw new Error("NO_ACTIVE_BUSINESS");
  // Designing what a label or bill looks like is a settings-shaped job, so it
  // rides on the same permission as the rest of the master data.
  if (!can(membership.role, PERMISSIONS.MASTERS_MANAGE)) return null;
  return { sessionUser, membership };
}

/**
 * Templates of one kind, newest first, with the stored designs validated.
 * A row whose design no longer parses is dropped from the list rather than
 * crashing the page — the designer can simply save a fresh one over it.
 */
async function loadTemplates(businessId: string, kind: "label" | "invoice") {
  const db = await getDb();
  const rows = await db
    .select()
    .from(printTemplates)
    .where(and(eq(printTemplates.businessId, businessId), eq(printTemplates.kind, kind)))
    .orderBy(desc(printTemplates.isDefault), desc(printTemplates.updatedAt));

  const schema = kind === "label" ? labelDesignSchema : invoiceDesignSchema;
  return rows.flatMap((row) => {
    const parsed = schema.safeParse(row.design);
    if (!parsed.success) return [];
    return [{ id: row.id, name: row.name, isDefault: row.isDefault, design: parsed.data, updatedAt: row.updatedAt }];
  });
}

export async function getPrintTemplates(): Promise<{
  labels: StoredTemplate<LabelDesign>[];
  invoices: StoredTemplate<InvoiceDesign>[];
  canManage: boolean;
}> {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership) throw new Error("NO_ACTIVE_BUSINESS");

  const [labels, invoices] = await Promise.all([
    loadTemplates(membership.businessId, "label"),
    loadTemplates(membership.businessId, "invoice"),
  ]);

  return {
    labels: labels as StoredTemplate<LabelDesign>[],
    invoices: invoices as StoredTemplate<InvoiceDesign>[],
    canManage: can(membership.role, PERMISSIONS.MASTERS_MANAGE),
  };
}

/**
 * Creates or overwrites one design. Passing `templateId` updates that row;
 * omitting it creates a new one under the given name.
 */
export async function savePrintTemplate(params: {
  templateId: string | null;
  kind: "label" | "invoice";
  name: string;
  design: unknown;
  makeDefault: boolean;
}): Promise<ActionResult & { templateId?: string }> {
  const gate = await requireTemplateGate();
  if (!gate) return { ok: false, error: "You don't have permission to change print designs." };

  const name = params.name.trim();
  if (name.length < 1) return { ok: false, error: "Give the design a name." };
  if (name.length > 60) return { ok: false, error: "Keep the name under 60 characters." };

  const schema = params.kind === "label" ? labelDesignSchema : invoiceDesignSchema;
  const parsed = schema.safeParse(params.design);
  if (!parsed.success) {
    return { ok: false, error: `That design isn't valid: ${parsed.error.issues[0]?.message ?? "unknown problem"}` };
  }

  const db = await getDb();
  const businessId = gate.membership.businessId;

  try {
    const saved = await db.transaction(async (tx) => {
      let id = params.templateId;

      if (id) {
        const [existing] = await tx
          .select({ id: printTemplates.id })
          .from(printTemplates)
          .where(and(eq(printTemplates.id, id), eq(printTemplates.businessId, businessId), eq(printTemplates.kind, params.kind)))
          .limit(1);
        if (!existing) throw new Error("That design no longer exists.");

        await tx
          .update(printTemplates)
          .set({ name, design: parsed.data, updatedAt: new Date() })
          .where(eq(printTemplates.id, id));
      } else {
        const [created] = await tx
          .insert(printTemplates)
          .values({ businessId, kind: params.kind, name, design: parsed.data })
          .returning();
        id = created.id;
      }

      // Exactly one default per kind, so clearing the others is part of the
      // same transaction as setting this one.
      if (params.makeDefault) {
        await tx
          .update(printTemplates)
          .set({ isDefault: false })
          .where(and(eq(printTemplates.businessId, businessId), eq(printTemplates.kind, params.kind), ne(printTemplates.id, id)));
        await tx.update(printTemplates).set({ isDefault: true }).where(eq(printTemplates.id, id));
      }

      return id;
    });

    await logAudit({
      businessId,
      userId: gate.sessionUser.userId,
      action: params.templateId ? "print_template.updated" : "print_template.created",
      entityType: "print_template",
      entityId: saved,
      after: { kind: params.kind, name, isDefault: params.makeDefault },
    });

    return { ok: true, templateId: saved };
  } catch (err) {
    if (err instanceof Error && err.message.includes("unique")) {
      return { ok: false, error: `A ${params.kind} design called "${name}" already exists.` };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Could not save that design." };
  }
}

export async function setDefaultPrintTemplate(templateId: string, kind: "label" | "invoice"): Promise<ActionResult> {
  const gate = await requireTemplateGate();
  if (!gate) return { ok: false, error: "You don't have permission to change print designs." };

  const db = await getDb();
  const businessId = gate.membership.businessId;

  const [existing] = await db
    .select({ id: printTemplates.id })
    .from(printTemplates)
    .where(and(eq(printTemplates.id, templateId), eq(printTemplates.businessId, businessId), eq(printTemplates.kind, kind)))
    .limit(1);
  if (!existing) return { ok: false, error: "That design no longer exists." };

  await db.transaction(async (tx) => {
    await tx
      .update(printTemplates)
      .set({ isDefault: false })
      .where(and(eq(printTemplates.businessId, businessId), eq(printTemplates.kind, kind)));
    await tx.update(printTemplates).set({ isDefault: true }).where(eq(printTemplates.id, templateId));
  });

  return { ok: true };
}

export async function deletePrintTemplate(templateId: string): Promise<ActionResult> {
  const gate = await requireTemplateGate();
  if (!gate) return { ok: false, error: "You don't have permission to change print designs." };

  const db = await getDb();
  await db
    .delete(printTemplates)
    .where(and(eq(printTemplates.id, templateId), eq(printTemplates.businessId, gate.membership.businessId)));
  return { ok: true };
}

/** The design the print screens fall back to when nothing has been saved yet. */
export async function getDefaultDesigns(): Promise<{ label: LabelDesign; invoice: InvoiceDesign }> {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership) throw new Error("NO_ACTIVE_BUSINESS");

  const [labels, invoices] = await Promise.all([
    loadTemplates(membership.businessId, "label"),
    loadTemplates(membership.businessId, "invoice"),
  ]);

  return {
    label: (labels.find((t) => t.isDefault)?.design as LabelDesign) ?? defaultLabelDesign(),
    invoice: (invoices.find((t) => t.isDefault)?.design as InvoiceDesign) ?? defaultInvoiceDesign(),
  };
}
