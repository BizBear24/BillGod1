import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getMastersData, createTaxRate, updateTaxRate, deleteTaxRate, createHsnCode, updateHsnCode, deleteHsnCode } from "@/app/actions/masters";
import { EntityCrudManager } from "@/components/app/entity-crud-manager";
import { EntityImportExport } from "@/components/app/entity-import-export";

export default async function HsnPage() {
  const data = await getMastersData();
  const taxRateOptions = [
    { value: "none", label: "No tax rate" },
    ...data.taxRates.map((t) => ({ value: t.id, label: `${t.name} (${t.ratePercent}%)` })),
  ];
  const taxRateLookup = Object.fromEntries(data.taxRates.map((t) => [t.id, `${t.name} (${t.ratePercent}%)`]));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/masters" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Masters
        </Link>
        <h1 className="mt-1 text-3xl font-bold">HSN Codes &amp; Tax Rates</h1>
      </div>

      <EntityImportExport kind="taxRate" canManage={data.canManage} />
      <EntityCrudManager
        title="Tax Rates"
        description="GST rate presets (e.g. GST 18%) that HSN codes and products reference."
        kind="taxRate"
        items={data.taxRates}
        columns={[
          { key: "name", label: "Name" },
          { key: "ratePercent", label: "Rate %" },
          { key: "cessPercent", label: "Cess %" },
        ]}
        fields={[
          { name: "name", label: "Name", type: "text", placeholder: "e.g. GST 18%" },
          { name: "ratePercent", label: "Rate %", type: "text", placeholder: "18" },
          { name: "cessPercent", label: "Cess %", type: "text", placeholder: "0" },
        ]}
        defaultValues={{ name: "", ratePercent: "0", cessPercent: "0" }}
        createAction={createTaxRate}
        updateAction={updateTaxRate}
        deleteAction={deleteTaxRate}
        canManage={data.canManage}
      />

      <EntityImportExport kind="hsnCode" canManage={data.canManage} />
      <EntityCrudManager
        title="HSN / SAC Codes"
        kind="hsnCode"
        items={data.hsnCodes}
        columns={[
          { key: "code", label: "Code" },
          { key: "description", label: "Description" },
          { key: "taxRateId", label: "Tax Rate", format: "lookup", lookup: taxRateLookup },
        ]}
        fields={[
          { name: "code", label: "Code", type: "text", placeholder: "e.g. 6109" },
          { name: "description", label: "Description", type: "text" },
          { name: "taxRateId", label: "Tax Rate", type: "select", options: taxRateOptions },
        ]}
        defaultValues={{ code: "", description: "", taxRateId: "none" }}
        createAction={createHsnCode}
        updateAction={updateHsnCode}
        deleteAction={deleteHsnCode}
        canManage={data.canManage}
        emptyLabel="No HSN codes yet."
      />
    </div>
  );
}
