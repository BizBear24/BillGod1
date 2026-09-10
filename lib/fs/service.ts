/**
 * FilesystemService abstraction (spec §5): browser downloads today, native
 * filesystem access after a future Electron wrapper. Everything that produces
 * a file for the user — CSV and Excel exports, import templates — goes through
 * this rather than building its own anchor-and-blob dance.
 */
export interface FilesystemService {
  saveFile(filename: string, data: Blob | Uint8Array, mimeType?: string): Promise<void>;
}

/**
 * Server actions return binary as base64 because action results are JSON.
 * This is the one place that turns it back into bytes.
 */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
