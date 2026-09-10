import { getAccountingPageData, getPartyLedgers, getAccountLedger } from "@/app/actions/accounting";
import { AccountingManager } from "@/components/app/accounting-manager";

export default async function AccountingPage() {
  const [data, parties] = await Promise.all([getAccountingPageData(), getPartyLedgers()]);

  // Cash book is the ledger people open first — render it with the page.
  const defaultAccount = data.balances.find((b) => b.systemKey === "cash") ?? data.balances[0];
  const initialLedger = defaultAccount ? await getAccountLedger(defaultAccount.id) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Accounting</h1>
        <p className="text-muted-foreground">Double-entry books that post themselves from your bills and purchases.</p>
      </div>
      <AccountingManager
        balances={data.balances}
        entries={data.entries}
        lines={data.lines}
        trialBalance={data.trialBalance}
        profitAndLoss={data.profitAndLoss}
        balanceSheet={data.balanceSheet}
        receivables={parties.receivables}
        payables={parties.payables}
        initialLedger={initialLedger}
        canManage={data.canManage}
      />
    </div>
  );
}
