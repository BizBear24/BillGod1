"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { updateDocNumberOffsets } from "@/app/actions/org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Lets a shop switching from another billing system continue their invoice
 * numbering instead of restarting at 1: this business's own sale/purchase
 * count already drives the next number, so "starting number" here is stored
 * as an offset added on top of that count (see docNumberOffsets in the
 * businesses table and its use in app/actions/sales.ts and purchases.ts).
 */
const DOC_TYPES: { key: string; label: string; prefix: string; helper: string }[] = [
  { key: "sale", label: "Sales invoice", prefix: "SALE", helper: "e.g. their last invoice was #105, so the next one here should be 106" },
  { key: "purchase", label: "Purchase bill", prefix: "PUR", helper: "e.g. their last purchase bill was #40, so the next one here should be 41" },
];

export function BillNumberingSettings({ offsets, canManage }: { offsets: Record<string, number>; canManage: boolean }) {
  const router = useRouter();
  const [values, setValues] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(DOC_TYPES.map((d) => [d.key, offsets[d.key] ? String(offsets[d.key]) : ""]))
  );
  const [saving, setSaving] = React.useState(false);

  async function save() {
    setSaving(true);
    const parsed: Record<string, number> = {};
    for (const d of DOC_TYPES) {
      const n = parseInt(values[d.key], 10);
      if (Number.isFinite(n) && n > 0) parsed[d.key] = n;
    }
    const result = await updateDocNumberOffsets(parsed);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Numbering updated");
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <div>
          <p className="text-sm font-semibold">Continue numbering from another system</p>
          <p className="text-xs text-muted-foreground">
            Migrating from different billing software? Set the last number they used — the next bill you create here picks up right after
            it. Leave blank to start from this business&apos;s own count.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {DOC_TYPES.map((d) => (
            <div key={d.key} className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{d.label} — last number used elsewhere</label>
              <Input
                type="number"
                min={0}
                step="1"
                placeholder="0"
                disabled={!canManage}
                value={values[d.key]}
                onChange={(e) => setValues((v) => ({ ...v, [d.key]: e.target.value }))}
              />
              <p className="text-[11px] text-muted-foreground">{d.helper}</p>
            </div>
          ))}
        </div>
        {canManage && (
          <Button size="sm" disabled={saving} onClick={() => void save()}>
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save numbering"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
