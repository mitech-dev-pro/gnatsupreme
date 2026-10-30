import ExcelJS from "exceljs";
import type { Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { RECOVERY_HEADERS, recoveryValues } from "./member-import.service.js";
import { RECOVERY_STATUSES, recoveryAction } from "./member-import.recovery.js";

export async function writeMemberRecoveryWorkbook(jobId: number, response: Response) {
  response.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  response.setHeader(
    "Content-Disposition",
    `attachment; filename="member-import-${jobId}-corrections.xlsx"`,
  );
  response.setHeader("Cache-Control", "no-store");
  const book = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: response,
    useStyles: false,
    useSharedStrings: false,
  });
  const sheet = book.addWorksheet("Corrections");
  sheet.addRow(RECOVERY_HEADERS).commit();
  let lastRow = 0;
  while (!response.destroyed) {
    const rows = await prisma.memberBulkImportRow.findMany({
      where: {
        importJobId: jobId,
        status: { in: [...RECOVERY_STATUSES] },
        rowNumber: { gt: lastRow },
      },
      include: { region: { select: { name: true } } },
      orderBy: { rowNumber: "asc" },
      take: 1000,
    });
    if (!rows.length) break;
    for (const row of rows) {
      // Plain string cells cannot execute spreadsheet formulas. Keep source values verbatim.
      sheet
        .addRow([
          ...recoveryValues(row.rawData, row.employmentCategory, row.region?.name ?? null),
          row.rowNumber,
          row.status,
          Array.isArray(row.issues) ? row.issues.join("; ") : "",
          recoveryAction(row.status),
        ])
        .commit();
    }
    lastRow = rows.at(-1)!.rowNumber;
  }
  if (response.destroyed) return;
  sheet.commit();
  await book.commit();
}
