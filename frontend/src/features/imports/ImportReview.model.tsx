export type ImportJob = {
  id: number;
  status: string;
  totalRows: number;
  processedRows: number;
  readyRows: number;
  invalidRows: number;
  duplicateRows: number;
  unmatchedRows: number;
  importedRows: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  file: { originalName: string };
  uploadedBy: { id: number; fullName: string };
};
export const STUCK_JOB_THRESHOLD_MS = 15 * 60 * 1_000;
export type ImportRow = {
  id: number;
  rowNumber: number;
  controllerId: string | null;
  fullName: string | null;
  school: string | null;
  districtName: string | null;
  status: string;
  issues: string[] | null;
};
export const ROW_STATUSES = [
  "READY",
  "INVALID",
  "DUPLICATE",
  "EXISTING",
  "OUT_OF_SCOPE",
  "IMPORTED",
  "FAILED",
];
export const statusTone = (status: string): "success" | "danger" | "warning" | "neutral" =>
  ["READY", "IMPORTED", "COMPLETED"].includes(status)
    ? "success"
    : ["INVALID", "DUPLICATE", "FAILED"].includes(status)
      ? "danger"
      : ["EXISTING", "OUT_OF_SCOPE", "PENDING", "PROCESSING"].includes(status)
        ? "warning"
        : "neutral";
export const DISTRICT_ISSUE_PATTERN = /district/i;
