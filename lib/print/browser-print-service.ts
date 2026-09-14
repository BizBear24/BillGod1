import { PAGE_SIZES, type PrintFormat, type PrintJob, type PrintService } from "./service";

/**
 * Printing through the browser's own dialog (which is also how "Save as PDF"
 * works, so shops get both from one path).
 *
 * The mechanics matter more than they look. Tabs in this app keep inactive
 * panels mounted, so marking print targets up front leaks them across tabs and
 * spools the wrong sheet. Instead the target is tagged only for the duration of
 * the print, and the isolation is undone in the same moment — nothing on the
 * page can be in a print-ready state except the one region actually being
 * printed.
 *
 * Isolation is done by walking up from the target to <body>, hiding every
 * sibling at each level and neutralising each ancestor's own positioning —
 * not by making the target `position: fixed`. A fixed element is repeated on
 * *every* page of paginated output by spec, so the moment a bill grew past
 * one physical page (a long purchase order, a printer that can't honour a
 * custom continuous size and falls back to A4), the whole document started
 * over on page two, on top of whatever had spilled there — which is exactly
 * the "overlapping, printed twice" symptom this replaces. With the target
 * left in normal document flow, a long document simply continues onto the
 * next page the way any ordinary multi-page document does.
 */
const MARKER = "data-billgod-printing";
const STYLE_ID = "billgod-print-style";

type Restore = () => void;

/**
 * Hides every sibling of `target` at every level up to (not including) `body`,
 * and strips positioning from the ancestors themselves, so the target is the
 * only thing left in the page's layout — starting flush at the top, free to
 * flow across as many printed pages as it actually needs. Returns a function
 * that undoes all of it.
 */
function isolateForPrint(target: HTMLElement): Restore {
  const restores: Restore[] = [];
  let node: HTMLElement | null = target;

  while (node && node !== document.body) {
    const parent: HTMLElement | null = node.parentElement;
    if (parent) {
      for (const sibling of Array.from(parent.children)) {
        if (sibling !== node && sibling instanceof HTMLElement) {
          const prevDisplay = sibling.style.display;
          sibling.style.setProperty("display", "none", "important");
          restores.push(() => {
            sibling.style.display = prevDisplay;
          });
        }
      }
    }

    // The target's own ancestors (a card, a tab panel, an off-screen "fixed,
    // parked at -9999px" wrapper used to keep a print target out of the live
    // page) can carry positioning that would otherwise drag the target along
    // with it — off the printed page entirely, in the off-screen case.
    if (node !== target) {
      const el = node;
      const prev = { position: el.style.position, left: el.style.left, top: el.style.top, transform: el.style.transform };
      el.style.setProperty("position", "static", "important");
      el.style.setProperty("left", "auto", "important");
      el.style.setProperty("top", "auto", "important");
      el.style.setProperty("transform", "none", "important");
      restores.push(() => {
        el.style.position = prev.position;
        el.style.left = prev.left;
        el.style.top = prev.top;
        el.style.transform = prev.transform;
      });
    }

    node = parent;
  }

  return () => restores.forEach((fn) => fn());
}

export class BrowserPrintService implements PrintService {
  isNative(): boolean {
    return false;
  }

  async print(job: PrintJob): Promise<void> {
    if (typeof window === "undefined") return;

    // A custom cut size has no fixed entry in PAGE_SIZES — its `@page` rule is
    // built from the millimetres the shop configured, same as a thermal roll
    // when no height is given (continuous, so the sheet grows with content).
    const page =
      job.format === "custom" && job.customSizeMm
        ? { css: `${job.customSizeMm.width}mm ${job.customSizeMm.height ? `${job.customSizeMm.height}mm` : "auto"}`, marginCss: "4mm" }
        : PAGE_SIZES[job.format as Exclude<PrintFormat, "custom">];
    const previousTitle = document.title;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      @media print {
        @page { size: ${page.css}; margin: 0; }
        html, body { background: #fff !important; margin: 0 !important; }
        [${MARKER}] {
          width: 100% !important;
          margin: 0 !important;
          background: #fff !important;
          color: #000 !important;
          box-shadow: none !important;
        }
      }
    `;

    job.element.setAttribute(MARKER, "");
    document.head.appendChild(style);
    const restore = isolateForPrint(job.element);
    if (job.title) document.title = job.title;

    try {
      // Give the browser a frame to apply the injected rules before the
      // (synchronous, blocking) print dialog snapshots the page.
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      window.print();
    } finally {
      restore();
      job.element.removeAttribute(MARKER);
      style.remove();
      document.title = previousTitle;
    }
  }
}
