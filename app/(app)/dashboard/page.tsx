import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, and, gte, sql } from "drizzle-orm";
import { Building2, GitBranch, Users, IndianRupee, Package, TrendingUp } from "lucide-react";
import { getDb } from "@/db/client";
import { companies, branches, memberships, sales } from "@/db/schema";
import { requireSessionUser, getActiveMembership } from "@/lib/auth/session";
import { can, PERMISSIONS } from "@/lib/auth/permissions";
import { getLowStockReport } from "@/app/actions/inventory";
import { getGrossProfit } from "@/app/actions/reports";
import { todayKey } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function DashboardPage() {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  // The layout redirects when there is no active business, but a page renders
  // alongside its layout — so without this the page dereferences null first.
  if (!membership) redirect("/setup");

  const businessId = membership.businessId;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const db = await getDb();
  const [companyRows, branchRows, memberRows, [todaySales], lowStock] = await Promise.all([
    db.select().from(companies).where(eq(companies.businessId, businessId)),
    db
      .select({ id: branches.id })
      .from(branches)
      .innerJoin(companies, eq(branches.companyId, companies.id))
      .where(eq(companies.businessId, businessId)),
    db.select().from(memberships).where(eq(memberships.businessId, businessId)),
    db
      .select({ total: sql<string>`coalesce(sum(${sales.totalAmount}), 0)` })
      .from(sales)
      .where(and(eq(sales.businessId, businessId), eq(sales.docType, "sale"), eq(sales.status, "completed"), gte(sales.createdAt, startOfToday))),
    can(membership.role, PERMISSIONS.INVENTORY_VIEW) ? getLowStockReport() : Promise.resolve([]),
  ]);

  // Gross profit needs the cost ledger, so it is only shown to roles that are
  // allowed to see reports at all.
  const profit = can(membership.role, PERMISSIONS.REPORTS_VIEW)
    ? await getGrossProfit({ from: todayKey(), to: todayKey() })
    : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Welcome back, {sessionUser.name.split(" ")[0]}</h1>
        <p className="text-muted-foreground">Here&apos;s what&apos;s happening with {membership.businessName}.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <RealMoneyStat icon={IndianRupee} label="Today's Sales" value={parseFloat(todaySales?.total ?? "0")} href="/billing" />
        {profit ? (
          <RealMoneyStat
            icon={TrendingUp}
            label="Today's Gross Profit"
            value={profit.grossProfit}
            note={`${profit.marginPercent}% margin · sales less cost of goods`}
            href="/reports"
          />
        ) : (
          <MoneyStat icon={TrendingUp} label="Today's Gross Profit" note="Needs report access" />
        )}
        <RealStat icon={Package} label="Low Stock Items" value={lowStock.length} href="/inventory" />
        <RealStat icon={Building2} label="Companies" value={companyRows.length} href="/settings/company" />
        <RealStat icon={GitBranch} label="Branches" value={branchRows.length} href="/settings/company" />
        <RealStat icon={Users} label="Team Members" value={memberRows.length} href="/settings/users" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Get started</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {can(membership.role, PERMISSIONS.MEMBERS_INVITE) && (
            <Button nativeButton={false} render={<Link href="/settings/users" />} size="lg" variant="secondary" className="justify-start">
              + Invite your team
            </Button>
          )}
          {can(membership.role, PERMISSIONS.BRANCH_MANAGE) && (
            <Button nativeButton={false} render={<Link href="/settings/company" />} size="lg" variant="secondary" className="justify-start">
              + Add another branch
            </Button>
          )}
          <Button nativeButton={false} render={<Link href="/billing" />} size="lg" variant="secondary" className="justify-start">
            + New Bill
          </Button>
          <Button nativeButton={false} render={<Link href="/inventory" />} size="lg" variant="secondary" className="justify-start">
            View Inventory
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function RealStat({ icon: Icon, label, value, href }: { icon: typeof Building2; label: string; value: number; href: string }) {
  return (
    <Link href={href}>
      <Card className="transition-colors hover:bg-accent">
        <CardContent className="flex flex-col gap-2 py-5">
          <Icon className="h-5 w-5 text-primary" />
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

function RealMoneyStat({
  icon: Icon,
  label,
  value,
  href,
  note,
}: {
  icon: typeof IndianRupee;
  label: string;
  value: number;
  href: string;
  note?: string;
}) {
  return (
    <Link href={href}>
      <Card className="transition-colors hover:bg-accent">
        <CardContent className="flex flex-col gap-2 py-5">
          <Icon className="h-5 w-5 text-primary" />
          <p className={`text-2xl font-bold ${value < 0 ? "text-destructive" : ""}`}>
            {value < 0 ? "-" : ""}₹{Math.abs(value).toFixed(2)}
          </p>
          <p className="text-xs text-muted-foreground">{label}</p>
          {note && <p className="text-[10px] text-muted-foreground/70">{note}</p>}
        </CardContent>
      </Card>
    </Link>
  );
}

function MoneyStat({ icon: Icon, label, note }: { icon: typeof IndianRupee; label: string; note: string }) {
  return (
    <Card className="opacity-70">
      <CardContent className="flex flex-col gap-2 py-5">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <p className="text-2xl font-bold text-muted-foreground">—</p>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-[10px] text-muted-foreground/70">{note}</p>
      </CardContent>
    </Card>
  );
}
