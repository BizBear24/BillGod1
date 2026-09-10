import "server-only";
import { eq, and, inArray, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { accounts, journalEntries, journalLines } from "@/db/schema";
import { round2 as roundMoney } from "@/lib/sales/totals";

/**
 * Drizzle hands each driver its own transaction class, but both extend
 * PgTransaction and expose the same query builder, so posting helpers accept
 * the base type and stay driver-agnostic.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PostingTx = PgTransaction<any, any, any>;

export type SystemAccountKey =
  | "cash"
  | "bank"
  | "accounts_receivable"
  | "accounts_payable"
  | "gst_payable"
  | "gst_input_credit"
  | "sales_revenue"
  | "sales_returns"
  | "purchases"
  | "purchase_returns"
  | "discount_allowed"
  | "discount_received"
  | "loyalty_redemption"
  | "opening_balance_equity";

type AccountGroup = "asset" | "liability" | "income" | "expense" | "equity";

export const SYSTEM_ACCOUNTS: { key: SystemAccountKey; name: string; group: AccountGroup }[] = [
  { key: "cash", name: "Cash", group: "asset" },
  { key: "bank", name: "Bank", group: "asset" },
  { key: "accounts_receivable", name: "Accounts Receivable", group: "asset" },
  { key: "gst_input_credit", name: "GST Input Credit", group: "asset" },
  { key: "accounts_payable", name: "Accounts Payable", group: "liability" },
  { key: "gst_payable", name: "GST Payable", group: "liability" },
  { key: "sales_revenue", name: "Sales Revenue", group: "income" },
  { key: "purchase_returns", name: "Purchase Returns", group: "income" },
  { key: "discount_received", name: "Discount Received", group: "income" },
  { key: "purchases", name: "Purchases", group: "expense" },
  { key: "sales_returns", name: "Sales Returns", group: "expense" },
  { key: "discount_allowed", name: "Discount Allowed", group: "expense" },
  { key: "loyalty_redemption", name: "Loyalty Redemption", group: "expense" },
  { key: "opening_balance_equity", name: "Opening Balance Equity", group: "equity" },
];

/**
 * Returns the business's system account ids, creating any that are missing.
 * Runs lazily on first posting so businesses created before the accounting
 * phase get their chart of accounts without a migration backfill.
 */
export async function ensureSystemAccounts(tx: PostingTx, businessId: string): Promise<Record<SystemAccountKey, string>> {
  await tx
    .insert(accounts)
    .values(SYSTEM_ACCOUNTS.map((a) => ({ businessId, name: a.name, group: a.group, isSystemAccount: true, systemKey: a.key })))
    .onConflictDoNothing();

  const existing = await tx
    .select({ id: accounts.id, name: accounts.name, systemKey: accounts.systemKey })
    .from(accounts)
    .where(eq(accounts.businessId, businessId));

  const byKey = new Map(existing.filter((a) => a.systemKey).map((a) => [a.systemKey as SystemAccountKey, a.id]));
  const byName = new Map(existing.map((a) => [a.name, a.id]));

  for (const spec of SYSTEM_ACCOUNTS) {
    if (byKey.has(spec.key)) continue;
    // The insert above was skipped because a user account already owns that
    // name — adopt it rather than creating a confusing duplicate.
    const sameName = byName.get(spec.name);
    if (!sameName) throw new Error(`Could not resolve the "${spec.name}" account.`);
    await tx.update(accounts).set({ systemKey: spec.key, isSystemAccount: true }).where(eq(accounts.id, sameName));
    byKey.set(spec.key, sameName);
  }

  return Object.fromEntries(byKey) as Record<SystemAccountKey, string>;
}

export type DraftLine = {
  accountId: string;
  debit?: number;
  credit?: number;
  customerId?: string | null;
  supplierId?: string | null;
  notes?: string | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Writes one balanced journal entry. Rejects unbalanced input rather than
 * persisting books that silently don't add up.
 */
export async function writeJournalEntry(
  tx: PostingTx,
  params: {
    businessId: string;
    userId: string;
    narration: string;
    referenceType: "sale" | "purchase" | "manual" | "opening";
    referenceId?: string | null;
    entryDate?: Date;
    lines: DraftLine[];
  }
): Promise<{ id: string; entryNumber: string }> {
  const lines = params.lines
    .map((l) => ({ ...l, debit: round2(l.debit ?? 0), credit: round2(l.credit ?? 0) }))
    .filter((l) => l.debit !== 0 || l.credit !== 0);

  if (lines.length < 2) throw new Error("A journal entry needs at least two lines.");

  const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
  if (Math.abs(totalDebit - totalCredit) > 0.009) {
    throw new Error(`Journal entry is unbalanced: debits ₹${totalDebit.toFixed(2)} vs credits ₹${totalCredit.toFixed(2)}.`);
  }

  const [{ count }] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(journalEntries)
    .where(eq(journalEntries.businessId, params.businessId));
  const entryNumber = `JV-${String(count + 1).padStart(6, "0")}`;

  const [entry] = await tx
    .insert(journalEntries)
    .values({
      businessId: params.businessId,
      entryNumber,
      entryDate: params.entryDate ?? new Date(),
      narration: params.narration,
      referenceType: params.referenceType,
      referenceId: params.referenceId ?? null,
      createdByUserId: params.userId,
    })
    .returning();

  await tx.insert(journalLines).values(
    lines.map((l) => ({
      entryId: entry.id,
      accountId: l.accountId,
      debit: String(l.debit),
      credit: String(l.credit),
      customerId: l.customerId ?? null,
      supplierId: l.supplierId ?? null,
      notes: l.notes ?? null,
    }))
  );

  return { id: entry.id, entryNumber };
}

type PaymentSplit = { cash: number; bank: number; credit: number };

/** Cash stays cash; UPI and card land in the bank; "credit" is not money received. */
export function splitPayments(payments: { method: "cash" | "upi" | "card" | "credit"; amount: number }[]): PaymentSplit {
  const split: PaymentSplit = { cash: 0, bank: 0, credit: 0 };
  for (const p of payments) {
    if (p.method === "cash") split.cash += p.amount;
    else if (p.method === "upi" || p.method === "card") split.bank += p.amount;
    else split.credit += p.amount;
  }
  return { cash: round2(split.cash), bank: round2(split.bank), credit: round2(split.credit) };
}

/** Pushes a line on whichever side the signed amount calls for. */
function signed(lines: DraftLine[], accountId: string, amount: number, side: "debit" | "credit", extra: Partial<DraftLine> = {}) {
  const value = round2(amount);
  if (value === 0) return;
  const flipped = value < 0;
  const magnitude = Math.abs(value);
  const effective = flipped ? (side === "debit" ? "credit" : "debit") : side;
  lines.push({ accountId, [effective]: magnitude, ...extra } as DraftLine);
}

export async function postSaleJournal(
  tx: PostingTx,
  params: {
    businessId: string;
    userId: string;
    saleId: string;
    docType: "sale" | "sale_return";
    docNumber: string;
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    totalAmount: number;
    customerId: string | null;
    redeemedValue?: number;
    payments: { method: "cash" | "upi" | "card" | "credit"; amount: number }[];
  }
) {
  const acc = await ensureSystemAccounts(tx, params.businessId);
  const { cash, bank } = splitPayments(params.payments);
  const redeemed = round2(params.redeemedValue ?? 0);
  // Anything not settled in cash, bank or loyalty points is owed by the
  // customer, whether it was tagged "credit" or simply left unpaid.
  const receivable = round2(params.totalAmount - cash - bank - redeemed);
  const isReturn = params.docType === "sale_return";

  const lines: DraftLine[] = [];
  const money: "debit" | "credit" = isReturn ? "credit" : "debit";
  const revenue: "debit" | "credit" = isReturn ? "debit" : "credit";

  signed(lines, acc.cash, cash, money);
  signed(lines, acc.bank, bank, money);
  signed(lines, acc.loyalty_redemption, redeemed, money);
  signed(lines, acc.accounts_receivable, receivable, money, { customerId: params.customerId ?? null });
  signed(lines, acc.discount_allowed, params.discountAmount, money);
  signed(lines, isReturn ? acc.sales_returns : acc.sales_revenue, params.subtotal, revenue);
  signed(lines, acc.gst_payable, params.taxAmount, revenue);

  return writeJournalEntry(tx, {
    businessId: params.businessId,
    userId: params.userId,
    narration: `${isReturn ? "Sale return" : "Sale"} ${params.docNumber}`,
    referenceType: "sale",
    referenceId: params.saleId,
    lines,
  });
}

export async function postPurchaseJournal(
  tx: PostingTx,
  params: {
    businessId: string;
    userId: string;
    purchaseId: string;
    docType: "purchase" | "purchase_return";
    docNumber: string;
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    totalAmount: number;
    supplierId: string;
    payments: { method: "cash" | "upi" | "card" | "credit"; amount: number }[];
  }
) {
  const acc = await ensureSystemAccounts(tx, params.businessId);
  const { cash, bank } = splitPayments(params.payments);
  const payable = round2(params.totalAmount - cash - bank);
  const isReturn = params.docType === "purchase_return";

  const lines: DraftLine[] = [];
  const money: "debit" | "credit" = isReturn ? "debit" : "credit";
  const cost: "debit" | "credit" = isReturn ? "credit" : "debit";

  signed(lines, isReturn ? acc.purchase_returns : acc.purchases, params.subtotal, cost);
  signed(lines, acc.gst_input_credit, params.taxAmount, cost);
  signed(lines, acc.discount_received, params.discountAmount, money);
  signed(lines, acc.cash, cash, money);
  signed(lines, acc.bank, bank, money);
  signed(lines, acc.accounts_payable, payable, money, { supplierId: params.supplierId });

  return writeJournalEntry(tx, {
    businessId: params.businessId,
    userId: params.userId,
    narration: `${isReturn ? "Purchase return" : "Purchase"} ${params.docNumber}`,
    referenceType: "purchase",
    referenceId: params.purchaseId,
    lines,
  });
}

/**
 * Undoes a document's books by posting a mirror image of whatever it actually
 * posted — every debit becomes a credit and back — rather than recomputing
 * the entry from the document. If the original was posted under different
 * rules or rounding, the reversal still cancels it to the paisa.
 *
 * Returns the number of entries reversed; zero means the document never
 * reached the books, which is not an error (a quotation, say).
 */
export async function reverseJournalFor(
  tx: PostingTx,
  params: {
    businessId: string;
    userId: string;
    referenceType: "sale" | "purchase";
    referenceId: string;
    narration: string;
  }
): Promise<number> {
  const originals = await tx
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.businessId, params.businessId),
        eq(journalEntries.referenceType, params.referenceType),
        eq(journalEntries.referenceId, params.referenceId)
      )
    );
  if (originals.length === 0) return 0;

  const lines = await tx
    .select()
    .from(journalLines)
    .where(
      inArray(
        journalLines.entryId,
        originals.map((e) => e.id)
      )
    );

  const mirrored: DraftLine[] = lines.map((l) => ({
    accountId: l.accountId,
    debit: roundMoney(parseFloat(l.credit)),
    credit: roundMoney(parseFloat(l.debit)),
    customerId: l.customerId,
    supplierId: l.supplierId,
    notes: l.notes,
  }));

  await writeJournalEntry(tx, {
    businessId: params.businessId,
    userId: params.userId,
    narration: params.narration,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    lines: mirrored,
  });

  return originals.length;
}
