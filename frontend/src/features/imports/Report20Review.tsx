import ConfirmationPanel from "@/components/ui/ConfirmationPanel";
import Dropdown from "@/components/ui/Dropdown";
import { Fragment } from "react";
import { Link } from "react-router-dom";
import {
  ROW_STATUSES,
  ROW_STATUS_STYLES,
  STUCK_JOB_THRESHOLD_MS,
  formatDate,
} from "./Report20Review.model";
import { useReport20Review } from "./useReport20Review";
export default function Report20Review() {
  const {
    checkedAt,
    job,
    rows,
    page,
    setPage,
    totalPages,
    rowStatus,
    setRowStatus,
    initialLoading,
    refreshing,
    error,
    rerunning,
    confirmingRerun,
    setConfirmingRerun,
    rerunMessage,
    districts,
    actionRowId,
    setActionRowId,
    actionMode,
    actionDistrictId,
    setActionDistrictId,
    actionBusy,
    actionError,
    actionMessage,
    openAction,
    submitResolve,
    submitAlias,
    rerun,
  } = useReport20Review();
  if (!job && error) {
    return (
      <div className="rounded-xl border border-border-default bg-white p-6 text-sm text-danger">
        {error}
      </div>
    );
  }
  if (!job) {
    return <div className="text-sm text-text-muted">Loading…</div>;
  }
  const isStuck =
    (job.status === "PENDING" || job.status === "PROCESSING") &&
    checkedAt - new Date(job.updatedAt).getTime() > STUCK_JOB_THRESHOLD_MS;
  return (
    <div>
      <Link
        to="/imports/report20"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-text-strong"
      >
        &larr; Report 20 Uploads
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-text-strong">{job.file.originalName}</h1>
          <div className="mt-1 text-sm text-text-muted">
            Uploaded by {job.uploadedBy.fullName}
            {job.reportMonth ? ` · ${formatDate(job.reportMonth)}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="rounded-full bg-info-soft px-3 py-1 text-xs font-bold text-text-strong">
            {job.status}
          </span>
          {(job.status === "COMPLETED" || isStuck) && (
            <button
              type="button"
              onClick={() => setConfirmingRerun(true)}
              disabled={rerunning}
              className="rounded-lg border border-border-default px-3.5 py-2 text-sm font-semibold text-text-strong transition hover:border-action-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {rerunning
                ? "Re-running…"
                : isStuck
                  ? "Retry (appears stuck)"
                  : "Re-run Reconciliation"}
            </button>
          )}
        </div>
      </div>

      {confirmingRerun && (
        <div className="mb-4">
          <ConfirmationPanel
            title="Re-run this reconciliation?"
            description={
              isStuck
                ? "This reconciliation hasn't made progress in a while and appears stuck. Retrying will restart it from scratch against the current member list."
                : "The file will be checked against the current member list. Existing reconciliation rows for this upload will be replaced."
            }
            confirmLabel="Re-run reconciliation"
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
        <div className="mb-4 rounded-lg bg-success-soft px-3 py-2 text-sm font-semibold text-success">
          {rerunMessage}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">
          {error}
        </div>
      )}

      {job.errorMessage && (
        <div className="mb-4 rounded-lg bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">
          {job.errorMessage}
        </div>
      )}

      {(job.status === "PENDING" || job.status === "PROCESSING") && (
        <div className="mb-4 rounded-lg bg-info-soft px-3 py-3 text-sm font-semibold text-text-strong">
          {job.totalRows > 0 ? (
            <>
              <div className="mb-1.5 flex items-center justify-between">
                <span>
                  Processing row {job.processedRows.toLocaleString()} of{" "}
                  {job.totalRows.toLocaleString()}
                </span>
                <span>{Math.min(100, Math.round((job.processedRows / job.totalRows) * 100))}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/60">
                <div
                  className="h-full rounded-full bg-action-primary transition-[width] duration-500"
                  style={{
                    width: `${Math.min(100, Math.round((job.processedRows / job.totalRows) * 100))}%`,
                  }}
                />
              </div>
            </>
          ) : (
            "Reading the file… this can take a moment for large uploads."
          )}
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-8">
        {[
          ["Total", job.totalRows, "#1e2761"],
          ["Matched", job.matchedRows, "#17805f"],
          ["Changed", job.changedRows, "#b9791a"],
          ["Enrolled", job.enrolledRows, "#17805f"],
          ["Unmatched", job.unmatchedRows, "#c23b3b"],
          ["Duplicate", job.duplicateRows, "#c23b3b"],
          ["Invalid", job.invalidRows, "#c23b3b"],
          ["Flagged for removal", job.flaggedForRemovalRows, "#b9791a"],
        ].map(([label, value, color]) => (
          <div key={label} className="rounded-xl border border-border-default bg-white p-3">
            <div className="text-xs font-semibold text-text-muted">{label}</div>
            <div className="mt-1 text-lg font-extrabold" style={{ color: color as string }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      <div className="mb-4 flex items-center gap-2.5">
        <Dropdown
          className="w-56"
          value={rowStatus}
          onChange={(value) => {
            setRowStatus(value);
            setPage(1);
          }}
          aria-label="Filter by row status"
          options={[
            { value: "", label: "All non-matched rows" },
            ...ROW_STATUSES.map((s) => ({ value: s, label: s })),
          ]}
        />
        {(refreshing || job.status === "PENDING" || job.status === "PROCESSING") && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-text-muted">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-border-default border-t-[#1f9c7c]" />
            Updating…
          </span>
        )}
      </div>

      {actionMessage && (
        <div className="mb-4 rounded-lg bg-success-soft px-3 py-2 text-sm font-semibold text-success">
          {actionMessage}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border-default bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-180 text-left text-sm">
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
              {initialLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-text-muted">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-text-muted">
                    No rows found.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const canResolve = row.status === "UNMATCHED" && row.controllerId && row.fullName;
                  const canAlias = row.status === "UNMATCHED" && row.districtName;
                  return (
                    <Fragment key={row.id}>
                      <tr className="border-b border-border-default last:border-0">
                        <td className="px-4 py-2.5 text-text-muted">{row.rowNumber}</td>
                        <td className="px-4 py-2.5 text-ink">{row.controllerId ?? "—"}</td>
                        <td className="px-4 py-2.5 text-ink">
                          {row.member ? (
                            <Link
                              to={`/members/${row.member.id}`}
                              className="font-semibold text-text-strong hover:underline"
                            >
                              {row.fullName ?? row.member.fullName}
                            </Link>
                          ) : (
                            (row.fullName ?? "—")
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-text-muted">{row.districtName ?? "—"}</td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROW_STATUS_STYLES[row.status] ?? ""}`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-danger">
                          {row.issues && row.issues.length > 0 ? row.issues.join("; ") : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          {canResolve && (
                            <button
                              type="button"
                              onClick={() => openAction(row.id, "resolve")}
                              className="mr-3 text-xs font-semibold text-action-primary hover:underline"
                            >
                              Resolve
                            </button>
                          )}
                          {canAlias && (
                            <button
                              type="button"
                              onClick={() => openAction(row.id, "alias")}
                              className="text-xs font-semibold text-text-strong hover:underline"
                            >
                              Map as Alias
                            </button>
                          )}
                        </td>
                      </tr>
                      {actionRowId === row.id && actionMode && (
                        <tr className="border-b border-border-default bg-surface-hover last:border-0">
                          <td colSpan={7} className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <span className="text-sm text-text-muted">
                                {actionMode === "resolve"
                                  ? `Enroll Controller ID ${row.controllerId} in:`
                                  : `Map "${row.districtName}" to:`}
                              </span>
                              <Dropdown
                                className="w-64"
                                value={actionDistrictId}
                                onChange={setActionDistrictId}
                                placeholder="Select a district…"
                                options={districts.map((d) => ({
                                  value: String(d.id),
                                  label: `${d.name} · ${d.region.name}`,
                                }))}
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  void (actionMode === "resolve"
                                    ? submitResolve(row)
                                    : submitAlias(row))
                                }
                                disabled={actionBusy || !actionDistrictId}
                                className="rounded-lg bg-action-primary px-3.5 py-1.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {actionBusy
                                  ? "Saving…"
                                  : actionMode === "resolve"
                                    ? "Enroll Member"
                                    : "Save Mapping"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setActionRowId(null)}
                                className="text-xs font-semibold text-text-muted"
                              >
                                Cancel
                              </button>
                            </div>
                            {actionMode === "resolve" && (
                              <p className="mt-2 text-xs text-text-muted">
                                Enrolls this member immediately with the district you pick — use
                                this for a one-off or ambiguous spelling. To fix the spelling for
                                every future upload instead, use "Map as Alias".
                              </p>
                            )}
                            {actionError && (
                              <p className="mt-2 text-xs font-semibold text-danger">
                                {actionError}
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-text-muted">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-border-default bg-white px-3 py-1.5 font-semibold text-text-strong disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-lg border border-border-default bg-white px-3 py-1.5 font-semibold text-text-strong disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
