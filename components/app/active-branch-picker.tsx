"use client";

import * as React from "react";
import { Building2 } from "lucide-react";
import { useActiveWarehouse } from "@/lib/active-branch";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Warehouse = { id: string; label: string };

/**
 * The one place a shop picks which branch/warehouse it's working out of.
 * Billing and Purchase both read this same choice (see lib/active-branch.ts)
 * instead of each burying its own small dropdown, so switching branches once
 * here is enough for stock, numbering context and every screen downstream.
 */
export function ActiveBranchPicker({ businessId, warehouses }: { businessId: string; warehouses: Warehouse[] }) {
  const [warehouseId, setWarehouseId] = useActiveWarehouse(businessId, warehouses);

  if (warehouses.length === 0) return null;

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-4 py-5">
        <Building2 className="h-8 w-8 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Active branch / warehouse</p>
          <p className="text-xs text-muted-foreground">Billing and Purchase open to this branch until you change it here.</p>
        </div>
        <Select items={warehouses.map((w) => ({ value: w.id, label: w.label }))} value={warehouseId} onValueChange={(v) => v && setWarehouseId(v)}>
          <SelectTrigger className="h-12 w-full text-base font-medium sm:w-72">
            <SelectValue placeholder="Pick a branch" />
          </SelectTrigger>
          <SelectContent>
            {warehouses.map((w) => (
              <SelectItem key={w.id} value={w.id} className="text-base">
                {w.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
}
