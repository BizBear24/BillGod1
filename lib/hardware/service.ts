/**
 * HardwareService abstraction (spec §5/§69): barcode scanners, cash drawers,
 * customer displays, weighing scales.
 *
 * Barcode scanners need no code at all in a browser build — they present as a
 * keyboard, so the POS search box already receives them. The rest genuinely
 * cannot be reached from a web page, so `isAvailable` reports false and
 * `openCashDrawer` throws rather than pretending a drawer opened. A future
 * NativeHardwareService (Electron + USB/serial) implements the same contract
 * for real.
 */
export type HardwareFeature = "barcode_scanner" | "cash_drawer" | "customer_display" | "weighing_scale";

export interface HardwareService {
  openCashDrawer(): Promise<void>;
  isAvailable(feature: HardwareFeature): boolean;
  /** Human-readable reason a feature is unavailable, for showing in the UI. */
  unavailableReason(feature: HardwareFeature): string | null;
}
