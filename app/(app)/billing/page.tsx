import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { companies } from "@/db/schema";
import { requireSessionUser, getActiveMembership } from "@/lib/auth/session";
import { getBillingPageData, listReturnableSales } from "@/app/actions/sales";
import { getDefaultDesigns } from "@/app/actions/print-templates";
import { BillingPos } from "@/components/app/billing-pos";

export default async function BillingPage() {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  const db = await getDb();
  const companyRows = membership
    ? await db.select().from(companies).where(eq(companies.businessId, membership.businessId)).limit(1)
    : [];

  const [data, returnableSales, defaults] = await Promise.all([getBillingPageData(), listReturnableSales(), getDefaultDesigns()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Billing / Sales</h1>
        <p className="text-muted-foreground">Fast checkout for sales, returns, quotations, orders and challans.</p>
      </div>
      <BillingPos
        products={data.products}
        customers={data.customers}
        salespersons={data.salespersons}
        taxRates={data.taxRates}
        warehouses={data.warehouses}
        counters={data.counters}
        heldSales={data.heldSales}
        recentSales={data.recentSales}
        returnableSales={returnableSales}
        loyalty={data.loyalty}
        tiers={data.tiers}
        serialsByProduct={data.serialsByProduct}
        stockByProduct={data.stockByProduct}
        canManage={data.canManage}
        company={companyRows[0] ?? null}
        invoiceDesign={defaults.invoice}
      />
    </div>
  );
}
