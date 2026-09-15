import { redirect } from "next/navigation";
import { requireSessionUser, getActiveMembership } from "@/lib/auth/session";
import { getSettingsData } from "@/app/actions/org";
import { SettingsEditor } from "@/components/app/settings-editor";

export default async function SettingsCompanyPage() {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership) redirect("/setup");

  const data = await getSettingsData();
  if (!data) redirect("/setup");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Edit your profile, business details, and company info.</p>
      </div>
      <SettingsEditor
        user={data.user}
        business={data.business}
        companies={data.companies}
        canManage={data.canManage}
        canExportAll={data.canExportAll}
      />
    </div>
  );
}
