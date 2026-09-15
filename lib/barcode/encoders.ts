/**
 * Barcode symbologies encoded to bar/space widths, with no runtime dependency.
 *
 * Each encoder returns a `modules` array of 1s and 0s — one entry per narrow
 * module, 1 = bar — which the renderer turns into SVG rectangles. Keeping the
 * encoders pure (no DOM, no React) makes them testable and usable on either
 * side of the server boundary.
 */

export type Symbology = "code128" | "ean13" | "ean8" | "upca";

export const SYMBOLOGY_LABELS: Record<Symbology, string> = {
  code128: "Code 128",
  ean13: "EAN-13",
  ean8: "EAN-8",
  upca: "UPC-A",
};

export type EncodedBarcode = {
  /** 1 = bar, 0 = space, one entry per narrow module. */
  modules: number[];
  /** Human-readable text under the bars, already including any computed check digit. */
  text: string;
};

/* ------------------------------------------------------------------ Code 128 */

// Bar/space widths for each of the 107 Code 128 symbols, plus the stop pattern.
const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "233111",
];
const CODE128_STOP = "2331112";

const CODE128_START_B = 104;
const CODE128_START_C = 105;

function widthsToModules(widths: string, startsWithBar = true): number[] {
  const modules: number[] = [];
  let isBar = startsWithBar;
  for (const char of widths) {
    const width = Number(char);
    for (let i = 0; i < width; i += 1) modules.push(isBar ? 1 : 0);
    isBar = !isBar;
  }
  return modules;
}

/**
 * Code 128 with automatic B/C switching: runs of an even number of digits
 * (4+) encode two digits per symbol in set C, everything else uses set B.
 */
export function encodeCode128(value: string): EncodedBarcode {
  if (!value) throw new Error("Enter a value to encode.");
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 32 || code > 126) throw new Error("Code 128 here supports printable ASCII only.");
  }

  const codes: number[] = [];
  let index = 0;
  let mode: "B" | "C" | null = null;

  const digitRunLength = (from: number) => {
    let run = 0;
    while (from + run < value.length && value[from + run] >= "0" && value[from + run] <= "9") run += 1;
    return run;
  };

  while (index < value.length) {
    const run = digitRunLength(index);
    // Set C pays off from four digits in, and only for an even-length chunk.
    const useC = run >= 4 && (run % 2 === 0 || run >= 6);
    if (useC) {
      const evenRun = run % 2 === 0 ? run : run - 1;
      if (mode !== "C") {
        codes.push(mode === null ? CODE128_START_C : 99);
        mode = "C";
      }
      for (let i = 0; i < evenRun; i += 2) codes.push(Number(value.slice(index + i, index + i + 2)));
      index += evenRun;
    } else {
      if (mode !== "B") {
        codes.push(mode === null ? CODE128_START_B : 100);
        mode = "B";
      }
      codes.push(value.charCodeAt(index) - 32);
      index += 1;
    }
  }

  const startCode = codes[0];
  let checksum = startCode;
  for (let i = 1; i < codes.length; i += 1) checksum += codes[i] * i;
  codes.push(checksum % 103);

  const modules = codes.flatMap((code) => widthsToModules(CODE128_PATTERNS[code]));
  return { modules: [...modules, ...widthsToModules(CODE128_STOP)], text: value };
}

/* --------------------------------------------------------------- EAN / UPC */

const EAN_L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const EAN_G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const EAN_R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
/** Which of the first six digits use the G table, selected by the leading digit. */
const EAN13_PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

const GUARD_START = "101";
const GUARD_CENTRE = "01010";
const GUARD_END = "101";

function toModules(bits: string): number[] {
  return [...bits].map((bit) => (bit === "1" ? 1 : 0));
}

/** Standard EAN/UPC modulo-10 check digit: weights alternate 3 and 1 from the right. */
export function eanCheckDigit(digits: string): number {
  let sum = 0;
  const reversed = [...digits].reverse();
  for (let i = 0; i < reversed.length; i += 1) {
    sum += Number(reversed[i]) * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

function normaliseDigits(value: string, expected: number, name: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === expected - 1) return digits + String(eanCheckDigit(digits));
  if (digits.length === expected) {
    const body = digits.slice(0, expected - 1);
    if (String(eanCheckDigit(body)) !== digits[expected - 1]) {
      throw new Error(`${name} check digit doesn't match — expected ${eanCheckDigit(body)}.`);
    }
    return digits;
  }
  throw new Error(`${name} needs ${expected - 1} or ${expected} digits, got ${digits.length}.`);
}

export function encodeEan13(value: string): EncodedBarcode {
  const digits = normaliseDigits(value, 13, "EAN-13");
  const parity = EAN13_PARITY[Number(digits[0])];
  let bits = GUARD_START;
  for (let i = 1; i <= 6; i += 1) {
    const digit = Number(digits[i]);
    bits += parity[i - 1] === "L" ? EAN_L[digit] : EAN_G[digit];
  }
  bits += GUARD_CENTRE;
  for (let i = 7; i <= 12; i += 1) bits += EAN_R[Number(digits[i])];
  bits += GUARD_END;
  return { modules: toModules(bits), text: digits };
}

export function encodeEan8(value: string): EncodedBarcode {
  const digits = normaliseDigits(value, 8, "EAN-8");
  let bits = GUARD_START;
  for (let i = 0; i < 4; i += 1) bits += EAN_L[Number(digits[i])];
  bits += GUARD_CENTRE;
  for (let i = 4; i < 8; i += 1) bits += EAN_R[Number(digits[i])];
  bits += GUARD_END;
  return { modules: toModules(bits), text: digits };
}

/** UPC-A is EAN-13 with a leading zero, so it shares the encoding and prints 12 digits. */
export function encodeUpcA(value: string): EncodedBarcode {
  const digits = normaliseDigits(value, 12, "UPC-A");
  const asEan = encodeEan13(`0${digits}`);
  return { modules: asEan.modules, text: digits };
}

export function encodeBarcode(symbology: Symbology, value: string): EncodedBarcode {
  switch (symbology) {
    case "code128":
      return encodeCode128(value);
    case "ean13":
      return encodeEan13(value);
    case "ean8":
      return encodeEan8(value);
    case "upca":
      return encodeUpcA(value);
  }
}

/** The caption is user-supplied, and the SVG is injected as markup — escape it. */
function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&apos;";
    }
  });
}

/** Renders an encoded symbol as a standalone SVG string — printable and copy-pasteable. */
export function barcodeToSvg(
  encoded: EncodedBarcode,
  options: { moduleWidth?: number; height?: number; showText?: boolean; textSize?: number; targetWidth?: number; targetHeight?: number } = {}
): string {
  const moduleWidth = options.moduleWidth ?? 2;
  const height = options.height ?? 60;
  const showText = options.showText ?? true;
  const textSize = options.textSize ?? 11;
  const quietZone = 10 * moduleWidth;
  const width = encoded.modules.length * moduleWidth + quietZone * 2;
  const totalHeight = height + (showText ? textSize + 4 : 0);
  // Bars are laid out in this natural coordinate space; `targetWidth`/`targetHeight`
  // (below) let a caller stretch the rendered SVG to any display size independently
  // in each axis without recomputing bar geometry — the viewBox scaling stays vector,
  // so it never blurs.
  const displayWidth = options.targetWidth ?? width;
  const displayHeight = options.targetHeight ?? totalHeight;

  const bars: string[] = [];
  let index = 0;
  while (index < encoded.modules.length) {
    if (encoded.modules[index] === 1) {
      let run = 1;
      while (encoded.modules[index + run] === 1) run += 1;
      bars.push(
        `<rect x="${quietZone + index * moduleWidth}" y="0" width="${run * moduleWidth}" height="${height}" fill="#000"/>`
      );
      index += run;
    } else {
      index += 1;
    }
  }

  const text = showText
    ? `<text x="${width / 2}" y="${totalHeight - 1}" text-anchor="middle" font-family="monospace" font-size="${textSize}" fill="#000">${escapeXml(encoded.text)}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${displayWidth}" height="${displayHeight}" viewBox="0 0 ${width} ${totalHeight}" preserveAspectRatio="none"><rect width="${width}" height="${totalHeight}" fill="#fff"/>${bars.join("")}${text}</svg>`;
}

/**
 * Expands a starting code into a run, incrementing or decrementing the numeric
 * tail while preserving any prefix and zero padding ("ITEM-0008" -> "ITEM-0009").
 */
export function generateSequence(start: string, count: number, step: number): string[] {
  const match = start.match(/^(.*?)(\d+)$/);
  if (!match) return Array.from({ length: count }, () => start);
  const [, prefix, digits] = match;
  const width = digits.length;
  const startValue = Number(digits);
  return Array.from({ length: count }, (_, i) => {
    const next = startValue + i * step;
    if (next < 0) return `${prefix}${"0".repeat(width)}`;
    return `${prefix}${String(next).padStart(width, "0")}`;
  });
}
