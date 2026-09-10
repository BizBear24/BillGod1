import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getProductsPageData, createProduct, updateProduct, deleteProduct } from "@/app/actions/products";
import { EntityCrudManager, type CrudField } from "@/components/app/entity-crud-manager";
import { ProductImport } from "@/components/app/product-import";

const NONE = { value: "none", label: "—" };

export default async function ProductsPage() {
  const data = await getProductsPageData();

  const categoryOptions = [NONE, ...data.categories.map((c) => ({ value: c.id, label: c.name }))];
  const sectionOptions = [NONE, ...data.sections.map((s) => ({ value: s.id, label: s.name }))];
  const subsectionOptions = [
    NONE,
    ...data.subsections.map((s) => ({ value: s.id, label: `${data.sections.find((sec) => sec.id === s.sectionId)?.name ?? "?"} / ${s.name}` })),
  ];
  const brandOptions = [NONE, ...data.brands.map((b) => ({ value: b.id, label: b.name }))];
  const unitOptions = [NONE, ...data.units.map((u) => ({ value: u.id, label: `${u.name} (${u.shortCode})` }))];
  const sizeOptions = [NONE, ...data.sizes.map((s) => ({ value: s.id, label: s.name }))];
  const colorOptions = [NONE, ...data.colors.map((c) => ({ value: c.id, label: c.name }))];
  const hsnOptions = [NONE, ...data.hsnCodes.map((h) => ({ value: h.id, label: h.code }))];
  const taxRateOptions = [NONE, ...data.taxRates.map((t) => ({ value: t.id, label: `${t.name} (${t.ratePercent}%)` }))];
  const categoryLookup = Object.fromEntries(data.categories.map((c) => [c.id, c.name]));

  const fields: CrudField[] = [
    { name: "itemCode", label: "Item Code", type: "text", placeholder: "e.g. SKU-0001" },
    { name: "name", label: "Product Name", type: "text" },
    { name: "description", label: "Description", type: "text" },
    { name: "categoryId", label: "Category", type: "select", options: categoryOptions },
    { name: "sectionId", label: "Section", type: "select", options: sectionOptions },
    { name: "subsectionId", label: "Subsection", type: "select", options: subsectionOptions },
    { name: "brandId", label: "Brand", type: "select", options: brandOptions },
    { name: "unitId", label: "Unit", type: "select", options: unitOptions },
    { name: "sizeId", label: "Size", type: "select", options: sizeOptions },
    { name: "colorId", label: "Color", type: "select", options: colorOptions },
    { name: "hsnId", label: "HSN Code", type: "select", options: hsnOptions },
    { name: "taxRateId", label: "Tax Rate", type: "select", options: taxRateOptions },
    { name: "barcode", label: "Barcode", type: "text" },
    { name: "purchasePrice", label: "Purchase Price", type: "text", placeholder: "0.00" },
    { name: "sellingPrice", label: "Selling Price", type: "text", placeholder: "0.00" },
    { name: "mrp", label: "MRP", type: "text", placeholder: "0.00" },
    { name: "wholesalePrice", label: "Wholesale Price", type: "text", placeholder: "0.00" },
    { name: "openingStock", label: "Opening Stock", type: "text", placeholder: "0" },
    { name: "minStock", label: "Min Stock", type: "text", placeholder: "0" },
    { name: "reorderLevel", label: "Reorder Level", type: "text", placeholder: "0" },
    { name: "trackBatch", label: "Track batch numbers", type: "toggle" },
    { name: "trackExpiry", label: "Track expiry dates", type: "toggle" },
    { name: "trackSerial", label: "Track serial numbers (each unit individually)", type: "toggle" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/masters" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Masters
        </Link>
        <h1 className="mt-1 text-3xl font-bold">Products</h1>
      </div>

      <ProductImport canManage={data.canManage} />

      <EntityCrudManager
        title="Products"
        kind="product"
        items={data.products}
        columns={[
          { key: "itemCode", label: "Item Code" },
          { key: "name", label: "Name" },
          { key: "categoryId", label: "Category", format: "lookup", lookup: categoryLookup },
          { key: "sellingPrice", label: "Selling Price", format: "currency" },
          { key: "mrp", label: "MRP", format: "currency" },
        ]}
        fields={fields}
        defaultValues={{
          itemCode: "",
          name: "",
          description: "",
          categoryId: "none",
          sectionId: "none",
          subsectionId: "none",
          brandId: "none",
          unitId: "none",
          sizeId: "none",
          colorId: "none",
          hsnId: "none",
          taxRateId: "none",
          barcode: "",
          purchasePrice: "0",
          sellingPrice: "0",
          mrp: "0",
          wholesalePrice: "",
          openingStock: "0",
          minStock: "0",
          reorderLevel: "0",
          trackBatch: false,
          trackExpiry: false,
          trackSerial: false,
        }}
        createAction={createProduct}
        updateAction={updateProduct}
        deleteAction={deleteProduct}
        canManage={data.canManage}
        emptyLabel="No products yet. Add your first item to the catalog."
      />
    </div>
  );
}
