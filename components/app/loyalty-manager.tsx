"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Gift, Settings2, History, Award, Ticket, UserPlus, Copy } from "lucide-react";
import {
  saveLoyaltySettings,
  createLoyaltyTier,
  updateLoyaltyTier,
  deleteLoyaltyTier,
  adjustLoyaltyPoints,
  expireLoyaltyPoints,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  getReferralCode,
  recordReferral,
} from "@/app/actions/engagement";
import { EntityCrudManager } from "@/components/app/entity-crud-manager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/lib/utils";

type LoyaltyConfig = {
  enabled: boolean;
  pointsPerCurrency: number;
  currencyPerPoint: number;
  minPointsToRedeem: number;
  expiryDays: number;
  referralEnabled: boolean;
  referrerRewardPoints: number;
  referredRewardPoints: number;
};
type Tier = { id: string; name: string; minPoints: number; discountPercent: string };
type Customer = { id: string; name: string; phone: string | null; loyaltyPoints: string };
type PointRow = { id: string; customerId: string; type: string; points: number; note: string | null; createdAt: Date };
type Coupon = {
  id: string;
  code: string;
  description: string | null;
  type: string;
  value: string;
  maxDiscountAmount: string | null;
  minBillAmount: string;
  startsAt: Date | null;
  endsAt: Date | null;
  maxRedemptions: number;
  perCustomerLimit: number;
  isActive: boolean;
  timesUsed: number;
};
type Referral = {
  id: string;
  code: string;
  referrerName: string;
  referredName: string;
  rewardedAt: Date | null;
  referrerPoints: number;
  referredPoints: number;
  createdAt: Date;
};

export function LoyaltyManager({
  settings,
  tiers,
  customers,
  pointsHistory,
  coupons,
  referrals,
  canManage,
}: {
  settings: LoyaltyConfig;
  tiers: Tier[];
  customers: Customer[];
  pointsHistory: PointRow[];
  coupons: Coupon[];
  referrals: Referral[];
  canManage: boolean;
}) {
  const [tab, setTab] = React.useState("settings");
  const customerName = React.useCallback((id: string) => customers.find((c) => c.id === id)?.name ?? "—", [customers]);

  const ranked = React.useMemo(
    () =>
      [...customers]
        .map((c) => ({ ...c, points: Math.floor(parseFloat(c.loyaltyPoints)) }))
        .filter((c) => c.points !== 0)
        .sort((a, b) => b.points - a.points),
    [customers]
  );

  const tierFor = React.useCallback(
    (points: number) => {
      const eligible = tiers.filter((t) => points >= t.minPoints).sort((a, b) => b.minPoints - a.minPoints);
      return eligible[0]?.name ?? null;
    },
    [tiers]
  );

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-4">
      <TabsList>
        <TabsTrigger value="settings">
          <Settings2 className="h-4 w-4" />
          Rules
        </TabsTrigger>
        <TabsTrigger value="tiers">
          <Award className="h-4 w-4" />
          Tiers
        </TabsTrigger>
        <TabsTrigger value="customers">
          <Gift className="h-4 w-4" />
          Balances
        </TabsTrigger>
        <TabsTrigger value="coupons">
          <Ticket className="h-4 w-4" />
          Coupons ({coupons.filter((c) => c.isActive).length})
        </TabsTrigger>
        <TabsTrigger value="referrals">
          <UserPlus className="h-4 w-4" />
          Referrals ({referrals.length})
        </TabsTrigger>
        <TabsTrigger value="history">
          <History className="h-4 w-4" />
          History
        </TabsTrigger>
      </TabsList>

      <TabsContent value="coupons">
        <CouponsPanel coupons={coupons} canManage={canManage} />
      </TabsContent>

      <TabsContent value="referrals">
        <ReferralsPanel settings={settings} referrals={referrals} customers={customers} canManage={canManage} />
      </TabsContent>

      <TabsContent value="settings">
        <SettingsForm settings={settings} canManage={canManage} />
      </TabsContent>

      <TabsContent value="tiers">
        <EntityCrudManager
          title="Tiers"
          kind="loyaltyTier"
          itemLabel="Tier"
          description="Customers reach a tier by crossing its points threshold."
          items={tiers}
          columns={[
            { key: "name", label: "Tier" },
            { key: "minPoints", label: "Minimum points" },
            { key: "discountPercent", label: "Discount %" },
          ]}
          fields={[
            { name: "name", label: "Tier name", type: "text", placeholder: "e.g. Gold" },
            { name: "minPoints", label: "Minimum points", type: "text", placeholder: "1000" },
            { name: "discountPercent", label: "Discount %", type: "text", placeholder: "5" },
          ]}
          defaultValues={{ name: "", minPoints: "0", discountPercent: "0" }}
          createAction={createLoyaltyTier}
          updateAction={updateLoyaltyTier}
          deleteAction={deleteLoyaltyTier}
          canManage={canManage}
          emptyLabel="No tiers yet — points still work without them."
        />
      </TabsContent>

      <TabsContent value="customers" className="space-y-4">
        {canManage && <AdjustForm customers={customers} />}
        <Card>
          <CardContent className="space-y-3 py-4">
            <p className="text-sm font-semibold">Point balances</p>
            {ranked.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No points issued yet. Complete a sale for a customer to start.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead className="text-right">Points</TableHead>
                      <TableHead className="text-right">Worth</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ranked.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          {c.name}
                          {c.phone ? <span className="ml-2 text-xs text-muted-foreground">{c.phone}</span> : null}
                        </TableCell>
                        <TableCell>{tierFor(c.points) ? <Badge variant="secondary">{tierFor(c.points)}</Badge> : "—"}</TableCell>
                        <TableCell className="text-right font-medium">{c.points}</TableCell>
                        <TableCell className="text-right text-muted-foreground">₹{(c.points * settings.currencyPerPoint).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="history">
        <Card>
          <CardContent className="space-y-3 py-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Recent point activity</p>
              {canManage && settings.expiryDays > 0 && <ExpireButton />}
            </div>
            {pointsHistory.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead className="text-right">Points</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pointsHistory.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{formatDate(row.createdAt)}</TableCell>
                        <TableCell>{customerName(row.customerId)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{row.type}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{row.note ?? "—"}</TableCell>
                        <TableCell className={`text-right font-medium ${row.points < 0 ? "text-destructive" : ""}`}>
                          {row.points > 0 ? `+${row.points}` : row.points}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

function ExpireButton() {
  const router = useRouter();
  const [running, setRunning] = React.useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={running}
      onClick={async () => {
        setRunning(true);
        const result = await expireLoyaltyPoints();
        setRunning(false);
        if (!result.ok) toast.error(result.error);
        else {
          toast.success(result.expired ? `${result.expired} points expired` : "Nothing to expire");
          router.refresh();
        }
      }}
    >
      {running ? "Running…" : "Run expiry"}
    </Button>
  );
}

function SettingsForm({ settings, canManage }: { settings: LoyaltyConfig; canManage: boolean }) {
  const router = useRouter();
  const [form, setForm] = React.useState({
    enabled: settings.enabled,
    pointsPerCurrency: String(settings.pointsPerCurrency),
    currencyPerPoint: String(settings.currencyPerPoint),
    minPointsToRedeem: String(settings.minPointsToRedeem),
    expiryDays: String(settings.expiryDays),
    referralEnabled: settings.referralEnabled,
    referrerRewardPoints: String(settings.referrerRewardPoints),
    referredRewardPoints: String(settings.referredRewardPoints),
  });
  const [saving, setSaving] = React.useState(false);

  const earnExample = (parseFloat(form.pointsPerCurrency) || 0) * 1000;
  const redeemExample = (parseFloat(form.currencyPerPoint) || 0) * 100;

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <p className="text-sm font-semibold">Earning &amp; redemption rules</p>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.enabled}
            disabled={!canManage}
            onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
            className="h-4 w-4 accent-primary"
          />
          Loyalty programme is active
        </label>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label="Points earned per ₹1"
            value={form.pointsPerCurrency}
            onChange={(v) => setForm((f) => ({ ...f, pointsPerCurrency: v }))}
            disabled={!canManage}
          />
          <Field
            label="₹ value of one point"
            value={form.currencyPerPoint}
            onChange={(v) => setForm((f) => ({ ...f, currencyPerPoint: v }))}
            disabled={!canManage}
          />
          <Field
            label="Minimum points to redeem"
            value={form.minPointsToRedeem}
            onChange={(v) => setForm((f) => ({ ...f, minPointsToRedeem: v }))}
            disabled={!canManage}
          />
          <Field
            label="Expire after (days, 0 = never)"
            value={form.expiryDays}
            onChange={(v) => setForm((f) => ({ ...f, expiryDays: v }))}
            disabled={!canManage}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          A ₹1,000 bill earns {earnExample.toFixed(0)} points; 100 points are worth ₹{redeemExample.toFixed(2)} off a future bill.
        </p>

        <div className="space-y-3 border-t border-border pt-4">
          <p className="text-sm font-semibold">Refer a friend</p>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.referralEnabled}
              disabled={!canManage}
              onChange={(e) => setForm((f) => ({ ...f, referralEnabled: e.target.checked }))}
              className="h-4 w-4 accent-primary"
            />
            Reward customers who bring in a friend
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Points to the referrer"
              value={form.referrerRewardPoints}
              onChange={(v) => setForm((f) => ({ ...f, referrerRewardPoints: v }))}
              disabled={!canManage || !form.referralEnabled}
            />
            <Field
              label="Welcome points to the friend"
              value={form.referredRewardPoints}
              onChange={(v) => setForm((f) => ({ ...f, referredRewardPoints: v }))}
              disabled={!canManage || !form.referralEnabled}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Both sides are paid when the referred customer&apos;s first bill is completed — an introduction that never becomes a sale
            costs nothing.
          </p>
        </div>

        {canManage && (
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              const result = await saveLoyaltySettings({
                enabled: form.enabled,
                pointsPerCurrency: form.pointsPerCurrency,
                currencyPerPoint: form.currencyPerPoint,
                minPointsToRedeem: form.minPointsToRedeem,
                expiryDays: form.expiryDays,
                referralEnabled: form.referralEnabled,
                referrerRewardPoints: form.referrerRewardPoints,
                referredRewardPoints: form.referredRewardPoints,
              });
              setSaving(false);
              if (!result.ok) toast.error(result.error);
              else {
                toast.success("Loyalty rules saved");
                router.refresh();
              }
            }}
          >
            {saving ? "Saving…" : "Save rules"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Input type="number" step="any" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function AdjustForm({ customers }: { customers: Customer[] }) {
  const router = useRouter();
  const [customerId, setCustomerId] = React.useState(customers[0]?.id ?? "");
  const [points, setPoints] = React.useState("");
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const customerItems = React.useMemo(
    () => customers.map((c) => ({ value: c.id, label: `${c.name} (${Math.floor(parseFloat(c.loyaltyPoints))} pts)` })),
    [customers]
  );

  if (customers.length === 0) return null;

  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-3 py-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Customer</label>
          <div className="w-64">
            <Select items={customerItems} value={customerId} onValueChange={(v) => setCustomerId(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({Math.floor(parseFloat(c.loyaltyPoints))} pts)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="adjust-points">
            Points (negative removes)
          </label>
          <Input id="adjust-points" type="number" value={points} onChange={(e) => setPoints(e.target.value)} className="w-40" placeholder="100" />
        </div>
        <div className="min-w-48 flex-1 space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="adjust-note">
            Reason
          </label>
          <Input id="adjust-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Goodwill gesture" />
        </div>
        <Button
          disabled={saving || !points}
          onClick={async () => {
            setSaving(true);
            const result = await adjustLoyaltyPoints({ customerId, points, note });
            setSaving(false);
            if (!result.ok) toast.error(result.error);
            else {
              toast.success("Points adjusted");
              setPoints("");
              setNote("");
              router.refresh();
            }
          }}
        >
          {saving ? "Saving…" : "Adjust"}
        </Button>
      </CardContent>
    </Card>
  );
}


const money = (n: number) => `₹${n.toFixed(2)}`;
const dateKey = (value: Date | null) => (value ? new Date(value).toISOString().slice(0, 10) : "");

/**
 * Coupon codes. Usage is counted from the redemption ledger, so a cancelled
 * bill hands its use of the code back automatically.
 */
function CouponsPanel({ coupons, canManage }: { coupons: Coupon[]; canManage: boolean }) {
  return (
    <EntityCrudManager
      title="Coupons"
      kind="coupon"
      itemLabel="Coupon"
      description="Codes the cashier types at the till. Every rule is checked on the server when the bill is saved."
      items={coupons.map((c) => ({
        ...c,
        typeLabel: c.type === "percent" ? `${parseFloat(c.value)}% off` : `${money(parseFloat(c.value))} off`,
        usage: `${c.timesUsed}${c.maxRedemptions > 0 ? ` / ${c.maxRedemptions}` : ""}`,
        state: c.isActive ? "Active" : "Off",
        // The form edits dates as YYYY-MM-DD text.
        startsAt: dateKey(c.startsAt),
        endsAt: dateKey(c.endsAt),
        value: String(parseFloat(c.value)),
        minBillAmount: String(parseFloat(c.minBillAmount)),
        maxDiscountAmount: c.maxDiscountAmount ? String(parseFloat(c.maxDiscountAmount)) : "",
        description: c.description ?? "",
      }))}
      columns={[
        { key: "code", label: "Code" },
        { key: "typeLabel", label: "Worth" },
        { key: "state", label: "Status" },
        { key: "usage", label: "Used" },
        { key: "endsAt", label: "Valid until" },
      ]}
      fields={[
        { name: "code", label: "Code", type: "text", placeholder: "e.g. DIWALI10" },
        { name: "description", label: "Description", type: "text", placeholder: "Shown to the cashier" },
        {
          name: "type",
          label: "Type",
          type: "select",
          options: [
            { value: "percent", label: "Percentage off" },
            { value: "amount", label: "Flat amount off" },
          ],
        },
        { name: "value", label: "Value (% or ₹)", type: "text", placeholder: "10" },
        { name: "maxDiscountAmount", label: "Maximum discount ₹ (blank = uncapped)", type: "text", placeholder: "" },
        { name: "minBillAmount", label: "Minimum bill ₹", type: "text", placeholder: "0" },
        { name: "startsAt", label: "Valid from (YYYY-MM-DD)", type: "text", placeholder: "" },
        { name: "endsAt", label: "Valid until (YYYY-MM-DD)", type: "text", placeholder: "" },
        { name: "maxRedemptions", label: "Total uses allowed (0 = unlimited)", type: "text", placeholder: "0" },
        { name: "perCustomerLimit", label: "Uses per customer (0 = unlimited)", type: "text", placeholder: "0" },
        { name: "isActive", label: "Active", type: "toggle" },
      ]}
      defaultValues={{
        code: "",
        description: "",
        type: "percent",
        value: "10",
        maxDiscountAmount: "",
        minBillAmount: "0",
        startsAt: "",
        endsAt: "",
        maxRedemptions: "0",
        perCustomerLimit: "0",
        isActive: true,
      }}
      createAction={createCoupon}
      updateAction={updateCoupon}
      deleteAction={deleteCoupon}
      canManage={canManage}
      emptyLabel="No coupons yet."
    />
  );
}

/** The referral register, plus the tools to hand out a code and log an introduction. */
function ReferralsPanel({
  settings,
  referrals,
  customers,
  canManage,
}: {
  settings: LoyaltyConfig;
  referrals: Referral[];
  customers: Customer[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [codeCustomerId, setCodeCustomerId] = React.useState(customers[0]?.id ?? "");
  const [issuedCode, setIssuedCode] = React.useState<string | null>(null);
  const [referredId, setReferredId] = React.useState(customers[0]?.id ?? "");
  const [enteredCode, setEnteredCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const customerItems = React.useMemo(() => customers.map((c) => ({ value: c.id, label: c.name })), [customers]);

  return (
    <div className="space-y-4">
      {!settings.referralEnabled && (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">
            Referrals are switched off, so introductions can still be recorded but no points are paid. Turn them on under Rules.
          </CardContent>
        </Card>
      )}

      {canManage && customers.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-3 py-4">
              <p className="text-sm font-semibold">Give a customer their code</p>
              <Select items={customerItems} value={codeCustomerId} onValueChange={(v) => { setCodeCustomerId(v ?? ""); setIssuedCode(null); }}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="secondary"
                disabled={busy || !codeCustomerId}
                onClick={async () => {
                  setBusy(true);
                  const result = await getReferralCode(codeCustomerId);
                  setBusy(false);
                  if (!result.ok || !result.code) {
                    toast.error(result.ok ? "Could not issue a code." : result.error);
                    return;
                  }
                  setIssuedCode(result.code);
                  router.refresh();
                }}
              >
                {busy ? "Working…" : "Show referral code"}
              </Button>
              {issuedCode && (
                <div className="flex items-center gap-2 rounded-lg border border-border p-2">
                  <code className="flex-1 font-mono text-lg font-semibold tracking-wider">{issuedCode}</code>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Copy referral code"
                    onClick={() => {
                      void navigator.clipboard?.writeText(issuedCode);
                      toast.success("Code copied");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 py-4">
              <p className="text-sm font-semibold">Record an introduction</p>
              <Select items={customerItems} value={referredId} onValueChange={(v) => setReferredId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="New customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={enteredCode}
                onChange={(e) => setEnteredCode(e.target.value.toUpperCase())}
                placeholder="Referral code they were given"
                className="font-mono"
              />
              <Button
                disabled={busy || !referredId || enteredCode.trim().length === 0}
                onClick={async () => {
                  setBusy(true);
                  const result = await recordReferral(referredId, enteredCode);
                  setBusy(false);
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
                  toast.success("Referral recorded — points are paid on their first bill");
                  setEnteredCode("");
                  router.refresh();
                }}
              >
                Record referral
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="space-y-3 py-4">
          <p className="text-sm font-semibold">Referral register</p>
          {referrals.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nobody has been referred yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Referred by</TableHead>
                    <TableHead>New customer</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Points paid</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {referrals.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.referrerName}</TableCell>
                      <TableCell>{r.referredName}</TableCell>
                      <TableCell className="font-mono text-xs">{r.code}</TableCell>
                      <TableCell>
                        {r.rewardedAt ? (
                          <Badge variant="secondary">Rewarded {formatDate(r.rewardedAt)}</Badge>
                        ) : (
                          <Badge variant="outline">Awaiting first bill</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {r.rewardedAt ? `${r.referrerPoints} + ${r.referredPoints}` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
