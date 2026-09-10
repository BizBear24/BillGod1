import "server-only";

/**
 * Real .xlsx generation, done on the server.
 *
 * The alternative — dumping CSV with an .xls extension — is what most small
 * apps ship, and Excel shows a "the file format doesn't match" warning every
 * time it is opened. This produces an actual OOXML workbook, so numbers stay
 * numbers, dates stay dates, and multiple sheets fit in one file. It runs
 * server-side so the ~1MB writer never reaches the browser bundle.
 */

export type SheetSpec = {
  name: string;
  headers: string[];
  /** Numbers are written as numbers so Excel can sum them without a re-type. */
  rows: (string | number | null)[][];
};

/** Excel rejects these in a sheet name, and caps the name at 31 characters. */
function safeSheetName(name: string, index: number): string {
  const cleaned = name.replace(/[*?:\\/[\]]/g, " ").trim();
  return (cleaned || `Sheet${index + 1}`).slice(0, 31);
}

export async function buildWorkbook(sheets: SheetSpec[], title: string): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "BillGod";
  workbook.created = new Date();
  workbook.title = title;

  sheets.forEach((spec, index) => {
    const sheet = workbook.addWorksheet(safeSheetName(spec.name, index));

    const header = sheet.addRow(spec.headers);
    header.font = { bold: true };
    header.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
      cell.border = { bottom: { style: "thin", color: { argb: "FFBFBFBF" } } };
    });

    for (const row of spec.rows) sheet.addRow(row);

    // Freeze the header so long registers stay readable while scrolling, and
    // size each column to its widest cell rather than leaving ####### behind.
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.columns.forEach((column, columnIndex) => {
      let widest = spec.headers[columnIndex]?.length ?? 10;
      for (const row of spec.rows) {
        const value = row[columnIndex];
        const length = value === null || value === undefined ? 0 : String(value).length;
        if (length > widest) widest = length;
      }
      column.width = Math.min(Math.max(widest + 2, 10), 50);
      if (columnIndex > 0 && spec.rows.some((row) => typeof row[columnIndex] === "number")) {
        column.numFmt = "#,##0.00";
        column.alignment = { horizontal: "right" };
      }
    });

    if (spec.rows.length > 0) {
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: spec.headers.length } };
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
