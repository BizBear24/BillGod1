/**
 * PrintService abstraction (spec §5/§42/§43). Business logic must always go
 * through `getPrintService().print(...)` — never `window.print()` directly —
 * so a future Electron build can add a NativePrintService (ESC/POS, ZPL, USB
 * thermal printers, cash drawer) without touching sales/purchase/report code.
 *
 * The job is an element rather than an HTML string: what gets printed is the
 * live, already-rendered document, so the preview on screen and the paper can
 * never be two different layouts. A native implementation reads
 * `job.element.outerHTML` and drives the printer from that.
 */
export type PrintFormat = "a4" | "a5" | "58mm" | "80mm" | "custom";

export type PrintJob = {
  /** The rendered region to print. Everything else on the page is suppressed. */
  element: HTMLElement;
  format: PrintFormat;
  /** Used as the document title, which most browsers offer as the PDF filename. */
  title?: string;
  /** Required when `format` is "custom" — a shop's own cut paper size, in millimetres. Omit height for a continuous roll. */
  customSizeMm?: { width: number; height?: number };
  /** How many physical copies to print. Repeats the element on the page rather than relying on the OS print dialog's own (often sticky) copies count. @default 1 */
  copies?: number;
};

export interface PrintService {
  print(job: PrintJob): Promise<void>;
  /** True when a real printer is being driven rather than the browser's dialog. */
  isNative(): boolean;
}

/** Paper geometry per format, used to emit the right `@page` rule. */
export const PAGE_SIZES: Record<Exclude<PrintFormat, "custom">, { css: string; marginCss: string }> = {
  a4: { css: "A4 portrait", marginCss: "10mm" },
  a5: { css: "A5 portrait", marginCss: "8mm" },
  // Thermal rolls are continuous: fixed width, and the height grows with the
  // receipt. `auto` height is what stops the browser padding it to a sheet.
  "80mm": { css: "80mm auto", marginCss: "2mm" },
  "58mm": { css: "58mm auto", marginCss: "2mm" },
};
