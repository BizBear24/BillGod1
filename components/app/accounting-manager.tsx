"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookOpen, NotebookPen, Scale, Users, Plus, Trash2 } from "lucide-react";
import { createAccount, updateAccount, deleteAccount, createManualEntry, getAccountLedger, initialiseChartOfAccounts } from "@/app/actions/accounting";
import { ACCOUNT_GROUPS, ACCOUNT_GROUP_LABELS } from "@/lib/validation/accounting";
import { EntityCrudManager } from "@/components/app/entity-crud-manager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, formatDateTime } from "@/lib/utils";

type Balance = {
  id: string;
  name: string;
  group: string;
  systemKey: string | null;
  isSystemAccount: boolean;
  openingBalance: string;
  debit: number;
  credit: number;
  netDebit: number;
};
type Entry = { id: string; entryNumber: string; entryDate: Date; narration: string; referenceType: string };
type Line = { id: string; entryId: string; accountId: string; debit: string; credit: string; accountName: string };
type PartyRow = { party: { id: string; name: string; phone: string | null }; outstanding: number };
type LedgerData = Awaited<ReturnType<typeof getAccountLedger>>;

/** Keeps the sign — a negative asset really is an overdrawn balance, not a positive one. */
const money = (n: number) => `${n < 0 ? "-" : ""}₹${Math.abs(n).toFixed(2)}`;
/** For columns where a Debit/Credit heading or a "Cr" suffix already carries the sign. */
const moneyAbs = (n: number) => `₹${Math.abs(n).toFixed(2)}`;

export function AccountingManager({
  balances,
  entries,
  lines,
  trialBalance,
  profitAndLoss,
  balanceSheet,
  receivables,
  payables,
  initialLedger,
  canManage,
}: {
  balances: Balance[];
  entries: Entry[];
  lines: Line[];
  trialBalance: { rows: Balance[]; totalDebit: number; totalCredit: number };
  profitAndLoss: { income: Balance[]; expense: Balance[]; totalIncome: number; totalExpense: number; netProfit: number };
  balanceSheet: {
    assets: Balance[];
    liabilities: Balance[];
    equity: Balance[];
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    netProfit: number;
  };
  receivables: PartyRow[];
  payables: PartyRow[];
  initialLedger: LedgerData;
  canManage: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState("accounts");

  const linesByEntry = React.useMemo(() => {
    const map = new Map<string, Line[]>();
    for (const line of lines) {
      const list = map.get(line.entryId) ?? [];
      list.push(line);
      map.set(line.entryId, list);
    }
    return map;
  }, [lines]);

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-4">
      <TabsList>
        <TabsTrigger value="accounts">
          <BookOpen className="h-4 w-4" />
          Chart of Accounts
        </TabsTrigger>
        <TabsTrigger value="journal">
          <NotebookPen className="h-4 w-4" />
          Journal
        </TabsTrigger>
        <TabsTrigger value="ledgers">
          <Users className="h-4 w-4" />
          Ledgers
        </TabsTrigger>
        <TabsTrigger value="financials">
          <Scale className="h-4 w-4" />
          Financials
        </TabsTrigger>
      </TabsList>

      <TabsContent value="accounts" className="space-y-4">
        {balances.length === 0 && canManage && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm text-muted-foreground">No accounts yet. Start from the standard Indian retail chart of accounts.</p>
              <Button
                onClick={async () => {
                  const result = await initialiseChartOfAccounts();
                  if (!result.ok) toast.error(result.error);
                  else {
                    toast.success("Chart of accounts created");
                    router.refresh();
                  }
                }}
              >
                Set up chart of accounts
              </Button>
            </CardContent>
          </Card>
        )}
        <EntityCrudManager
          title="Accounts"
          kind="account"
          itemLabel="Account"
          description="Balances are derived from the journal — they update themselves as you bill and buy."
          items={balances}
          columns={[
            { key: "name", label: "Account" },
            { key: "group", label: "Group", format: "lookup", lookup: ACCOUNT_GROUP_LABELS },
            { key: "debit", label: "Total Debit", format: "currency" },
            { key: "credit", label: "Total Credit", format: "currency" },
            { key: "netDebit", label: "Balance", format: "currency" },
          ]}
          fields={[
            { name: "name", label: "Account Name", type: "text" },
            { name: "group", label: "Group", type: "select", options: ACCOUNT_GROUPS.map((g) => ({ value: g, label: ACCOUNT_GROUP_LABELS[g] })) },
            { name: "openingBalance", label: "Opening Balance", type: "text", placeholder: "0.00" },
          ]}
          defaultValues={{ name: "", group: "asset", openingBalance: "0" }}
          createAction={createAccount}
          updateAction={updateAccount}
          deleteAction={deleteAccount}
          canManage={canManage}
          emptyLabel="No accounts yet."
        />
      </TabsContent>

      <TabsContent value="journal" className="space-y-4">
        {canManage && <ManualEntryForm accounts={balances} />}
        <Card>
          <CardContent className="space-y-3 py-4">
            <p className="text-sm font-semibold">Journal</p>
            {entries.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No entries yet. Completing a sale or purchase posts one automatically.</p>
            ) : (
              <div className="space-y-3">
                {entries.map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-border">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{entry.entryNumber}</span>
                        <Badge variant="secondary">{entry.referenceType}</Badge>
                        <span className="text-sm text-muted-foreground">{entry.narration}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{formatDateTime(entry.entryDate)}</span>
                    </div>
                    <Table>
                      <TableBody>
                        {(linesByEntry.get(entry.id) ?? []).map((line) => (
                          <TableRow key={line.id}>
                            <TableCell className="w-1/2">{line.accountName}</TableCell>
                            <TableCell className="text-right">{parseFloat(line.debit) > 0 ? moneyAbs(parseFloat(line.debit)) : ""}</TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {parseFloat(line.credit) > 0 ? moneyAbs(parseFloat(line.credit)) : ""}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="ledgers" className="space-y-4">
        <AccountLedgerViewer accounts={balances} initialLedger={initialLedger} />
        <div className="grid gap-4 lg:grid-cols-2">
          <PartyTable title="Receivables (customers owe you)" rows={receivables} emptyLabel="Nothing outstanding from customers." />
          <PartyTable title="Payables (you owe suppliers)" rows={payables} emptyLabel="Nothing outstanding to suppliers." />
        </div>
      </TabsContent>

      <TabsContent value="financials" className="space-y-4">
        <Card>
          <CardContent className="space-y-3 py-4">
            <p className="text-sm font-semibold">Trial Balance</p>
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trialBalance.rows
                    .filter((r) => Math.abs(r.netDebit) >= 0.01)
                    .map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.name}</TableCell>
                        <TableCell className="text-right">{r.netDebit > 0 ? moneyAbs(r.netDebit) : ""}</TableCell>
                        <TableCell className="text-right">{r.netDebit < 0 ? moneyAbs(r.netDebit) : ""}</TableCell>
                      </TableRow>
                    ))}
                  <TableRow>
                    <TableCell className="font-semibold">Total</TableCell>
                    <TableCell className="text-right font-semibold">{moneyAbs(trialBalance.totalDebit)}</TableCell>
                    <TableCell className="text-right font-semibold">{moneyAbs(trialBalance.totalCredit)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            {Math.abs(trialBalance.totalDebit - trialBalance.totalCredit) >= 0.01 && (
              <p className="text-sm text-destructive">The books don&apos;t balance — check for a manual entry posted against the wrong account.</p>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-3 py-4">
              <p className="text-sm font-semibold">Profit &amp; Loss</p>
              <StatementTable
                sections={[
                  { label: "Income", rows: profitAndLoss.income.map((a) => ({ name: a.name, amount: -a.netDebit })), total: profitAndLoss.totalIncome },
                  { label: "Expenses", rows: profitAndLoss.expense.map((a) => ({ name: a.name, amount: a.netDebit })), total: profitAndLoss.totalExpense },
                ]}
                footerLabel={profitAndLoss.netProfit >= 0 ? "Net Profit" : "Net Loss"}
                footerValue={profitAndLoss.netProfit}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 py-4">
              <p className="text-sm font-semibold">Balance Sheet</p>
              <StatementTable
                sections={[
                  { label: "Assets", rows: balanceSheet.assets.map((a) => ({ name: a.name, amount: a.netDebit })), total: balanceSheet.totalAssets },
                  {
                    label: "Liabilities",
                    rows: balanceSheet.liabilities.map((a) => ({ name: a.name, amount: -a.netDebit })),
                    total: balanceSheet.totalLiabilities,
                  },
                  {
                    label: "Equity",
                    rows: [
                      ...balanceSheet.equity.map((a) => ({ name: a.name, amount: -a.netDebit })),
                      { name: "Retained earnings (this period)", amount: balanceSheet.netProfit },
                    ],
                    total: balanceSheet.totalEquity,
                  },
                ]}
                footerLabel="Liabilities + Equity"
                footerValue={balanceSheet.totalLiabilities + balanceSheet.totalEquity}
              />
            </CardContent>
          </Card>
        </div>
      </TabsContent>
    </Tabs>
  );
}

function StatementTable({
  sections,
  footerLabel,
  footerValue,
}: {
  sections: { label: string; rows: { name: string; amount: number }[]; total: number }[];
  footerLabel: string;
  footerValue: number;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableBody>
          {sections.map((section) => (
            <React.Fragment key={section.label}>
              <TableRow>
                <TableCell className="font-semibold">{section.label}</TableCell>
                <TableCell />
              </TableRow>
              {section.rows
                .filter((r) => Math.abs(r.amount) >= 0.01)
                .map((r) => (
                  <TableRow key={`${section.label}-${r.name}`}>
                    <TableCell className="pl-6 text-muted-foreground">{r.name}</TableCell>
                    <TableCell className="text-right">{money(r.amount)}</TableCell>
                  </TableRow>
                ))}
              <TableRow>
                <TableCell className="pl-6 font-medium">Total {section.label}</TableCell>
                <TableCell className="text-right font-medium">{money(section.total)}</TableCell>
              </TableRow>
            </React.Fragment>
          ))}
          <TableRow>
            <TableCell className="font-semibold">{footerLabel}</TableCell>
            <TableCell className="text-right font-semibold">{money(footerValue)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

function PartyTable({ title, rows, emptyLabel }: { title: string; rows: PartyRow[]; emptyLabel: string }) {
  const total = rows.reduce((s, r) => s + r.outstanding, 0);
  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <p className="text-sm font-semibold">{title}</p>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.party.id}>
                    <TableCell>
                      {r.party.name}
                      {r.party.phone ? <span className="ml-2 text-xs text-muted-foreground">{r.party.phone}</span> : null}
                    </TableCell>
                    <TableCell className={`text-right ${r.outstanding < 0 ? "text-muted-foreground" : ""}`}>
                      {r.outstanding < 0 ? `${moneyAbs(r.outstanding)} advance` : moneyAbs(r.outstanding)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-semibold">Total</TableCell>
                  <TableCell className="text-right font-semibold">{money(total)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AccountLedgerViewer({ accounts, initialLedger }: { accounts: Balance[]; initialLedger: LedgerData }) {
  const [accountId, setAccountId] = React.useState(initialLedger?.account.id ?? accounts[0]?.id ?? "");
  // The default account's ledger comes rendered from the server; switching accounts fetches.
  const [data, setData] = React.useState<LedgerData>(initialLedger);
  const [loading, setLoading] = React.useState(false);

  const accountItems = React.useMemo(() => accounts.map((a) => ({ value: a.id, label: a.name })), [accounts]);

  async function selectAccount(id: string) {
    setAccountId(id);
    if (!id) return;
    setLoading(true);
    try {
      setData(await getAccountLedger(id));
    } catch {
      toast.error("Could not load that ledger.");
    } finally {
      setLoading(false);
    }
  }

  if (accounts.length === 0) return null;

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">Account Ledger</p>
          <div className="w-64">
            <Select items={accountItems} value={accountId} onValueChange={(v) => void selectAccount(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select an account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : !data || data.ledger.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No postings against this account yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead>Narration</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.ledger.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{formatDate(row.entryDate)}</TableCell>
                    <TableCell>{row.entryNumber}</TableCell>
                    <TableCell className="text-muted-foreground">{row.narration}</TableCell>
                    <TableCell className="text-right">{parseFloat(row.debit) > 0 ? moneyAbs(parseFloat(row.debit)) : ""}</TableCell>
                    <TableCell className="text-right">{parseFloat(row.credit) > 0 ? moneyAbs(parseFloat(row.credit)) : ""}</TableCell>
                    <TableCell className="text-right font-medium">
                      {moneyAbs(row.balance)} {row.balance < 0 ? "Cr" : "Dr"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type DraftLine = { accountId: string; debit: string; credit: string };

function ManualEntryForm({ accounts }: { accounts: Balance[] }) {
  const router = useRouter();
  const [narration, setNarration] = React.useState("");
  const [lines, setLines] = React.useState<DraftLine[]>([
    { accountId: "", debit: "", credit: "" },
    { accountId: "", debit: "", credit: "" },
  ]);
  const [saving, setSaving] = React.useState(false);

  const accountItems = React.useMemo(() => accounts.map((a) => ({ value: a.id, label: a.name })), [accounts]);
  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  function patch(index: number, next: Partial<DraftLine>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...next } : l)));
  }

  async function handleSave() {
    setSaving(true);
    const result = await createManualEntry({
      narration,
      lines: lines
        .filter((l) => l.accountId && (parseFloat(l.debit) || parseFloat(l.credit)))
        .map((l) => ({ accountId: l.accountId, debit: parseFloat(l.debit) || 0, credit: parseFloat(l.credit) || 0 })),
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Entry ${result.entryNumber} posted`);
    setNarration("");
    setLines([
      { accountId: "", debit: "", credit: "" },
      { accountId: "", debit: "", credit: "" },
    ]);
    router.refresh();
  }

  if (accounts.length === 0) return null;

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <p className="text-sm font-semibold">New Journal Entry</p>
        <Input value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="Narration — what is this entry for?" />
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="w-32">Debit</TableHead>
                <TableHead className="w-32">Credit</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Select items={accountItems} value={line.accountId} onValueChange={(v) => patch(i, { accountId: v ?? "" })}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="any"
                      value={line.debit}
                      onChange={(e) => patch(i, { debit: e.target.value, credit: e.target.value ? "" : line.credit })}
                      placeholder="0.00"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="any"
                      value={line.credit}
                      onChange={(e) => patch(i, { credit: e.target.value, debit: e.target.value ? "" : line.debit })}
                      placeholder="0.00"
                    />
                  </TableCell>
                  <TableCell>
                    {lines.length > 2 && (
                      <Button variant="ghost" size="icon" aria-label="Remove line" onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-medium">Total</TableCell>
                <TableCell className="font-medium">{moneyAbs(totalDebit)}</TableCell>
                <TableCell className="font-medium">{moneyAbs(totalCredit)}</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between">
          <Button variant="secondary" size="sm" onClick={() => setLines((prev) => [...prev, { accountId: "", debit: "", credit: "" }])}>
            <Plus className="h-3.5 w-3.5" />
            Add line
          </Button>
          <div className="flex items-center gap-3">
            {!balanced && totalDebit + totalCredit > 0 && <span className="text-xs text-destructive">Debits must equal credits</span>}
            <Button disabled={saving || !balanced || !narration.trim()} onClick={handleSave}>
              {saving ? "Posting…" : "Post Entry"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
