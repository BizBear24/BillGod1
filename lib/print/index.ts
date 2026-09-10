import type { PrintService } from "./service";
import { BrowserPrintService } from "./browser-print-service";

export type { PrintFormat, PrintJob, PrintService } from "./service";
export { PAGE_SIZES } from "./service";

let instance: PrintService | null = null;

/**
 * The print backend for this build. Only the browser one exists today; a
 * future Electron build swaps in a native ESC/POS + ZPL implementation here
 * and nothing that calls `print()` has to change.
 *
 * Unlike the email and SMS services this runs in the browser, so it is picked
 * at call time rather than from a server environment variable.
 */
export function getPrintService(): PrintService {
  if (!instance) instance = new BrowserPrintService();
  return instance;
}
