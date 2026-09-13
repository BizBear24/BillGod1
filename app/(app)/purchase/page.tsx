import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { companies } from "@/db/schema";
import { requireSessionUser, getActiveMembership } from "@/lib/auth/session";
import { can, PERMISSIONS } from "@/lib/auth/permissions";
import { getPurchasesPageData } from "@/app/actions/purchases";
import { getDefaultDesigns } from "@/app/actions/print-templates";
import { PurchasePos } from "@/components/app/purchase-pos";
import { Card, CardContent } from "@/components/ui/card";

export default async function PurchasePage() {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.PURCHASE_VIEW)) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">You don&apos;t have permission to view this.</CardContent>
      </Card>
    );
  }

  const db = await getDb();
  const companyRows = await db.select().from(companies).where(eq(companies.businessId, membership.businessId)).limit(1);

  const [data, defaults] = await Promise.all([getPurchasesPageData(), getDefaultDesigns()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Purchase</h1>
        <p className="text-muted-foreground">Purchase orders, purchases, and returns from your suppliers.</p>
      </div>
      <PurchasePos
        businessId={membership.businessId}
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
