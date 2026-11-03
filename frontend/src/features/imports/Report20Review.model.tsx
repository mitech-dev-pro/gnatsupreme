export type ImportJob = {
  id: number;
  status: string;
  reportMonth: string | null;
  totalRows: number;
  processedRows: number;
  matchedRows: number;
  changedRows: number;
  unmatchedRows: number;
  duplicateRows: number;
  invalidRows: number;
  enrolledRows: number;
  flaggedForRemovalRows: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  file: { originalName: string };
  uploadedBy: { id: number; fullName: string };
};
export type ReportRow = {
  id: number;
  rowNumber: number;
  controllerId: string | null;
  fullName: string | null;
  districtName: string | null;
  school: string | null;
  status: string;
  issues: string[] | null;
  member: { id: number; controllerId: string; fullName: string } | null;
};
export const ROW_STATUSES = ["MATCHED", "CHANGED", "UNMATCHED", "DUPLICATE", "INVALID", "ENROLLED"];
export const STUCK_JOB_THRESHOLD_MS = 15 * 60 * 1_000;
export const ROW_STATUS_STYLES: Record<string, string> = {
  MATCHED: "bg-success-soft text-success",
  CHANGED: "bg-warning-soft text-warning-accent",
  UNMATCHED: "bg-danger-soft text-danger",
  DUPLICATE: "bg-danger-soft text-danger",
  INVALID: "bg-danger-soft text-danger",
  ENROLLED: "bg-success-soft text-success",
};
export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
