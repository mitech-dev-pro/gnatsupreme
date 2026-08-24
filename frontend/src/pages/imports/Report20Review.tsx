import { Fragment, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "@/lib/api";
import ConfirmationPanel from "@/components/ui/ConfirmationPanel";
import Dropdown from "@/components/ui/Dropdown";
import { useDistricts } from "@/lib/useDistricts";

type ImportJob = {
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

type ReportRow = {
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

const ROW_STATUSES = ["MATCHED", "CHANGED", "UNMATCHED", "DUPLICATE", "INVALID", "ENROLLED"];

// Mirrors the backend's STUCK_JOB_THRESHOLD_MS (import.routes.ts) — a PENDING/PROCESSING job that
// hasn't moved in this long had its worker die without reporting back, so it needs a manual retry
// rather than waiting on progress that will never come.
const STUCK_JOB_THRESHOLD_MS = 15 * 60 * 1_000;

const ROW_STATUS_STYLES: Record<string, string> = {
  MATCHED: "bg-[#dff7ee] text-[#17805f]",
  CHANGED: "bg-[#fbf0dd] text-[#b9791a]",
  UNMATCHED: "bg-[#fbe9e9] text-[#c23b3b]",
  DUPLICATE: "bg-[#fbe9e9] text-[#c23b3b]",
  INVALID: "bg-[#fbe9e9] text-[#c23b3b]",
  ENROLLED: "bg-[#dff7ee] text-[#17805f]",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function Report20Review() {
  const { id } = useParams();
  const [job, setJob] = useState<ImportJob | null>(null);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [rowStatus, setRowStatus] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [rerunning, setRerunning] = useState(false);
  const [confirmingRerun, setConfirmingRerun] = useState(false);
  const [rerunMessage, setRerunMessage] = useState("");
  const limit = 50;

  const { districts } = useDistricts();
  const [actionRowId, setActionRowId] = useState<number | null>(null);
  const [actionMode, setActionMode] = useState<"resolve" | "alias" | null>(null);
  const [actionDistrictId, setActionDistrictId] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const openAction = (rowId: number, mode: "resolve" | "alias") => {
    setActionRowId((current) => (current === rowId && actionMode === mode ? null : rowId));
    setActionMode(mode);
    setActionDistrictId("");
    setActionError("");
  };

  const submitResolve = async (row: ReportRow) => {
    if (!actionDistrictId) return;
    setActionBusy(true);
    setActionError("");
    try {
      await api.post(`/imports/${id}/rows/${row.id}/resolve`, { districtId: Number(actionDistrictId) });
      setActionMessage(`Row ${row.rowNumber} was enrolled and marked resolved.`);
      setActionRowId(null);
      await Promise.all([loadJob(), loadRows(true)]);
    } catch (err: any) {
      setActionError(err?.response?.data?.message || "Unable to resolve this row.");
    } finally {
      setActionBusy(false);
    }
  };

  const submitAlias = async (row: ReportRow) => {
    if (!actionDistrictId || !row.districtName) return;
    setActionBusy(true);
    setActionError("");
    try {
      await api.post("/districts/aliases", { alias: row.districtName, districtId: Number(actionDistrictId) });
      setActionMessage(`Mapped "${row.districtName}" — re-run reconciliation to apply it to every matching row.`);
      setActionRowId(null);
    } catch (err: any) {
      setActionError(err?.response?.data?.message || "Unable to save this alias.");
    } finally {
      setActionBusy(false);
    }
  };

  const loadJob = async () => {
    try {
      const res = await api.get(`/imports/${id}`);
      setJob(res.data.data);
    } catch {
      setError("Unable to load this import.");
    }
  };

  const loadRows = async (isBackgroundRefresh = false) => {
    if (isBackgroundRefresh) {
      setRefreshing(true);
    } else {
      setInitialLoading(true);
    }
    try {
      const res = await api.get(`/imports/${id}/issues`, {
        params: { page, limit, status: rowStatus || undefined },
      });
      setRows(res.data.data);
      setTotalPages(res.data.pagination.totalPages);
    } catch {
      setError("Unable to load rows.");
    } finally {
      if (isBackgroundRefresh) {
        setRefreshing(false);
      } else {
        setInitialLoading(false);
      }
    }
  };

  useEffect(() => {
    loadJob();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, page, rowStatus]);

  // Uploads and re-runs now process in the background — poll while the job hasn't finished yet.
  // Job status/progress polls quickly (it's a cheap single-row read); the row list polls less
  // often since it's a bigger query and doesn't change meaningfully every couple of seconds.
  useEffect(() => {
    if (!job || (job.status !== "PENDING" && job.status !== "PROCESSING")) {
      setRerunMessage("");
      return;
    }
    const jobTimer = setInterval(loadJob, 1500);
    const rowsTimer = setInterval(() => loadRows(true), 5000);
    return () => {
      clearInterval(jobTimer);
      clearInterval(rowsTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status]);

  const rerun = async () => {
    setRerunning(true);
    setError("");
    setRerunMessage("");
    try {
      const res = await api.post(`/imports/${id}/rerun`);
      setJob(res.data.data);
      setRerunMessage("Reconciliation is running in the background — this page will update automatically.");
      setPage(1);
      setConfirmingRerun(false);
    } catch (err: any) {
      setError(err?.response?.data?.message || "Unable to re-run reconciliation.");
    } finally {
      setRerunning(false);
    }
  };

  if (!job && error) {
    return (
      <div className="rounded-[12px] border border-[#e5e9f0] bg-white p-6 text-[13px] text-[#c23b3b]">
        {error}
      </div>
    );
  }

  if (!job) {
    return <div className="text-[13px] text-[#5b6472]">Loading…</div>;
  }

  const isStuck =
    (job.status === "PENDING" || job.status === "PROCESSING") &&
    Date.now() - new Date(job.updatedAt).getTime() > STUCK_JOB_THRESHOLD_MS;

  return (
    <div>
      <Link
        to="/imports/report20"
        className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#5b6472] hover:text-[#1e2761]"
      >
        &larr; Report 20 Uploads
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold text-[#1e2761]">
            {job.file.originalName}
          </h1>
          <div className="mt-1 text-[12.5px] text-[#5b6472]">
            Uploaded by {job.uploadedBy.fullName}
            {job.reportMonth ? ` · ${formatDate(job.reportMonth)}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="rounded-full bg-[#eef0fa] px-3 py-1 text-[12px] font-bold text-[#1e2761]">
            {job.status}
          </span>
          {(job.status === "COMPLETED" || isStuck) && (
            <button
              type="button"
              onClick={() => setConfirmingRerun(true)}
              disabled={rerunning}
              className="rounded-[9px] border border-[#e5e9f0] px-3.5 py-2 text-[12.5px] font-semibold text-[#1e2761] transition hover:border-[#1f9c7c] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {rerunning ? "Re-running…" : isStuck ? "Retry (appears stuck)" : "Re-run Reconciliation"}
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
        <div className="mb-4 rounded-lg bg-[#dff7ee] px-3 py-2 text-[12.5px] font-semibold text-[#17805f]">
          {rerunMessage}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-[#fbe9e9] px-3 py-2 text-[12.5px] font-semibold text-[#c23b3b]">
          {error}
        </div>
      )}

      {job.errorMessage && (
        <div className="mb-4 rounded-lg bg-[#fbe9e9] px-3 py-2 text-[12.5px] font-semibold text-[#c23b3b]">
          {job.errorMessage}
        </div>
      )}

      {(job.status === "PENDING" || job.status === "PROCESSING") && (
        <div className="mb-4 rounded-lg bg-[#eef0fa] px-3 py-3 text-[12.5px] font-semibold text-[#1e2761]">
          {job.totalRows > 0 ? (
            <>
              <div className="mb-1.5 flex items-center justify-between">
                <span>
                  Processing row {job.processedRows.toLocaleString()} of {job.totalRows.toLocaleString()}
                </span>
                <span>{Math.min(100, Math.round((job.processedRows / job.totalRows) * 100))}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/60">
                <div
                  className="h-full rounded-full bg-[#1f9c7c] transition-[width] duration-500"
                  style={{ width: `${Math.min(100, Math.round((job.processedRows / job.totalRows) * 100))}%` }}
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
          <div key={label} className="rounded-[10px] border border-[#e5e9f0] bg-white p-3">
            <div className="text-[10.5px] font-semibold text-[#5b6472]">{label}</div>
            <div className="mt-1 text-[18px] font-extrabold" style={{ color: color as string }}>
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
          options={[{ value: "", label: "All non-matched rows" }, ...ROW_STATUSES.map((s) => ({ value: s, label: s }))]}
        />
        {(refreshing || job.status === "PENDING" || job.status === "PROCESSING") && (
          <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#5b6472]">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#e5e9f0] border-t-[#1f9c7c]" />
            Updating…
          </span>
        )}
      </div>

      {actionMessage && (
        <div className="mb-4 rounded-lg bg-[#dff7ee] px-3 py-2 text-[12.5px] font-semibold text-[#17805f]">
          {actionMessage}
        </div>
      )}

      <div className="overflow-hidden rounded-[12px] border border-[#e5e9f0] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-[#e5e9f0] bg-[#fafbfd] text-[11px] font-semibold uppercase tracking-wide text-[#5b6472]">
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
                  <td colSpan={7} className="px-4 py-6 text-center text-[#5b6472]">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-[#5b6472]">
                    No rows found.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const canResolve = row.status === "UNMATCHED" && row.controllerId && row.fullName;
                  const canAlias = row.status === "UNMATCHED" && row.districtName;
                  return (
                    <Fragment key={row.id}>
                      <tr className="border-b border-[#e5e9f0] last:border-0">
                        <td className="px-4 py-2.5 text-[#5b6472]">{row.rowNumber}</td>
                        <td className="px-4 py-2.5 text-[#171b26]">{row.controllerId ?? "—"}</td>
                        <td className="px-4 py-2.5 text-[#171b26]">
                          {row.member ? (
                            <Link
                              to={`/members/${row.member.id}`}
                              className="font-semibold text-[#1e2761] hover:underline"
                            >
                              {row.fullName ?? row.member.fullName}
                            </Link>
                          ) : (
                            (row.fullName ?? "—")
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-[#5b6472]">{row.districtName ?? "—"}</td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${ROW_STATUS_STYLES[row.status] ?? ""}`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-[#c23b3b]">
                          {row.issues && row.issues.length > 0 ? row.issues.join("; ") : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          {canResolve && (
                            <button
                              type="button"
                              onClick={() => openAction(row.id, "resolve")}
                              className="mr-3 text-[11.5px] font-semibold text-[#1f9c7c] hover:underline"
                            >
                              Resolve
                            </button>
                          )}
                          {canAlias && (
                            <button
                              type="button"
                              onClick={() => openAction(row.id, "alias")}
                              className="text-[11.5px] font-semibold text-[#1e2761] hover:underline"
                            >
                              Map as Alias
                            </button>
                          )}
                        </td>
                      </tr>
                      {actionRowId === row.id && actionMode && (
                        <tr className="border-b border-[#e5e9f0] bg-[#fafbfd] last:border-0">
                          <td colSpan={7} className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <span className="text-[12.5px] text-[#5b6472]">
                                {actionMode === "resolve"
                                  ? `Enroll Controller ID ${row.controllerId} in:`
                                  : `Map "${row.districtName}" to:`}
                              </span>
                              <Dropdown
                                className="w-64"
                                value={actionDistrictId}
                                onChange={setActionDistrictId}
                                placeholder="Select a district…"
                                options={districts.map((d) => ({ value: String(d.id), label: `${d.name} · ${d.region.name}` }))}
                              />
                              <button
                                type="button"
                                onClick={() => void (actionMode === "resolve" ? submitResolve(row) : submitAlias(row))}
                                disabled={actionBusy || !actionDistrictId}
                                className="rounded-[9px] bg-[#1f9c7c] px-3.5 py-1.5 text-[12px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
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
                                className="text-[11.5px] font-semibold text-[#5b6472]"
                              >
                                Cancel
                              </button>
                            </div>
                            {actionMode === "resolve" && (
                              <p className="mt-2 text-[11px] text-[#5b6472]">
                                Enrolls this member immediately with the district you pick — use this for a one-off or
                                ambiguous spelling. To fix the spelling for every future upload instead, use "Map as
                                Alias".
                              </p>
                            )}
                            {actionError && (
                              <p className="mt-2 text-[11.5px] font-semibold text-[#c23b3b]">{actionError}</p>
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
        <div className="mt-4 flex items-center justify-between text-[12.5px]">
          <span className="text-[#5b6472]">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-[9px] border border-[#e5e9f0] bg-white px-3 py-1.5 font-semibold text-[#1e2761] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-[9px] border border-[#e5e9f0] bg-white px-3 py-1.5 font-semibold text-[#1e2761] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
