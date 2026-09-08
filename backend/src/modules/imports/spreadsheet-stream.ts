import { createReadStream } from "node:fs";

import ExcelJS from "exceljs";
import { parse as parseCsv } from "fast-csv";

// Shared by parseReport20 (report20.service.ts) and stageMemberImport's spreadsheetRows
// (member-import.service.ts) -- both used to load an entire workbook into memory via
// workbook.xlsx.readFile / workbook.csv.readFile before extracting rows, which builds ExcelJS's
// full in-memory object model (every cell, with styles) for the whole file before a single row
// could be discarded. For a large payroll file (tens of thousands of rows) this was the direct
// cause of a V8 heap OOM crash-loop in the worker process. This module streams rows one at a
// time instead -- each row's ExcelJS objects are extracted into a plain string array and then
// eligible for GC before the next row is read, so peak memory no longer scales with file size the
// way a fully-materialized workbook does.
export const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type SpreadsheetRow = {
  rowNumber: number;
  // 1-indexed to match ExcelJS's own column numbering (and this file's callers, which already
  // used `row.getCell(column)` with 1-based columns) -- index 0 is always empty.
  cells: string[];
};

export function cellAt(cells: string[], column: number): string {
  return cells[column] ?? "";
}

export async function* streamSpreadsheetRows(
  filePath: string,
  mimeType: string,
): AsyncGenerator<SpreadsheetRow> {
  if (mimeType === XLSX_MIME_TYPE) yield* streamXlsxRows(filePath);
  else yield* streamCsvRows(filePath);
}

async function* streamXlsxRows(filePath: string): AsyncGenerator<SpreadsheetRow> {
  const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    // Defaults already match what we want (worksheets: 'emit', sharedStrings: 'cache',
    // hyperlinks: 'ignore', styles: 'ignore', entries: 'ignore') -- shared strings still need to
    // be cached to resolve string cell values at all, but that table is tiny compared to holding
    // every cell/style of the whole sheet. Spelled out here so the low-memory intent survives a
    // future ExcelJS default change, rather than relying on defaults staying the same.
    worksheets: "emit",
    sharedStrings: "cache",
    hyperlinks: "ignore",
    styles: "ignore",
    entries: "ignore",
  });
  for await (const worksheetReader of workbookReader) {
    for await (const row of worksheetReader) {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, column) => {
        cells[column] = cell.text?.trim() ?? "";
      });
      yield { rowNumber: row.number, cells };
    }
    // Only the first worksheet is ever used by either caller (mirrors the prior
    // `workbook.worksheets[0]` behavior) -- stop after it instead of reading any further sheets
    // the file might contain.
    break;
  }
}

async function* streamCsvRows(filePath: string): AsyncGenerator<SpreadsheetRow> {
  const stream = createReadStream(filePath).pipe(parseCsv({ headers: false }));
  let rowNumber = 0;
  for await (const record of stream as unknown as AsyncIterable<string[]>) {
    rowNumber += 1;
    const cells: string[] = [""];
    for (const value of record) cells.push((value ?? "").trim());
    yield { rowNumber, cells };
  }
}
