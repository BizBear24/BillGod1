import { redirect } from "next/navigation";
import { getOrgTree } from "@/app/actions/org";
import { requireSessionUser, getActiveMembership } from "@/lib/auth/session";
import { can, PERMISSIONS } from "@/lib/auth/permissions";
import { OrgManager } from "@/components/app/org-manager";

export default async function SettingsCompanyPage() {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  // The layout redirects when there is no active business, but a page renders
  // alongside its layout — so without this the page dereferences null first.
  if (!membership) redirect("/setup");

  const { companies, branches, warehouses, counters } = await getOrgTree(membership.businessId);

  return (
    <OrgManager
      companies={companies}
      branches={branches}
      warehouses={warehouses}
      counters={counters}
      canManageCompany={can(membership.role, PERMISSIONS.COMPANY_MANAGE)}
      canManageBranch={can(membership.role, PERMISSIONS.BRANCH_MANAGE)}
    />
  );
}
