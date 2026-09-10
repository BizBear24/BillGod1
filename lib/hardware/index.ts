import type { HardwareService } from "./service";
import { BrowserHardwareService } from "./browser-hardware-service";

export type { HardwareFeature, HardwareService } from "./service";

let instance: HardwareService | null = null;

/**
 * The hardware backend for this build. A future Electron build swaps in a
 * native implementation; callers ask `isAvailable` first either way.
 */
export function getHardwareService(): HardwareService {
  if (!instance) instance = new BrowserHardwareService();
  return instance;
}
