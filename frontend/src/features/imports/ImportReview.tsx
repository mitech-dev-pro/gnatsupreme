import Button from "@/components/ui/Button";
import ConfirmationPanel from "@/components/ui/ConfirmationPanel";
import Dropdown from "@/components/ui/Dropdown";
import { Alert, EmptyState, TableSkeleton } from "@/components/ui/Feedback";
import PageHeader from "@/components/ui/PageHeader";
import Pagination from "@/components/ui/Pagination";
import StatusBadge from "@/components/ui/StatusBadge";
import TableFrame from "@/components/ui/TableFrame";
import { Fragment } from "react";
import { Link } from "react-router-dom";
import {
  DISTRICT_ISSUE_PATTERN,
  ROW_STATUSES,
  statusTone,
  STUCK_JOB_THRESHOLD_MS,
} from "./ImportReview.model";
import { useImportReview } from "./useImportReview";
export default function ImportReview() {
  const {
    checkedAt,
    districts,
    job,
    rows,
    page,
    setPage,
    totalPages,
    rowStatus,
    setRowStatus,
    loading,
    error,
    committing,
    rerunning,
    confirmingRerun,
    setConfirmingRerun,
    rerunMessage,
    mappingRowId,
    setMappingRowId,
    mappingDistrictId,
    setMappingDistrictId,
    mappingBusy,
    mappingMessage,
    rerun,
    handleCommit,
    submitDistrictMapping,
  } = useImportReview();
  if (loading && !job) {
    return (
      <div className="rounded-xl border border-border-default bg-(--surface-raised) p-5">
        <table className="w-full">
          <tbody>
            <TableSkeleton columns={4} rows={5} />
          </tbody>
        </table>
      </div>
    );
  }
  if (error && !job) {
    return <Alert tone="error">{error}</Alert>;
  }
  if (!job) return null;
  const canCommit = job.status === "COMPLETED" && job.readyRows > 0;
  const isStuck =
    (job.status === "PENDING" || job.status === "PROCESSING") &&
    checkedAt - new Date(job.updatedAt).getTime() > STUCK_JOB_THRESHOLD_MS;
  return (
    <div>
      <Link
        to="/members"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-text-strong"
      >
        &larr; All Members
      </Link>

      <PageHeader
        eyebrow="Member import review"
        title={job.file.originalName}
        description={`Uploaded by ${job.uploadedBy.fullName}`}
        actions={
          <div className="flex items-center gap-2.5">
            <StatusBadge tone={statusTone(job.status)}>
              {job.status.charAt(0) + job.status.slice(1).toLowerCase()}
            </StatusBadge>
            {isStuck && (
              <button
                type="button"
                onClick={() => setConfirmingRerun(true)}
                disabled={rerunning}
                className="rounded-lg border border-border-default px-3.5 py-2 text-sm font-semibold text-text-strong transition hover:border-action-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {rerunning ? "Retrying…" : "Retry (appears stuck)"}
              </button>
            )}
          </div>
        }
      />

      {confirmingRerun && (
        <div className="mb-4">
          <ConfirmationPanel
            title="Retry this import?"
            description="This import hasn't made progress in a while and appears stuck — its worker likely stopped mid-run. Retrying picks up from where it left off: rows already imported are left alone, and only unfinished work resumes."
            confirmLabel="Retry import"
            busyLabel="Starting…"
            tone="warning"
            confirmVariant="primary"
            busy={rerunning}
            onConfirm={() => void rerun()}
            onCancel={() => setConfirmingRerun(false)}
          />
        </div>
      )}

      {rerunMessage && (
        <div className="mb-4">
          <Alert tone="success">{rerunMessage}</Alert>
        </div>
      )}

      {error && (
        <div className="mb-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      {mappingMessage && (
        <div className="mb-4">
          <Alert tone="info">{mappingMessage}</Alert>
        </div>
      )}

      {(job.status === "PENDING" || job.status === "PROCESSING") && (
        <div className="mb-4">
          <Alert tone="info">
            {job.totalRows > 0 ? (
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <span>
                    Processing row {job.processedRows.toLocaleString()} of{" "}
                    {job.totalRows.toLocaleString()}
                  </span>
                  <span>
                    {Math.min(100, Math.round((job.processedRows / job.totalRows) * 100))}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/60">
                  <div
                    className="h-full rounded-full bg-action-primary transition-[width] duration-500"
                    style={{
                      width: `${Math.min(100, Math.round((job.processedRows / job.totalRows) * 100))}%`,
                    }}
                  />
                </div>
                <p className="mt-1.5 text-xs font-normal">
                  Processing continues in the background. This page refreshes automatically.
                </p>
              </div>
            ) : (
              "Reading the file. This can take a moment for large uploads."
            )}
          </Alert>
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {[
          ["Total", job.totalRows, "#1e2761"],
          ["Ready", job.readyRows, "#17805f"],
          ["Invalid", job.invalidRows, "#c23b3b"],
          ["Duplicate", job.duplicateRows, "#c23b3b"],
          ["Existing / Out of Scope", job.unmatchedRows, "#b9791a"],
          ["Imported", job.importedRows, "#17805f"],
        ].map(([label, value, color]) => (
          <div key={label} className="rounded-xl border border-border-default bg-white p-3">
            <div className="text-xs font-semibold text-text-muted">{label}</div>
            <div className="mt-1 text-lg font-extrabold" style={{ color: color as string }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {canCommit && (
        <div className="mb-5">
          <Button onClick={handleCommit} loading={committing} loadingLabel="Enrolling…">
            {committing ? "Enrolling…" : `Enroll ${job.readyRows} Ready Row(s)`}
          </Button>
        </div>
      )}

      <div className="mb-4">
        <Dropdown
          className="w-56"
          value={rowStatus}
          onChange={(value) => {
            setRowStatus(value);
            setPage(1);
          }}
          options={[
            { value: "", label: "All rows" },
            ...ROW_STATUSES.map((s) => ({ value: s, label: s })),
          ]}
        />
      </div>

      <TableFrame label="Import rows" className="min-w-180">
        <thead>
          <tr className="border-b border-border-default bg-surface-hover text-xs font-semibold uppercase tracking-wide text-text-muted">
            <th className="px-4 py-2.5">Row</th>
            <th className="px-4 py-2.5">Controller ID</th>
            <th className="px-4 py-2.5">Name</th>
            <th className="px-4 py-2.5">District</th>
            <th className="px-4 py-2.5">Status</th>
            <th className="px-4 py-2.5">Issues</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <TableSkeleton columns={7} />
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={7}>
                <EmptyState
                  title="No rows found"
                  description="Rows matching this status filter will appear here."
                />
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const hasDistrictIssue =
                row.districtName && row.issues?.some((issue) => DISTRICT_ISSUE_PATTERN.test(issue));
              return (
                <Fragment key={row.id}>
                  <tr className="border-b border-border-default last:border-0">
                    <td className="px-4 py-2.5 text-text-muted">{row.rowNumber}</td>
                    <td className="px-4 py-2.5 text-ink">{row.controllerId ?? "—"}</td>
                    <td className="px-4 py-2.5 text-ink">{row.fullName ?? "—"}</td>
                    <td className="px-4 py-2.5 text-text-muted">{row.districtName ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge tone={statusTone(row.status)}>
                        {row.status.replaceAll("_", " ").toLowerCase()}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-2.5 text-danger">
                      {row.issues && row.issues.length > 0 ? row.issues.join("; ") : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {hasDistrictIssue && (
                        <button
                          type="button"
                          onClick={() =>
                            setMappingRowId((current) => (current === row.id ? null : row.id))
                          }
                          className="text-xs font-semibold text-action-primary hover:underline"
                        >
                          Map District
                        </button>
                      )}
                    </td>
                  </tr>
                  {mappingRowId === row.id && (
                    <tr className="border-b border-border-default bg-surface-hover last:border-0">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="text-sm text-text-muted">
                            Map "{row.districtName}" to:
                          </span>
                          <Dropdown
                            className="w-64"
                            value={mappingDistrictId}
                            onChange={setMappingDistrictId}
                            placeholder="Select a district…"
                            options={districts.map((d) => ({
                              value: String(d.id),
                              label: `${d.name} · ${d.region.name}`,
                            }))}
                          />
                          <button
                            type="button"
                            onClick={() => submitDistrictMapping(row)}
                            disabled={mappingBusy || !mappingDistrictId}
                            className="rounded-lg bg-action-primary px-3.5 py-1.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {mappingBusy ? "Saving…" : "Save Mapping"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setMappingRowId(null)}
                            className="text-xs font-semibold text-text-muted"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })
          )}
        </tbody>
      </TableFrame>

      <Pagination page={page} totalPages={totalPages} itemLabel="rows" onPageChange={setPage} />
    </div>
  );
}
