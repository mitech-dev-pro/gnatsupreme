import { importStage, ROW_LABELS } from "./importStatus";
import Dialog from "@/components/ui/Dialog";
import Button from "@/components/ui/Button";
import ConfirmationPanel from "@/components/ui/ConfirmationPanel";
import Dropdown from "@/components/ui/Dropdown";
import { Alert, EmptyState, TableSkeleton } from "@/components/ui/Feedback";
import PageHeader from "@/components/ui/PageHeader";
import Pagination from "@/components/ui/Pagination";
import StatusBadge from "@/components/ui/StatusBadge";
import TableFrame from "@/components/ui/TableFrame";
import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import {
  DISTRICT_ISSUE_PATTERN,
  ROW_STATUSES,
  statusTone,
  STUCK_JOB_THRESHOLD_MS,
} from "./ImportReview.model";
import { useImportReview } from "./useImportReview";
export default function ImportReview() {
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
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
    rowsError,
    totalRows,
    refresh,
    downloadCorrections,
    exporting,
    confirmingCommit,
    setConfirmingCommit,
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
    return (
      <Alert tone="error">
        {error}{" "}
        <button className="underline" onClick={() => void refresh()}>
          Try again
        </button>
      </Alert>
    );
  }
  if (!job) return null;
  const stage = importStage(job);
  const active = ["PENDING", "PROCESSING"].includes(job.status);
  const canCommit = job.status === "COMPLETED" && job.readyRows > 0;
  const isStuck =
    (job.status === "PENDING" || job.status === "PROCESSING") &&
    checkedAt - new Date(job.updatedAt).getTime() > STUCK_JOB_THRESHOLD_MS;
  return (
    <div>
      <Link
        to="/members/upload"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-text-strong"
      >
        &larr; Import history
      </Link>

      <PageHeader
        eyebrow="Member import review"
        title={job.file.originalName}
        description={`Uploaded by ${job.uploadedBy.fullName}`}
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <Button variant="secondary" size="sm" onClick={() => void refresh()}>
              Refresh import
            </Button>
            <StatusBadge tone={stage.tone}>{stage.label}</StatusBadge>
            {(isStuck || job.status === "FAILED") && (
              <button
                type="button"
                onClick={() => setConfirmingRerun(true)}
                disabled={rerunning}
                className="rounded-lg border border-border-default px-3.5 py-2 text-sm font-semibold text-text-strong transition hover:border-action-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {rerunning
                  ? "Retrying…"
                  : job.status === "FAILED"
                    ? "Retry failed import"
                    : "Retry stalled import"}
              </button>
            )}
          </div>
        }
      />

      <div className="mb-4">
        <Alert tone={stage.tone === "danger" ? "error" : "info"}>{stage.help}</Alert>
      </div>
      {job.errorMessage && (
        <div className="mb-4">
          <Alert tone="error">{job.errorMessage}</Alert>
        </div>
      )}
      {job.status === "FAILED" && (
        <p className="mb-4 text-sm text-text-muted">
          If the source file needs changes,{" "}
          <Link to="/members/upload" className="font-semibold text-action-primary underline">
            upload a corrected file
          </Link>
          . Retry resumes processing using the saved source.
        </p>
      )}
      {confirmingCommit && (
        <Dialog
          title={`Enroll ${job.readyRows.toLocaleString()} ready ${job.readyRows === 1 ? "member" : "members"}?`}
          description="These rows will become active member records. Existing members and rows needing correction are skipped."
          busy={committing}
          onClose={() => setConfirmingCommit(false)}
        >
          <p className="text-sm text-text-muted">
            Review the ready rows before confirming. Enrollment continues in the background.
          </p>
          {error && <Alert tone="error">{error}</Alert>}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="secondary"
              disabled={committing}
              onClick={() => setConfirmingCommit(false)}
            >
              Keep reviewing
            </Button>
            <Button
              loading={committing}
              loadingLabel="Starting enrollment…"
              onClick={() => void handleCommit()}
            >
              Confirm enrollment
            </Button>
          </div>
        </Dialog>
      )}
      {confirmingRerun && (
        <div className="mb-4">
          <ConfirmationPanel
            title="Retry this import?"
            description="Retry validation if no rows were staged, or resume ready rows after interrupted enrollment. Enrolled rows remain saved. Rows with field errors need a corrected file."
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
                    role="progressbar"
                    aria-label="Import progress"
                    aria-valuemin={0}
                    aria-valuemax={job.totalRows}
                    aria-valuenow={Math.min(job.totalRows, job.processedRows)}
                    className="h-full origin-left rounded-full bg-action-primary transition-transform duration-500 motion-reduce:transition-none"
                    style={{
                      transform: `scaleX(${Math.min(1, job.processedRows / job.totalRows)})`,
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

      <dl className="mb-5 grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl border border-border-default bg-(--surface-raised) p-4 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["File rows", job.totalRows, "text-text-strong"],
          ["Ready", job.readyRows, "text-success"],
          ["Needs correction", job.invalidRows, "text-danger"],
          ["Duplicate in file", job.duplicateRows, "text-warning"],
          ["Existing / outside access", job.unmatchedRows, "text-text-muted"],
          ["Enrolled", job.importedRows, "text-success"],
        ].map(([label, value, tone]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs font-semibold text-text-muted">{label}</dt>
            <dd className={`mt-1 text-lg font-bold tabular-nums ${tone}`}>{value}</dd>
          </div>
        ))}
      </dl>

      {canCommit && (
        <div className="mb-5">
          <Button
            onClick={() => setConfirmingCommit(true)}
            disabled={rerunning}
            loading={committing}
            loadingLabel="Enrolling…"
          >
            {committing
              ? "Enrolling…"
              : `Enroll ${job.readyRows.toLocaleString()} ready ${job.readyRows === 1 ? "member" : "members"}`}
          </Button>
        </div>
      )}

      {!active && job.invalidRows + job.duplicateRows + job.unmatchedRows > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            loading={exporting}
            loadingLabel="Preparing download…"
            onClick={() => void downloadCorrections()}
          >
            Download corrections (.xlsx)
          </Button>
          <Link to="/members/upload" className="text-sm font-semibold text-action-primary">
            Upload corrected rows
          </Link>
          <p className="w-full max-w-prose text-xs text-text-muted">
            The workbook contains skipped rows and their issues, with original values kept for
            editing. Existing members are marked for review, not updates. Upload corrected rows with
            the same staff type; duplicates are checked again.
          </p>
        </div>
      )}
      <div className="mb-4">
        <Dropdown
          aria-label="Filter import rows by outcome"
          className="w-56"
          value={rowStatus}
          onChange={(value) => {
            setRowStatus(value);
            setPage(1);
          }}
          options={[
            { value: "", label: "All rows" },
            ...ROW_STATUSES.map((s) => ({ value: s, label: ROW_LABELS[s] ?? s })),
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
            <th className="px-4 py-2.5">Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading && rows.length === 0 ? (
            <TableSkeleton columns={7} />
          ) : rowsError && rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="p-5 text-sm text-danger">
                Rows could not be checked. Use Refresh import to try again.
              </td>
            </tr>
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
                row.districtName &&
                row.issues?.some((issue) => DISTRICT_ISSUE_PATTERN.test(issue)) &&
                !active &&
                ["INVALID", "OUT_OF_SCOPE"].includes(row.status);
              return (
                <Fragment key={row.id}>
                  <tr className="border-b border-border-default last:border-0">
                    <td className="px-4 py-2.5 text-text-muted">{row.rowNumber}</td>
                    <td className="px-4 py-2.5 text-ink">{row.controllerId ?? "—"}</td>
                    <td className="px-4 py-2.5 text-ink">{row.fullName ?? "—"}</td>
                    <td className="px-4 py-2.5 text-text-muted">
                      {row.districtName ??
                        (row.employmentCategory === "NON_TEACHING"
                          ? "Non-teaching (no district)"
                          : "—")}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge tone={statusTone(row.status)}>
                        {ROW_LABELS[row.status] ?? row.status}
                      </StatusBadge>
                    </td>
                    <td
                      className={`px-4 py-2.5 ${["INVALID", "FAILED"].includes(row.status) ? "text-danger" : "text-text-muted"}`}
                    >
                      {row.issues && row.issues.length > 0 ? (
                        <ul className="list-disc space-y-1 pl-4">
                          {row.issues.map((issue, index) => (
                            <li key={index}>{issue}</li>
                          ))}
                        </ul>
                      ) : (
                        "None"
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        aria-expanded={expandedRowId === row.id}
                        aria-controls={`source-row-${row.id}`}
                        className="mr-3 text-xs font-semibold text-action-primary hover:underline"
                        onClick={() =>
                          setExpandedRowId((current) => (current === row.id ? null : row.id))
                        }
                      >
                        {expandedRowId === row.id ? "Hide row" : "View row"}
                      </button>
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
                  {expandedRowId === row.id && (
                    <tr id={`source-row-${row.id}`}>
                      <td
                        colSpan={7}
                        className="border-b border-border-default bg-surface-subtle p-4"
                      >
                        <h3 className="mb-3 text-sm font-bold text-ink">
                          Source values for spreadsheet row {row.rowNumber}
                        </h3>
                        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          {Object.entries(
                            row.rawData ?? {
                              "Controller ID": row.controllerId,
                              "Full name": row.fullName,
                              School: row.school,
                              District: row.districtName,
                            },
                          )
                            .filter(
                              ([key]) =>
                                !["Original Row", "Import Status", "Issues", "Next Step"].includes(
                                  key,
                                ),
                            )
                            .map(([key, value]) => (
                              <div key={key} className="min-w-0">
                                <dt className="text-xs font-semibold text-text-muted">{key}</dt>
                                <dd className="mt-1 whitespace-pre-wrap wrap-anywhere text-sm text-ink">
                                  {value === null || value === undefined || value === ""
                                    ? "Not provided"
                                    : typeof value === "object"
                                      ? JSON.stringify(value)
                                      : String(value)}
                                </dd>
                              </div>
                            ))}
                        </dl>
                      </td>
                    </tr>
                  )}
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

      <Pagination
        page={page}
        totalPages={totalPages}
        totalItems={totalRows}
        itemLabel="rows"
        onPageChange={setPage}
      />
    </div>
  );
}
