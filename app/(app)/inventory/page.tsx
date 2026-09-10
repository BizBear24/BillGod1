import {
  getInventoryPageData,
  listTransfers,
  listAdjustments,
  getLowStockReport,
  getDeadStockReport,
  getFastSlowMovingReport,
  getSerialRegister,
} from "@/app/actions/inventory";
import { InventoryManager } from "@/components/app/inventory-manager";

export default async function InventoryPage() {
  const [pageData, transfers, adjustments, lowStock, deadStock, fastSlow, serialRegister] = await Promise.all([
    getInventoryPageData(),
    listTransfers(),
    listAdjustments(),
    getLowStockReport(),
    getDeadStockReport(),
    getFastSlowMovingReport(),
    getSerialRegister(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Inventory</h1>
        <p className="text-muted-foreground">Stock levels, transfers, adjustments and movement reports.</p>
      </div>
      <InventoryManager
        warehouses={pageData.warehouses}
        products={pageData.products}
        stockByProduct={pageData.stockByProduct}
        transfers={transfers}
        adjustments={adjustments}
        lowStock={lowStock}
        deadStock={deadStock}
        fastSlow={fastSlow}
        serialRegister={serialRegister}
        canManage={pageData.canManage}
      />
    </div>
  );
}
