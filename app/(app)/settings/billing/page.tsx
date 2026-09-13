import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { companies } from "@/db/schema";
import { requireSessionUser, getActiveMembership } from "@/lib/auth/session";
import { getSettingsData } from "@/app/actions/org";
import { getPrintTemplates } from "@/app/actions/print-templates";
import { InvoiceDesigner } from "@/components/app/invoice-designer";
import { BillNumberingSettings } from "@/components/app/bill-numbering-settings";

export default async function SettingsBillingPage() {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership) redirect("/setup");

  const data = await getSettingsData();
  if (!data) redirect("/setup");

  const db = await getDb();
  const [templates, [company]] = await Promise.all([
    getPrintTemplates(),
    db.select().from(companies).where(eq(companies.businessId, membership.businessId)).limit(1),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bill Settings</h1>
        <p className="text-muted-foreground">Invoice numbering, paper size and everything printed on a bill.</p>
      </div>
      <BillNumberingSettings offsets={data.business.docNumberOffsets ?? {}} canManage={data.canManage} />
      <InvoiceDesigner templates={templates.invoices} company={company ?? null} canManage={templates.canManage} />
    </div>
  );
}
