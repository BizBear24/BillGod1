import { eq, and, desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { products, companies, sales, customers } from "@/db/schema";
import { requireSessionUser, getActiveMembership } from "@/lib/auth/session";
import { can, PERMISSIONS } from "@/lib/auth/permissions";
import { getInvoiceData } from "@/app/actions/sales";
import { getPurchaseWithItems } from "@/app/actions/purchases";
import { getPrintTemplates, getDefaultDesigns } from "@/app/actions/print-templates";
import { BarcodeStudio } from "@/components/app/barcode-studio";
import { Card, CardContent } from "@/components/ui/card";

export default async function BarcodesPage({
  searchParams,
}: {
  searchParams: Promise<{ purchaseId?: string }>;
}) {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.PRODUCTS_VIEW)) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">You don&apos;t have permission to view this.</CardContent>
      </Card>
    );
  }

  // Arriving from "Print barcodes" on a purchase pre-fills the label sheet
  // with exactly what was bought, so the shop never has to re-enter or
  // guess quantities for the labels going on those new units.
  const { purchaseId } = await searchParams;
  const purchaseForLabels = purchaseId && can(membership.role, PERMISSIONS.PURCHASE_VIEW) ? await getPurchaseWithItems(purchaseId) : null;
  const initialLabelSelection = (purchaseForLabels?.items ?? [])
    .filter((item) => item.productId)
    .map((item) => ({ productId: item.productId as string, copies: Math.max(1, Math.round(parseFloat(item.quantity))) }));

  const db = await getDb();
  const businessId = membership.businessId;

  const [productRows, companyRows, saleRows] = await Promise.all([
    db.select().from(products).where(eq(products.businessId, businessId)),
    db.select().from(companies).where(eq(companies.businessId, businessId)).limit(1),
    db
      .select({
        id: sales.id,
        docNumber: sales.docNumber,
        docType: sales.docType,
        createdAt: sales.createdAt,
        totalAmount: sales.totalAmount,
        customerName: customers.name,
      })
      .from(sales)
      .leftJoin(customers, eq(sales.customerId, customers.id))
      .where(and(eq(sales.businessId, businessId), eq(sales.status, "completed")))
      .orderBy(desc(sales.createdAt))
      .limit(50),
  ]);

  // Render the first bill on the server so the invoice tab has something to
  // show immediately instead of fetching on mount.
  const [initialInvoice, templates, defaults] = await Promise.all([
    saleRows[0] ? getInvoiceData(saleRows[0].id) : Promise.resolve(null),
    getPrintTemplates(),
    getDefaultDesigns(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Barcodes &amp; Printing</h1>
        <p className="text-muted-foreground">Generate barcode labels, bulk sequences and printable invoices.</p>
      </div>
      <BarcodeStudio
        products={productRows}
        company={companyRows[0] ?? null}
        recentSales={saleRows}
        initialInvoice={initialInvoice}
        labelTemplates={templates.labels}
        invoiceTemplates={templates.invoices}
        defaultLabel={defaults.label}
        defaultInvoice={defaults.invoice}
        canDesign={templates.canManage}
        initialLabelSelection={initialLabelSelection.length > 0 ? initialLabelSelection : undefined}
      />
    </div>
  );
}
