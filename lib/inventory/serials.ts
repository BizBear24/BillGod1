import "server-only";
import { eq, and, inArray } from "drizzle-orm";
import type { PostingTx } from "@/lib/accounting/posting";
import { serialMovements } from "@/db/schema";

/**
 * Serial number bookkeeping.
 *
 * A serial's state is derived, never stored: in-stock means its rows net to
 * one unit in. That keeps a unit that was sold, returned and sold again
 * honest, and means a cancelled document can be undone by appending the
 * opposite rows rather than editing history.
 */

/** Trimmed and upper-cased, so a scanner and a keyboard agree on the same unit. */
export function normaliseSerial(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * Splits the free text a user types or a scanner streams into serials.
 * Commas, semicolons, newlines and tabs all separate; blanks are dropped and
 * duplicates within the one entry are rejected by the caller.
 */
export function parseSerials(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\n\r\t]+/)
    .map(normaliseSerial)
    .filter((s) => s.length > 0);
}

export function findDuplicate(serials: string[]): string | null {
  const seen = new Set<string>();
  for (const serial of serials) {
    if (seen.has(serial)) return serial;
    seen.add(serial);
  }
  return null;
}

export type SerialLine = {
  productId: string;
  productName: string;
  quantity: number;
  serials: string[];
};

type SerialTx = PostingTx;

/**
 * Which of these serials are currently held, per product.
 * Returns a set of `productId serial` keys.
 */
async function heldSerials(tx: SerialTx, businessId: string, lines: SerialLine[]): Promise<Set<string>> {
  const allSerials = [...new Set(lines.flatMap((l) => l.serials))];
  const productIds = [...new Set(lines.map((l) => l.productId))];
  if (allSerials.length === 0 || productIds.length === 0) return new Set();

  const rows = await tx
    .select({ productId: serialMovements.productId, serial: serialMovements.serial, direction: serialMovements.direction })
    .from(serialMovements)
    .where(
      and(
        eq(serialMovements.businessId, businessId),
        inArray(serialMovements.productId, productIds),
        inArray(serialMovements.serial, allSerials)
      )
    );

  const net = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.productId} ${row.serial}`;
    net.set(key, (net.get(key) ?? 0) + (row.direction === "in" ? 1 : -1));
  }
  return new Set([...net.entries()].filter(([, count]) => count > 0).map(([key]) => key));
}

/**
 * Records serials moving in or out for one document, after checking that the
 * move makes sense: the count has to match the quantity, a unit cannot be
 * received while it is already in stock, and it cannot be sold if it isn't.
 *
 * Throws inside the caller's transaction, so a bad serial rolls the whole
 * document back rather than leaving a half-recorded one behind.
 */
export async function recordSerialMovements(
  tx: SerialTx,
  params: {
    businessId: string;
    warehouseId: string;
    direction: "in" | "out";
    referenceType: "sale" | "purchase" | "transfer" | "adjustment";
    referenceId: string;
    referenceLabel: string;
    userId: string;
    lines: SerialLine[];
  }
) {
  const lines = params.lines.filter((l) => l.serials.length > 0);
  if (lines.length === 0) return;

  for (const line of lines) {
    if (line.serials.length !== Math.round(line.quantity)) {
      throw new Error(`${line.productName}: ${line.serials.length} serial(s) given for ${line.quantity} unit(s).`);
    }
    const duplicate = findDuplicate(line.serials);
    if (duplicate) throw new Error(`${line.productName}: serial ${duplicate} is listed twice.`);
  }

  const held = await heldSerials(tx, params.businessId, lines);

  for (const line of lines) {
    for (const serial of line.serials) {
      const inStock = held.has(`${line.productId} ${serial}`);
      if (params.direction === "in" && inStock) {
        throw new Error(`${line.productName}: serial ${serial} is already in stock.`);
      }
      if (params.direction === "out" && !inStock) {
        throw new Error(`${line.productName}: serial ${serial} is not in stock.`);
      }
    }
  }

  await tx.insert(serialMovements).values(
    lines.flatMap((line) =>
      line.serials.map((serial) => ({
        businessId: params.businessId,
        productId: line.productId,
        warehouseId: params.warehouseId,
        serial,
        direction: params.direction,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        referenceLabel: params.referenceLabel,
        createdByUserId: params.userId,
      }))
    )
  );
}

/**
 * Undoes a document's serial movements by appending their mirror image, so a
 * cancelled purchase takes its units back off the shelf and a cancelled sale
 * puts them back on it.
 */
export async function reverseSerialMovements(
  tx: SerialTx,
  params: {
    businessId: string;
    referenceType: "sale" | "purchase" | "transfer" | "adjustment";
    referenceId: string;
    note: string;
    userId: string;
  }
) {
  const rows = await tx
    .select()
    .from(serialMovements)
    .where(
      and(
        eq(serialMovements.businessId, params.businessId),
        eq(serialMovements.referenceType, params.referenceType),
        eq(serialMovements.referenceId, params.referenceId)
      )
    );
  if (rows.length === 0) return;

  // Only the rows that still stand need reversing — a document reversed once
  // has an equal number of rows each way and nothing left to undo.
  const net = new Map<string, { row: (typeof rows)[number]; balance: number }>();
  for (const row of rows) {
    const key = `${row.productId} ${row.serial}`;
    const current = net.get(key) ?? { row, balance: 0 };
    current.balance += row.direction === "in" ? 1 : -1;
    net.set(key, current);
  }

  const reversals = [...net.values()].filter((entry) => entry.balance !== 0);
  if (reversals.length === 0) return;

  await tx.insert(serialMovements).values(
    reversals.map(({ row, balance }) => ({
      businessId: params.businessId,
      productId: row.productId,
      warehouseId: row.warehouseId,
      serial: row.serial,
      direction: (balance > 0 ? "out" : "in") as "in" | "out",
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      referenceLabel: row.referenceLabel,
      notes: params.note,
      createdByUserId: params.userId,
    }))
  );
}

/**
 * The serials currently in stock, per product — what the POS offers as a pick
 * list. Derived by netting the ledger, so it can't drift from what was
 * actually received and sold.
 */
export async function listSerialsInStock(businessId: string, productIds: string[]): Promise<Record<string, string[]>> {
  if (productIds.length === 0) return {};
  const { getDb } = await import("@/db/client");
  const db = await getDb();

  const rows = await db
    .select({
      productId: serialMovements.productId,
      serial: serialMovements.serial,
      direction: serialMovements.direction,
    })
    .from(serialMovements)
    .where(and(eq(serialMovements.businessId, businessId), inArray(serialMovements.productId, productIds)));

  const net = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const perProduct = net.get(row.productId) ?? new Map<string, number>();
    perProduct.set(row.serial, (perProduct.get(row.serial) ?? 0) + (row.direction === "in" ? 1 : -1));
    net.set(row.productId, perProduct);
  }

  const result: Record<string, string[]> = {};
  for (const productId of productIds) {
    const perProduct = net.get(productId);
    result[productId] = perProduct
      ? [...perProduct.entries()].filter(([, count]) => count > 0).map(([serial]) => serial).sort()
      : [];
  }
  return result;
}
