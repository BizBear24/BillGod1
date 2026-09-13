import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { companies } from "@/db/schema";
import { requireSessionUser, getActiveMembership } from "@/lib/auth/session";
import { can, PERMISSIONS } from "@/lib/auth/permissions";
import { getBillingPageData, listReturnableSales } from "@/app/actions/sales";
import { getDefaultDesigns } from "@/app/actions/print-templates";
import { getProductImageIds } from "@/app/actions/products";
import { BillingPos } from "@/components/app/billing-pos";
import { Card, CardContent } from "@/components/ui/card";

export default async function BillingPage() {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.BILLING_VIEW)) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">You don&apos;t have permission to view this.</CardContent>
      </Card>
    );
  }

  const db = await getDb();
  const companyRows = await db.select().from(companies).where(eq(companies.businessId, membership.businessId)).limit(1);

  const [data, returnableSales, defaults, imageProductIds] = await Promise.all([
    getBillingPageData(),
    listReturnableSales(),
    getDefaultDesigns(),
    getProductImageIds(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Billing / Sales</h1>
        <p className="text-muted-foreground">Fast checkout for sales, returns, quotations, orders and challans.</p>
      </div>
      <BillingPos
        businessId={membership.businessId}
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
        imageProductIds={imageProductIds}
      />
    </div>
  );
}
