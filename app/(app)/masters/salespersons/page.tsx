import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getMastersData, createSalesperson, updateSalesperson, deleteSalesperson } from "@/app/actions/masters";
import { EntityCrudManager } from "@/components/app/entity-crud-manager";
import { EntityImportExport } from "@/components/app/entity-import-export";

export default async function SalespersonsPage() {
  const data = await getMastersData();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/masters" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Masters
        </Link>
        <h1 className="mt-1 text-3xl font-bold">Salespersons</h1>
      </div>
      <EntityImportExport kind="salesperson" canManage={data.canManage} />
      <EntityCrudManager
        title="Salespersons"
        kind="salesperson"
        items={data.salespersons}
        columns={[
          { key: "name", label: "Name" },
          { key: "phone", label: "Phone" },
          { key: "email", label: "Email" },
        ]}
        fields={[
          { name: "name", label: "Name", type: "text" },
          { name: "phone", label: "Phone", type: "text" },
          { name: "email", label: "Email", type: "text" },
        ]}
        defaultValues={{ name: "", phone: "", email: "" }}
        createAction={createSalesperson}
        updateAction={updateSalesperson}
        deleteAction={deleteSalesperson}
        canManage={data.canManage}
      />
    </div>
  );
}
