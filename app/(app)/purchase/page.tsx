import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { companies } from "@/db/schema";
import { requireSessionUser, getActiveMembership } from "@/lib/auth/session";
import { getPurchasesPageData } from "@/app/actions/purchases";
import { getDefaultDesigns } from "@/app/actions/print-templates";
import { PurchasePos } from "@/components/app/purchase-pos";

export default async function PurchasePage() {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  const db = await getDb();
  const companyRows = membership
    ? await db.select().from(companies).where(eq(companies.businessId, membership.businessId)).limit(1)
    : [];

  const [data, defaults] = await Promise.all([getPurchasesPageData(), getDefaultDesigns()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Purchase</h1>
        <p className="text-muted-foreground">Purchase orders, purchases, and returns from your suppliers.</p>
      </div>
      <PurchasePos
        products={data.products}
        suppliers={data.suppliers}
        taxRates={data.taxRates}
        warehouses={data.warehouses}
        heldPurchases={data.heldPurchases}
        recentPurchases={data.recentPurchases}
        returnablePurchases={data.returnablePurchases}
        canManage={data.canManage}
        company={companyRows[0] ?? null}
        invoiceDesign={defaults.invoice}
      />
    </div>
  );
}
