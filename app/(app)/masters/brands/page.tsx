import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getMastersData, createBrand, updateBrand, deleteBrand } from "@/app/actions/masters";
import { EntityCrudManager } from "@/components/app/entity-crud-manager";

export default async function BrandsPage() {
  const data = await getMastersData();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/masters" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Masters
        </Link>
        <h1 className="mt-1 text-3xl font-bold">Brands</h1>
      </div>
      <EntityCrudManager
        title="Brands"
        kind="brand"
        items={data.brands}
        columns={[{ key: "name", label: "Name" }]}
        fields={[{ name: "name", label: "Name", type: "text", placeholder: "e.g. Nike" }]}
        defaultValues={{ name: "" }}
        createAction={createBrand}
        updateAction={updateBrand}
        deleteAction={deleteBrand}
        canManage={data.canManage}
      />
    </div>
  );
}
