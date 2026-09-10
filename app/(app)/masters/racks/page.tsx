import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getMastersData, createRack, updateRack, deleteRack } from "@/app/actions/masters";
import { EntityCrudManager } from "@/components/app/entity-crud-manager";
import { Card, CardContent } from "@/components/ui/card";

export default async function RacksPage() {
  const data = await getMastersData();
  const warehouseOptions = data.warehouses.map((w) => ({ value: w.id, label: w.label }));
  const warehouseLookup = Object.fromEntries(warehouseOptions.map((w) => [w.value, w.label]));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/masters" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Masters
        </Link>
        <h1 className="mt-1 text-3xl font-bold">Racks</h1>
      </div>

      {warehouseOptions.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Set up a company and branch first — racks belong to a warehouse. Go to Settings → Company &amp; Branches.
          </CardContent>
        </Card>
      ) : (
        <EntityCrudManager
          title="Racks"
          kind="rack"
          items={data.racks}
          columns={[
            { key: "name", label: "Name" },
            { key: "warehouseId", label: "Warehouse", format: "lookup", lookup: warehouseLookup },
          ]}
          fields={[
            { name: "name", label: "Name", type: "text", placeholder: "e.g. Rack A1" },
            { name: "warehouseId", label: "Warehouse", type: "select", options: warehouseOptions },
          ]}
          defaultValues={{ name: "", warehouseId: warehouseOptions[0]?.value ?? "" }}
          createAction={createRack}
          updateAction={updateRack}
          deleteAction={deleteRack}
          canManage={data.canManage}
        />
      )}
    </div>
  );
}
