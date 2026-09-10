import { getEngagementPageData, getCouponsAndReferrals } from "@/app/actions/engagement";
import { LoyaltyManager } from "@/components/app/loyalty-manager";

export default async function LoyaltyPage() {
  const [data, extras] = await Promise.all([getEngagementPageData(), getCouponsAndReferrals()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Loyalty</h1>
        <p className="text-muted-foreground">Points earn on every bill and can be redeemed straight from the POS.</p>
      </div>
      <LoyaltyManager
        settings={data.settings}
        tiers={data.tiers}
        customers={data.customers}
        pointsHistory={data.pointsHistory}
        coupons={extras.coupons}
        referrals={extras.referrals}
        canManage={data.canManageLoyalty}
      />
    </div>
  );
}
