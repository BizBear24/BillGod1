import { getBillingPageData, listReturnableSales } from "@/app/actions/sales";
import { BillingPos } from "@/components/app/billing-pos";

export default async function BillingPage() {
  const [data, returnableSales] = await Promise.all([getBillingPageData(), listReturnableSales()]);

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
        canManage={data.canManage}
      />
    </div>
  );
}
