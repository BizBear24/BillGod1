import "server-only";
import { Readable } from "node:stream";

/**
 * Reads an uploaded .xlsx or .csv into plain rows.
 *
 * Both formats go through ExcelJS so quoting, embedded commas, newlines
 * inside a cell and Excel's own date handling behave the same either way —
 * hand-rolling a CSV splitter is exactly how imports start mangling names
 * with commas in them.
 */

export type SheetData = {
  /** First row, trimmed. Blank trailing columns are dropped. */
  headers: string[];
  /** Every row after the header, padded to the header length. */
  rows: (string | number | boolean | Date | null)[][];
  sheetName: string;
};

export class ImportReadError extends Error {}

function cellValue(value: unknown): string | number | boolean | Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") return value;

  // ExcelJS wraps formulas, hyperlinks and rich text in objects.
  const record = value as Record<string, unknown>;
  if (typeof record.result === "number" || typeof record.result === "string") return record.result;
  if (typeof record.text === "string") return record.text;
  if (Array.isArray(record.richText)) return record.richText.map((part) => (part as { text: string }).text).join("");
  if (typeof record.hyperlink === "string") return String(record.text ?? record.hyperlink);
  return String(value);
}

export async function readSpreadsheet(buffer: Buffer, fileName: string): Promise<SheetData> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const isCsv = /\.csv$/i.test(fileName);

  try {
    if (isCsv) {
      const stream = Readable.from(buffer);
      // Everything is read as text; the column mapping decides what a number is.
      await workbook.csv.read(stream, { parserOptions: { headers: false } });
    } else {
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    }
  } catch (err) {
    throw new ImportReadError(
      `Could not read that file${err instanceof Error && err.message ? ` — ${err.message}` : ""}. Save it as .xlsx or .csv and try again.`
    );
  }

  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount === 0) throw new ImportReadError("That file has no rows in it.");

  const rawRows: (string | number | boolean | Date | null)[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    // ExcelJS row.values is 1-based with a hole at index 0.
    const values = (row.values as unknown[]).slice(1).map(cellValue);
    rawRows.push(values);
  });

  if (rawRows.length === 0) throw new ImportReadError("That file has no rows in it.");

  const headerRow = rawRows[0].map((v) => (v === null ? "" : String(v).trim()));
  while (headerRow.length > 0 && headerRow[headerRow.length - 1] === "") headerRow.pop();
  if (headerRow.length === 0) throw new ImportReadError("The first row must be the column headings.");

  const rows = rawRows
    .slice(1)
    .map((row) => {
      const padded = headerRow.map((_, i) => row[i] ?? null);
      return padded;
    })
    .filter((row) => row.some((cell) => cell !== null && String(cell).trim() !== ""));

  return { headers: headerRow, rows, sheetName: sheet.name };
}
