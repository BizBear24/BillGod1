import { getEngagementPageData, getOutstandingCustomers } from "@/app/actions/engagement";
import { requireSessionUser, getActiveMembership } from "@/lib/auth/session";
import { can, PERMISSIONS } from "@/lib/auth/permissions";
import { CommunicationsManager } from "@/components/app/communications-manager";

export default async function CommunicationsPage() {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  const canSend = membership ? can(membership.role, PERMISSIONS.COMMUNICATIONS_SEND) : false;

  const [data, outstanding] = await Promise.all([getEngagementPageData(), canSend ? getOutstandingCustomers() : Promise.resolve([])]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Communications</h1>
        <p className="text-muted-foreground">Invoices, receipts, reminders and promotions over SMS or email.</p>
      </div>
      <CommunicationsManager
        templates={data.templates}
        customers={data.customers}
        messageLog={data.messageLog}
        outstanding={outstanding}
        canSend={canSend}
      />
    </div>
  );
}
