import { listSuppliers, createSupplier, updateSupplier, deleteSupplier } from "@/app/actions/parties";
import { EntityCrudManager, type CrudField } from "@/components/app/entity-crud-manager";

const fields: CrudField[] = [
  { name: "name", label: "Name", type: "text" },
  { name: "phone", label: "Phone", type: "text" },
  { name: "email", label: "Email", type: "text" },
  { name: "gstin", label: "GSTIN", type: "text" },
  { name: "addressLine1", label: "Address", type: "text" },
  { name: "city", label: "City", type: "text" },
  { name: "state", label: "State", type: "text" },
  { name: "pincode", label: "Pincode", type: "text" },
  { name: "openingBalance", label: "Opening Balance", type: "text", placeholder: "0.00" },
  { name: "paymentTermsDays", label: "Payment Terms (days)", type: "text", placeholder: "0" },
];

export default async function SuppliersPage() {
  const data = await listSuppliers();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Suppliers</h1>
        <p className="text-muted-foreground">Vendors you purchase stock from.</p>
      </div>
      <EntityCrudManager
        title="Suppliers"
        kind="supplier"
        items={data.suppliers}
        columns={[
          { key: "name", label: "Name" },
          { key: "phone", label: "Phone" },
          { key: "gstin", label: "GSTIN" },
          { key: "openingBalance", label: "Opening Balance" },
        ]}
        fields={fields}
        defaultValues={{
          name: "",
          phone: "",
          email: "",
          gstin: "",
          addressLine1: "",
          city: "",
          state: "",
          pincode: "",
          openingBalance: "0",
          paymentTermsDays: "0",
        }}
        createAction={createSupplier}
        updateAction={updateSupplier}
        deleteAction={deleteSupplier}
        canManage={data.canManage}
        emptyLabel="No suppliers yet."
      />
    </div>
  );
}
