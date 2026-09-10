import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getMastersData, createColor, updateColor, deleteColor } from "@/app/actions/masters";
import { EntityCrudManager } from "@/components/app/entity-crud-manager";

export default async function ColorsPage() {
  const data = await getMastersData();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/masters" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Masters
        </Link>
        <h1 className="mt-1 text-3xl font-bold">Colors</h1>
      </div>
      <EntityCrudManager
        title="Colors"
        kind="color"
        items={data.colors}
        columns={[
          { key: "name", label: "Name", format: "swatch", swatchKey: "hexCode" },
          { key: "hexCode", label: "Hex Code" },
        ]}
        fields={[
          { name: "name", label: "Name", type: "text", placeholder: "e.g. Red" },
          { name: "hexCode", label: "Hex Code", type: "text", placeholder: "#FF0000" },
        ]}
        defaultValues={{ name: "", hexCode: "" }}
        createAction={createColor}
        updateAction={updateColor}
        deleteAction={deleteColor}
        canManage={data.canManage}
      />
    </div>
  );
}
