import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getMastersData, createSize, updateSize, deleteSize } from "@/app/actions/masters";
import { EntityCrudManager } from "@/components/app/entity-crud-manager";

export default async function SizesPage() {
  const data = await getMastersData();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/masters" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Masters
        </Link>
        <h1 className="mt-1 text-3xl font-bold">Sizes</h1>
      </div>
      <EntityCrudManager
        title="Sizes"
        kind="size"
        items={data.sizes}
        columns={[{ key: "name", label: "Name" }]}
        fields={[{ name: "name", label: "Name", type: "text", placeholder: "e.g. XL" }]}
        defaultValues={{ name: "" }}
        createAction={createSize}
        updateAction={updateSize}
        deleteAction={deleteSize}
        canManage={data.canManage}
      />
    </div>
  );
}
