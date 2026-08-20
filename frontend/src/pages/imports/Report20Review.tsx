import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "@/lib/api";

type ImportJob = {
  id: number;
  status: string;
  reportMonth: string | null;
  totalRows: number;
  matchedRows: number;
  changedRows: number;
  unmatchedRows: number;
  duplicateRows: number;
  invalidRows: number;
  errorMessage: string | null;
  createdAt: string;
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

const ROW_STATUSES = ["MATCHED", "CHANGED", "UNMATCHED", "DUPLICATE", "INVALID"];

const ROW_STATUS_STYLES: Record<string, string> = {
  MATCHED: "bg-[#dff7ee] text-[#17805f]",
  CHANGED: "bg-[#fbf0dd] text-[#b9791a]",
  UNMATCHED: "bg-[#fbe9e9] text-[#c23b3b]",
  DUPLICATE: "bg-[#fbe9e9] text-[#c23b3b]",
  INVALID: "bg-[#fbe9e9] text-[#c23b3b]",
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rerunning, setRerunning] = useState(false);
  const [rerunMessage, setRerunMessage] = useState("");
  const limit = 50;

  const loadJob = async () => {
    try {
      const res = await api.get(`/imports/${id}`);
      setJob(res.data.data);
    } catch {
      setError("Unable to load this import.");
    }
  };

  const loadRows = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/imports/${id}/issues`, {
        params: { page, limit, status: rowStatus || undefined },
      });
      setRows(res.data.data);
      setTotalPages(res.data.pagination.totalPages);
    } catch {
      setError("Unable to load rows.");
    } finally {
      setLoading(false);
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

  const rerun = async () => {
    if (
      !window.confirm(
        "Re-run reconciliation for this file against the current members list? This replaces the existing rows for this upload.",
      )
    ) {
      return;
    }
    setRerunning(true);
    setError("");
    setRerunMessage("");
    try {
      const res = await api.post(`/imports/${id}/rerun`);
      setJob(res.data.data);
      setRerunMessage(
        `Re-reconciled: ${res.data.data.matchedRows} matched, ${res.data.data.changedRows} changed, ${res.data.data.unmatchedRows} unmatched.`,
      );
      setPage(1);
      await loadRows();
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
          {job.status === "COMPLETED" && (
            <button
              type="button"
              onClick={rerun}
              disabled={rerunning}
              className="rounded-[9px] border border-[#e5e9f0] px-3.5 py-2 text-[12.5px] font-semibold text-[#1e2761] transition hover:border-[#1f9c7c] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {rerunning ? "Re-running…" : "Re-run Reconciliation"}
            </button>
          )}
        </div>
      </div>

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

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Total", job.totalRows, "#1e2761"],
          ["Matched", job.matchedRows, "#17805f"],
          ["Changed", job.changedRows, "#b9791a"],
          ["Unmatched", job.unmatchedRows, "#c23b3b"],
          ["Duplicate", job.duplicateRows, "#c23b3b"],
          ["Invalid", job.invalidRows, "#c23b3b"],
        ].map(([label, value, color]) => (
          <div key={label} className="rounded-[10px] border border-[#e5e9f0] bg-white p-3">
            <div className="text-[10.5px] font-semibold text-[#5b6472]">{label}</div>
            <div className="mt-1 text-[18px] font-extrabold" style={{ color: color as string }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      <div className="mb-4">
        <select
          value={rowStatus}
          onChange={(e) => {
            setRowStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-[9px] border border-[#e5e9f0] bg-white px-3 py-2 text-[12.5px] text-[#171b26]"
        >
          <option value="">All non-matched rows</option>
          {ROW_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

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
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-[#5b6472]">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-[#5b6472]">
                    No rows found.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-[#e5e9f0] last:border-0">
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
                  </tr>
                ))
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
