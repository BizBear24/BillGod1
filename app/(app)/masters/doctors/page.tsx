import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getMastersData, createDoctor, updateDoctor, deleteDoctor } from "@/app/actions/masters";
import { EntityCrudManager } from "@/components/app/entity-crud-manager";

export default async function DoctorsPage() {
  const data = await getMastersData();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/masters" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Masters
        </Link>
        <h1 className="mt-1 text-3xl font-bold">Doctors</h1>
      </div>
      <EntityCrudManager
        title="Doctors"
        kind="doctor"
        items={data.doctors}
        columns={[
          { key: "name", label: "Name" },
          { key: "phone", label: "Phone" },
          { key: "clinicName", label: "Clinic" },
        ]}
        fields={[
          { name: "name", label: "Name", type: "text" },
          { name: "phone", label: "Phone", type: "text" },
          { name: "clinicName", label: "Clinic Name", type: "text" },
        ]}
        defaultValues={{ name: "", phone: "", clinicName: "" }}
        createAction={createDoctor}
        updateAction={updateDoctor}
        deleteAction={deleteDoctor}
        canManage={data.canManage}
      />
    </div>
  );
}
