import { PAGE_SIZES, type PrintFormat, type PrintJob, type PrintService } from "./service";

const PAPER_WIDTHS: Record<PrintFormat, string> = {
  a4: "210mm",
  a5: "148mm",
  "80mm": "80mm",
  "58mm": "58mm",
};

/**
 * Printing through the browser's own dialog (which is also how "Save as PDF"
 * works, so shops get both from one path).
 *
 * The mechanics matter more than they look. Tabs in this app keep inactive
 * panels mounted, so marking print targets up front leaks them across tabs and
 * spools the wrong sheet. Instead the target is tagged only for the duration of
 * the print, and the stylesheet that isolates it is injected and removed around
 * the same moment — nothing on the page can be in a print-ready state except
 * the one region actually being printed.
 */
const MARKER = "data-billgod-printing";
const STYLE_ID = "billgod-print-style";

export class BrowserPrintService implements PrintService {
  isNative(): boolean {
    return false;
  }

  async print(job: PrintJob): Promise<void> {
    if (typeof window === "undefined") return;

    const page = PAGE_SIZES[job.format];
    const previousTitle = document.title;

    // `visibility` rather than `display` keeps the target's ancestors laid out,
    // so a print region nested inside cards and tab panels still reaches the
    // page instead of collapsing to nothing.
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      @media print {
        @page { size: ${page.css}; margin: ${page.marginCss}; }
        html, body { background: #fff !important; }
        body * { visibility: hidden !important; }
        [${MARKER}], [${MARKER}] * { visibility: visible !important; }
        [${MARKER}] {
          position: fixed !important;
          left: 0 !important;
          top: 0 !important;
          width: ${PAPER_WIDTHS[job.format]} !important;
          margin: 0 !important;
          background: #fff !important;
          color: #000 !important;
          box-shadow: none !important;
        }
      }
    `;

    job.element.setAttribute(MARKER, "");
    document.head.appendChild(style);
    if (job.title) document.title = job.title;

    try {
      // Give the browser a frame to apply the injected rules before the
      // (synchronous, blocking) print dialog snapshots the page.
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      window.print();
    } finally {
      job.element.removeAttribute(MARKER);
      style.remove();
      document.title = previousTitle;
    }
  }
}
