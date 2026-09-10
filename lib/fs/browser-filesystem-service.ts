import type { FilesystemService } from "./service";

/**
 * Saving a file from the browser: build a blob, hand it to an anchor, and let
 * the download land wherever the browser is configured to put it.
 *
 * The object URL is revoked on the next tick rather than immediately — Safari
 * in particular cancels a download whose URL is revoked in the same frame as
 * the click.
 */
export class BrowserFilesystemService implements FilesystemService {
  async saveFile(filename: string, data: Blob | Uint8Array, mimeType?: string): Promise<void> {
    if (typeof window === "undefined") throw new Error("Files can only be saved from the browser.");

    const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type: mimeType ?? "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
