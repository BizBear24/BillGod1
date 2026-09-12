import { listCustomers, createCustomer, updateCustomer, deleteCustomer } from "@/app/actions/parties";
import { CUSTOMER_TYPES } from "@/lib/validation/parties";
import { EntityCrudManager, type CrudField } from "@/components/app/entity-crud-manager";
import { EntityImportExport } from "@/components/app/entity-import-export";

const fields: CrudField[] = [
  { name: "name", label: "Name", type: "text" },
  { name: "phone", label: "Phone", type: "text" },
  { name: "email", label: "Email", type: "text" },
  { name: "gstin", label: "GSTIN", type: "text" },
  { name: "customerType", label: "Type", type: "select", options: CUSTOMER_TYPES.map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) })) },
  { name: "addressLine1", label: "Address", type: "text" },
  { name: "city", label: "City", type: "text" },
  { name: "state", label: "State", type: "text" },
  { name: "pincode", label: "Pincode", type: "text" },
  { name: "creditLimit", label: "Credit Limit", type: "text", placeholder: "0.00" },
  { name: "openingBalance", label: "Opening Balance", type: "text", placeholder: "0.00" },
  { name: "paymentTermsDays", label: "Payment Terms (days)", type: "text", placeholder: "0" },
  { name: "referredByCode", label: "Referred by (code)", type: "text", placeholder: "Their friend's referral code" },
];

export default async function CustomersPage() {
  const data = await listCustomers();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Customers</h1>
        <p className="text-muted-foreground">Retail, wholesale and B2B customers.</p>
      </div>
      <EntityImportExport kind="customer" canManage={data.canManage} />
      <EntityCrudManager
        title="Customers"
        kind="customer"
        items={data.customers}
        columns={[
          { key: "name", label: "Name" },
          { key: "phone", label: "Phone" },
          { key: "customerType", label: "Type" },
          { key: "openingBalance", label: "Opening Balance" },
        ]}
        fields={fields}
        defaultValues={{
          name: "",
          phone: "",
          email: "",
          gstin: "",
          customerType: "retail",
          addressLine1: "",
          city: "",
          state: "",
          pincode: "",
          creditLimit: "0",
          openingBalance: "0",
          paymentTermsDays: "0",
          referredByCode: "",
        }}
        createAction={createCustomer}
        updateAction={updateCustomer}
        deleteAction={deleteCustomer}
        canManage={data.canManage}
        emptyLabel="No customers yet."
      />
    </div>
  );
}
