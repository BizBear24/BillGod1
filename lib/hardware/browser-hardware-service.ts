import type { HardwareFeature, HardwareService } from "./service";

/**
 * What a web page can actually reach.
 *
 * A keyboard-wedge barcode scanner works today with no driver and no code —
 * it types into whatever field has focus. Cash drawers, customer displays and
 * weighing scales need USB or serial access a browser does not grant, so they
 * are reported unavailable instead of silently no-oping.
 */
const REASONS: Record<HardwareFeature, string | null> = {
  barcode_scanner: null,
  cash_drawer: "A cash drawer needs the desktop app — a browser cannot reach the USB/serial port it opens on.",
  customer_display: "A customer display needs the desktop app — a browser cannot drive a second serial screen.",
  weighing_scale: "A weighing scale needs the desktop app — a browser cannot read its serial port.",
};

export class BrowserHardwareService implements HardwareService {
  isAvailable(feature: HardwareFeature): boolean {
    return REASONS[feature] === null;
  }

  unavailableReason(feature: HardwareFeature): string | null {
    return REASONS[feature];
  }

  async openCashDrawer(): Promise<void> {
    throw new Error(REASONS.cash_drawer ?? "Cash drawer unavailable.");
  }
}
