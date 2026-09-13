"use client";

/**
 * Shrinks a picked image file down to a catalogue-sized JPEG data URL,
 * client-side, before it ever reaches the server.
 *
 * Product photos are stored as plain data: URIs (see db/schema/products.ts —
 * `productImages`), not in a blob/object store, so keeping every image small
 * is what keeps that column reasonable. A phone photo can be 4000px and
 * several megabytes; this caps the longest side and re-encodes it, which
 * typically lands in the tens of kilobytes.
 */
export function resizeImageFile(file: File, maxDimension = 640, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That doesn't look like an image."));
      img.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not process that image."));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
