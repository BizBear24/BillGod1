"use server";

import { eq, and, desc, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { accounts, journalEntries, journalLines, customers, suppliers } from "@/db/schema";
import { requireSessionUser, getActiveMembership } from "@/lib/auth/session";
import { can, PERMISSIONS } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/audit";
import { ensureSystemAccounts, writeJournalEntry } from "@/lib/accounting/posting";
import { accountSchema, manualJournalSchema } from "@/lib/validation/accounting";
import type { ActionResult } from "./auth";

async function requireAccountingGate(permission: (typeof PERMISSIONS)[keyof typeof PERMISSIONS]) {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership) throw new Error("NO_ACTIVE_BUSINESS");
  if (!can(membership.role, permission)) {
    return { ok: false as const, error: "You don't have permission to do that." };
  }
  return { ok: true as const, sessionUser, membership };
}

async function requireView() {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.ACCOUNTS_VIEW)) throw new Error("FORBIDDEN");
  return { sessionUser, membership };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Opening balances are entered as positive numbers; this puts them on the side the group implies. */
function openingAsDebit(group: string, openingBalance: string) {
  const value = parseFloat(openingBalance) || 0;
  return group === "asset" || group === "expense" ? value : -value;
}

/**
 * One pass over the ledger, reused by the trial balance, P&L and balance
 * sheet so the three statements can never disagree with each other.
 */
async function computeAccountBalances(businessId: string) {
  const db = await getDb();
  const accountRows = await db.select().from(accounts).where(eq(accounts.businessId, businessId));
  const accountIds = accountRows.map((a) => a.id);

  const lineRows = accountIds.length
    ? await db
        .select({ accountId: journalLines.accountId, debit: journalLines.debit, credit: journalLines.credit })
        .from(journalLines)
        .where(inArray(journalLines.accountId, accountIds))
    : [];

  const movement = new Map<string, { debit: number; credit: number }>();
  for (const line of lineRows) {
    const current = movement.get(line.accountId) ?? { debit: 0, credit: 0 };
    current.debit += parseFloat(line.debit);
    current.credit += parseFloat(line.credit);
    movement.set(line.accountId, current);
  }

  return accountRows
    .map((account) => {
      const m = movement.get(account.id) ?? { debit: 0, credit: 0 };
      const opening = openingAsDebit(account.group, account.openingBalance);
      return {
        id: account.id,
        name: account.name,
        group: account.group,
        systemKey: account.systemKey,
        isSystemAccount: account.isSystemAccount,
        openingBalance: account.openingBalance,
        debit: round2(m.debit),
        credit: round2(m.credit),
        /** Positive means a net debit balance, negative a net credit balance. */
        netDebit: round2(opening + m.debit - m.credit),
      };
    })
    .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
}

export type AccountBalance = Awaited<ReturnType<typeof computeAccountBalances>>[number];

export async function getAccountingPageData() {
  const { membership } = await requireView();
  const db = await getDb();
  const businessId = membership.businessId;

  const balances = await computeAccountBalances(businessId);

  const entries = await db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.businessId, businessId))
    .orderBy(desc(journalEntries.createdAt))
    .limit(100);

  const entryIds = entries.map((e) => e.id);
  const lines = entryIds.length
    ? await db
        .select({
          id: journalLines.id,
          entryId: journalLines.entryId,
          accountId: journalLines.accountId,
          debit: journalLines.debit,
          credit: journalLines.credit,
          accountName: accounts.name,
        })
        .from(journalLines)
        .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
        .where(inArray(journalLines.entryId, entryIds))
    : [];

  const income = balances.filter((b) => b.group === "income");
  const expense = balances.filter((b) => b.group === "expense");
  const totalIncome = round2(income.reduce((s, a) => s - a.netDebit, 0));
  const totalExpense = round2(expense.reduce((s, a) => s + a.netDebit, 0));
  const netProfit = round2(totalIncome - totalExpense);

  const assets = balances.filter((b) => b.group === "asset");
  const liabilities = balances.filter((b) => b.group === "liability");
  const equity = balances.filter((b) => b.group === "equity");
  const totalAssets = round2(assets.reduce((s, a) => s + a.netDebit, 0));
  const totalLiabilities = round2(liabilities.reduce((s, a) => s - a.netDebit, 0));
  const totalEquity = round2(equity.reduce((s, a) => s - a.netDebit, 0) + netProfit);

  return {
    balances,
    entries,
    lines,
    profitAndLoss: { income, expense, totalIncome, totalExpense, netProfit },
    balanceSheet: { assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity, netProfit },
    trialBalance: {
      rows: balances,
      totalDebit: round2(balances.reduce((s, a) => s + Math.max(a.netDebit, 0), 0)),
      totalCredit: round2(balances.reduce((s, a) => s + Math.max(-a.netDebit, 0), 0)),
    },
    canManage: can(membership.role, PERMISSIONS.ACCOUNTS_MANAGE),
  };
}

/** Every posting that touched one account, oldest first, with a running balance — the cash book / bank book view. */
export async function getAccountLedger(accountId: string) {
  const { membership } = await requireView();
  const db = await getDb();

  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.businessId, membership.businessId)))
    .limit(1);
  if (!account) return null;

  const rows = await db
    .select({
      id: journalLines.id,
      debit: journalLines.debit,
      credit: journalLines.credit,
      entryNumber: journalEntries.entryNumber,
      entryDate: journalEntries.entryDate,
      narration: journalEntries.narration,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
    .where(eq(journalLines.accountId, accountId))
    .orderBy(journalEntries.entryDate);

  let running = openingAsDebit(account.group, account.openingBalance);
  const ledger = rows.map((r) => {
    running = round2(running + parseFloat(r.debit) - parseFloat(r.credit));
    return { ...r, balance: running };
  });

  return { account, openingBalance: openingAsDebit(account.group, account.openingBalance), ledger, closingBalance: running };
}

/** Outstanding per customer and per supplier, straight off the receivable/payable ledger lines. */
export async function getPartyLedgers() {
  const { membership } = await requireView();
  const db = await getDb();
  const businessId = membership.businessId;

  const [customerRows, supplierRows, lines] = await Promise.all([
    db.select({ id: customers.id, name: customers.name, phone: customers.phone }).from(customers).where(eq(customers.businessId, businessId)),
    db.select({ id: suppliers.id, name: suppliers.name, phone: suppliers.phone }).from(suppliers).where(eq(suppliers.businessId, businessId)),
    db
      .select({
        customerId: journalLines.customerId,
        supplierId: journalLines.supplierId,
        debit: journalLines.debit,
        credit: journalLines.credit,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .where(eq(journalEntries.businessId, businessId)),
  ]);

  const byCustomer = new Map<string, number>();
  const bySupplier = new Map<string, number>();
  for (const line of lines) {
    const net = parseFloat(line.debit) - parseFloat(line.credit);
    if (line.customerId) byCustomer.set(line.customerId, (byCustomer.get(line.customerId) ?? 0) + net);
    // A payable is a credit balance, so flip the sign to read as "we owe".
    if (line.supplierId) bySupplier.set(line.supplierId, (bySupplier.get(line.supplierId) ?? 0) - net);
  }

  return {
    receivables: customerRows
      .map((c) => ({ party: c, outstanding: round2(byCustomer.get(c.id) ?? 0) }))
      .filter((r) => Math.abs(r.outstanding) >= 0.01)
      .sort((a, b) => b.outstanding - a.outstanding),
    payables: supplierRows
      .map((s) => ({ party: s, outstanding: round2(bySupplier.get(s.id) ?? 0) }))
      .filter((r) => Math.abs(r.outstanding) >= 0.01)
      .sort((a, b) => b.outstanding - a.outstanding),
  };
}

export async function createAccount(input: unknown): Promise<ActionResult> {
  const gate = await requireAccountingGate(PERMISSIONS.ACCOUNTS_MANAGE);
  if (!gate.ok) return gate;
  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const db = await getDb();
  try {
    const [row] = await db
      .insert(accounts)
      .values({
        businessId: gate.membership.businessId,
        name: parsed.data.name,
        group: parsed.data.group,
        openingBalance: String(parsed.data.openingBalance ?? 0),
      })
      .returning();
    await logAudit({
      businessId: gate.membership.businessId,
      userId: gate.sessionUser.userId,
      action: "account.created",
      entityType: "account",
      entityId: row.id,
      after: parsed.data,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && err.message.includes("unique")) return { ok: false, error: "An account with this name already exists." };
    throw err;
  }
}

export async function updateAccount(id: string, input: unknown): Promise<ActionResult> {
  const gate = await requireAccountingGate(PERMISSIONS.ACCOUNTS_MANAGE);
  if (!gate.ok) return gate;
  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const db = await getDb();
  const [existing] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.businessId, gate.membership.businessId)))
    .limit(1);
  if (!existing) return { ok: false, error: "Account not found." };
  // Renaming a system account is fine — postings resolve it by systemKey — but
  // moving it to another group would corrupt the statements it feeds.
  if (existing.systemKey && existing.group !== parsed.data.group) {
    return { ok: false, error: "A built-in account can't change its group." };
  }

  await db
    .update(accounts)
    .set({ name: parsed.data.name, group: parsed.data.group, openingBalance: String(parsed.data.openingBalance ?? 0) })
    .where(eq(accounts.id, id));
  await logAudit({
    businessId: gate.membership.businessId,
    userId: gate.sessionUser.userId,
    action: "account.updated",
    entityType: "account",
    entityId: id,
    after: parsed.data,
  });
  return { ok: true };
}

export async function deleteAccount(id: string): Promise<ActionResult> {
  const gate = await requireAccountingGate(PERMISSIONS.ACCOUNTS_MANAGE);
  if (!gate.ok) return gate;
  const db = await getDb();

  const [existing] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.businessId, gate.membership.businessId)))
    .limit(1);
  if (!existing) return { ok: false, error: "Account not found." };
  if (existing.isSystemAccount) return { ok: false, error: "Built-in accounts can't be deleted." };

  const [used] = await db.select({ id: journalLines.id }).from(journalLines).where(eq(journalLines.accountId, id)).limit(1);
  if (used) return { ok: false, error: "This account already has postings and can't be deleted." };

  await db.delete(accounts).where(eq(accounts.id, id));
  await logAudit({
    businessId: gate.membership.businessId,
    userId: gate.sessionUser.userId,
    action: "account.deleted",
    entityType: "account",
    entityId: id,
  });
  return { ok: true };
}

export async function createManualEntry(input: unknown): Promise<ActionResult & { entryNumber?: string }> {
  const gate = await requireAccountingGate(PERMISSIONS.ACCOUNTS_MANAGE);
  if (!gate.ok) return gate;
  const parsed = manualJournalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const db = await getDb();
  const businessId = gate.membership.businessId;

  const ownAccounts = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.businessId, businessId));
  const ownIds = new Set(ownAccounts.map((a) => a.id));
  if (parsed.data.lines.some((l) => !ownIds.has(l.accountId))) {
    return { ok: false, error: "Account not found." };
  }

  try {
    const result = await db.transaction(async (tx) =>
      writeJournalEntry(tx, {
        businessId,
        userId: gate.sessionUser.userId,
        narration: parsed.data.narration,
        referenceType: "manual",
        lines: parsed.data.lines.map((l) => ({ accountId: l.accountId, debit: l.debit ?? 0, credit: l.credit ?? 0 })),
      })
    );
    await logAudit({
      businessId,
      userId: gate.sessionUser.userId,
      action: "journal_entry.created",
      entityType: "journal_entry",
      entityId: result.id,
      after: { entryNumber: result.entryNumber, narration: parsed.data.narration },
    });
    return { ok: true, entryNumber: result.entryNumber };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save the entry." };
  }
}

/** Creates the standard chart of accounts on demand, for businesses that predate the accounting phase. */
export async function initialiseChartOfAccounts(): Promise<ActionResult> {
  const gate = await requireAccountingGate(PERMISSIONS.ACCOUNTS_MANAGE);
  if (!gate.ok) return gate;
  const db = await getDb();
  try {
    await db.transaction(async (tx) => ensureSystemAccounts(tx, gate.membership.businessId));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not set up the chart of accounts." };
  }
}
