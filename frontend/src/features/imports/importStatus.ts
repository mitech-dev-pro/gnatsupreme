type Summary = {
  status: string;
  readyRows: number;
  importedRows: number;
  invalidRows: number;
  duplicateRows: number;
  unmatchedRows: number;
};
export function importStage(job: Summary): {
  label: string;
  help: string;
  tone: "success" | "warning" | "danger" | "neutral";
} {
  if (job.status === "FAILED")
    return {
      label: "Import failed",
      tone: "danger",
      help: "Review the error. Retry an interrupted attempt, or upload a corrected file if the source needs changes.",
    };
  if (["PENDING", "PROCESSING"].includes(job.status))
    return {
      label: job.readyRows > 0 || job.importedRows > 0 ? "Enrolling members" : "Validating file",
      tone: "warning",
      help: "Work continues in the background. You can leave this page and return to the import.",
    };
  if (job.readyRows > 0)
    return {
      label: "Ready for enrollment",
      tone: "warning",
      help: "Validation is finished. Review the rows, then enroll the ready members. Existing members are skipped, never overwritten.",
    };
  const skipped = job.invalidRows + job.duplicateRows + job.unmatchedRows;
  if (job.importedRows > 0)
    return {
      label: skipped ? "Enrollment finished with skipped rows" : "Enrollment complete",
      tone: skipped ? "warning" : "success",
      help: skipped
        ? "Enrolled members are saved. Download corrections for skipped rows; already enrolled members will not be enrolled again."
        : "All eligible rows have been enrolled.",
    };
  return {
    label: "No members enrolled",
    tone: "neutral",
    help: "Review the row outcomes and download corrections. Existing records remain unchanged.",
  };
}
export const ROW_LABELS: Record<string, string> = {
  READY: "Ready to enroll",
  INVALID: "Needs correction",
  DUPLICATE: "Duplicate in file",
  EXISTING: "Existing member, skipped",
  OUT_OF_SCOPE: "Outside your access",
  IMPORTED: "Enrolled",
  FAILED: "Enrollment failed",
};
export function recoveryImportId(error: unknown) {
  const data = (
    error as { response?: { data?: { duplicateImport?: { id?: unknown }; importId?: unknown } } }
  )?.response?.data;
  const id = data?.duplicateImport?.id ?? data?.importId;
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0 ? id : null;
}
