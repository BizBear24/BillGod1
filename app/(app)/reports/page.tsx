import { requireSessionUser, getActiveMembership } from "@/lib/auth/session";
import { can, PERMISSIONS } from "@/lib/auth/permissions";
import { todayKey, daysAgoKey } from "@/lib/utils";
import { getSalesDocReport } from "@/app/actions/reports";
import { ReportsManager } from "@/components/app/reports-manager";
import { Card, CardContent } from "@/components/ui/card";

export default async function ReportsPage() {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  const allowed = membership ? can(membership.role, PERMISSIONS.REPORTS_VIEW) : false;

  if (!allowed) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Reports</h1>
        </div>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">You don&apos;t have permission to view reports.</CardContent>
        </Card>
      </div>
    );
  }

  // The landing view (last 30 days of sales) is rendered server-side so the
  // page arrives with data instead of fetching after mount.
  const initialSalesReport = await getSalesDocReport("sale", { from: daysAgoKey(30), to: todayKey() });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Reports</h1>
        <p className="text-muted-foreground">Sales, purchase, stock and GST working summaries — filterable and exportable.</p>
      </div>
      <ReportsManager initialSalesReport={initialSalesReport} />
    </div>
  );
}
