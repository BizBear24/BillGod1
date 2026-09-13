import { requireSessionUser, getActiveMembership } from "@/lib/auth/session";
import { can, PERMISSIONS } from "@/lib/auth/permissions";
import { getCataloguePageData } from "@/app/actions/products";
import { CatalogueModule } from "@/components/app/catalogue-module";
import { Card, CardContent } from "@/components/ui/card";

export default async function CataloguePage() {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.PRODUCTS_VIEW)) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">You don&apos;t have permission to view this.</CardContent>
      </Card>
    );
  }

  const data = await getCataloguePageData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Catalogue</h1>
        <p className="text-muted-foreground">Filter down to what belongs in front of a customer, then print or save it as a PDF to send.</p>
      </div>
      <CatalogueModule
        products={data.products}
        categories={data.categories}
        brands={data.brands}
        stockByProduct={data.stockByProduct}
        imageProductIds={data.imageProductIds}
        companyName={data.companyName}
      />
    </div>
  );
}
