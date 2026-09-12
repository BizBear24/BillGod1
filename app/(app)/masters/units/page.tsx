import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getMastersData, createUnit, updateUnit, deleteUnit } from "@/app/actions/masters";
import { EntityCrudManager } from "@/components/app/entity-crud-manager";
import { EntityImportExport } from "@/components/app/entity-import-export";

export default async function UnitsPage() {
  const data = await getMastersData();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/masters" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Masters
        </Link>
        <h1 className="mt-1 text-3xl font-bold">Units (UOM)</h1>
      </div>
      <EntityImportExport kind="unit" canManage={data.canManage} />
      <EntityCrudManager
        title="Units"
        kind="unit"
        items={data.units}
        columns={[
          { key: "name", label: "Name" },
          { key: "shortCode", label: "Short Code" },
        ]}
        fields={[
          { name: "name", label: "Name", type: "text", placeholder: "e.g. Piece" },
          { name: "shortCode", label: "Short Code", type: "text", placeholder: "e.g. PCS" },
        ]}
        defaultValues={{ name: "", shortCode: "" }}
        createAction={createUnit}
        updateAction={updateUnit}
        deleteAction={deleteUnit}
        canManage={data.canManage}
      />
    </div>
  );
}
