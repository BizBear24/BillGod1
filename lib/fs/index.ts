import type { FilesystemService } from "./service";
import { BrowserFilesystemService } from "./browser-filesystem-service";

export type { FilesystemService } from "./service";
export { base64ToBytes } from "./service";

let instance: FilesystemService | null = null;

/**
 * The file-saving backend for this build. A future Electron build swaps in a
 * native implementation that writes straight to a chosen folder; every caller
 * keeps working unchanged.
 */
export function getFilesystemService(): FilesystemService {
  if (!instance) instance = new BrowserFilesystemService();
  return instance;
}
