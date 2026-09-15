"use client";

import * as React from "react";

/**
 * The branch/warehouse a shop is currently working out of, picked once on the
 * Dashboard and remembered from there — Billing and Purchase both open
 * pre-set to it instead of each page defaulting to whichever warehouse
 * happens to be first. Kept in localStorage, keyed per business, so it
 * survives a refresh but never leaks across a device's other businesses.
 */
function storageKey(businessId: string): string {
  return `billgod:active-warehouse:${businessId}`;
}

export function getStoredActiveWarehouse(businessId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(storageKey(businessId));
  } catch {
    return null;
  }
}

export function setStoredActiveWarehouse(businessId: string, warehouseId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(businessId), warehouseId);
  } catch {
    // Private browsing or storage disabled — the picker just won't persist.
  }
}

/**
 * Resolves the active warehouse for a page that lists warehouses: the stored
 * pick if it is still one of them, otherwise the first one.
 */
export function useActiveWarehouse(businessId: string, warehouses: { id: string }[]): [string, (id: string) => void] {
  // The lazy initializer must return the same thing on the server and on the
  // client's first render (localStorage doesn't exist on the server), or
  // React's hydration check flags every attribute downstream of it as
  // mismatched. So this starts at the server-safe default and only reaches
  // into localStorage afterward, in an effect that runs post-hydration.
  const [warehouseId, setWarehouseIdState] = React.useState(() => warehouses[0]?.id ?? "");

  React.useEffect(() => {
    const stored = getStoredActiveWarehouse(businessId);
    if (stored && warehouses.some((w) => w.id === stored) && stored !== warehouseId) {
      setWarehouseIdState(stored);
    }
    // Only meant to run once, right after mount, to apply the stored pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  const setWarehouseId = React.useCallback(
    (id: string) => {
      setWarehouseIdState(id);
      setStoredActiveWarehouse(businessId, id);
    },
    [businessId]
  );

  return [warehouseId, setWarehouseId];
}
