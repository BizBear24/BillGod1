import { getPurchasesPageData } from "@/app/actions/purchases";
import { PurchasePos } from "@/components/app/purchase-pos";

export default async function PurchasePage() {
  const data = await getPurchasesPageData();

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
        canManage={data.canManage}
      />
    </div>
  );
}
