import { Fragment, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "@/lib/api";
import { useDistricts } from "@/lib/useDistricts";
import Button from "@/components/ui/Button";
import { Alert, EmptyState, TableSkeleton } from "@/components/ui/Feedback";
import PageHeader from "@/components/ui/PageHeader";
import Pagination from "@/components/ui/Pagination";
import StatusBadge from "@/components/ui/StatusBadge";
import TableFrame from "@/components/ui/TableFrame";

type ImportJob = {
  id: number;
  status: string;
  totalRows: number;
  readyRows: number;
  invalidRows: number;
  duplicateRows: number;
  unmatchedRows: number;
  importedRows: number;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  file: { originalName: string };
  uploadedBy: { id: number; fullName: string };
};

type ImportRow = {
  id: number;
  rowNumber: number;
  controllerId: string | null;
  fullName: string | null;
  school: string | null;
  districtName: string | null;
  status: string;
  issues: string[] | null;
};

const ROW_STATUSES = [
  "READY",
  "INVALID",
  "DUPLICATE",
  "EXISTING",
  "OUT_OF_SCOPE",
  "IMPORTED",
  "FAILED",
];

const statusTone = (status: string): "success" | "danger" | "warning" | "neutral" => ["READY", "IMPORTED", "COMPLETED"].includes(status) ? "success" : ["INVALID", "DUPLICATE", "FAILED"].includes(status) ? "danger" : ["EXISTING", "OUT_OF_SCOPE", "PENDING", "PROCESSING"].includes(status) ? "warning" : "neutral";

const DISTRICT_ISSUE_PATTERN = /district/i;

export default function ImportReview() {
  const { id } = useParams();
  const { districts } = useDistricts();
  const [job, setJob] = useState<ImportJob | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [rowStatus, setRowStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [committing, setCommitting] = useState(false);
  const [mappingRowId, setMappingRowId] = useState<number | null>(null);
  const [mappingDistrictId, setMappingDistrictId] = useState("");
  const [mappingBusy, setMappingBusy] = useState(false);
  const [mappingMessage, setMappingMessage] = useState("");
  const limit = 50;

  const loadJob = async () => {
    try {
      const res = await api.get(`/imports/members/${id}`);
      setJob(res.data.data);
    } catch {
      setError("Unable to load this import.");
    }
  };

  const loadRows = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/imports/members/${id}/rows`, {
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

  // Staging and committing now both run in the background — poll while the job hasn't finished yet.
  useEffect(() => {
    if (!job || (job.status !== "PENDING" && job.status !== "PROCESSING")) return;
    const timer = setInterval(async () => {
      await loadJob();
      await loadRows();
    }, 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status]);

  const handleCommit = async () => {
    setCommitting(true);
    setError("");
    try {
      const res = await api.post(`/imports/members/${id}/commit`);
      setJob(res.data.data);
    } catch (err: any) {
      setError(err?.response?.data?.message || "Unable to commit this import.");
    } finally {
      setCommitting(false);
    }
  };

  const submitDistrictMapping = async (row: ImportRow) => {
    if (!row.districtName || !mappingDistrictId) return;
    setMappingBusy(true);
    setMappingMessage("");
    try {
      await api.post("/districts/aliases", {
        alias: row.districtName,
        districtId: Number(mappingDistrictId),
      });
      setMappingMessage(
        `Mapped "${row.districtName}" — re-upload this file to pick up the fix.`,
      );
      setMappingRowId(null);
      setMappingDistrictId("");
    } catch (err: any) {
      setMappingMessage(
        err?.response?.data?.message || "Unable to save this district mapping.",
      );
    } finally {
      setMappingBusy(false);
    }
  };

  if (loading && !job) {
    return <div className="rounded-[12px] border border-(--border-default) bg-(--surface-raised) p-5"><table className="w-full"><tbody><TableSkeleton columns={4} rows={5} /></tbody></table></div>;
  }

  if (error && !job) {
    return (
      <Alert tone="error">{error}</Alert>
    );
  }

  if (!job) return null;

  const canCommit = job.status === "COMPLETED" && job.readyRows > 0;

  return (
    <div>
      <Link
        to="/members"
        className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#5b6472] hover:text-[#1e2761]"
      >
        &larr; All Members
      </Link>

      <PageHeader eyebrow="Member import review" title={job.file.originalName} description={`Uploaded by ${job.uploadedBy.fullName}`} actions={<StatusBadge tone={statusTone(job.status)}>{job.status.charAt(0) + job.status.slice(1).toLowerCase()}</StatusBadge>} />

      {error && <div className="mb-4"><Alert tone="error">{error}</Alert></div>}

      {mappingMessage && <div className="mb-4"><Alert tone="info">{mappingMessage}</Alert></div>}

      {(job.status === "PENDING" || job.status === "PROCESSING") && (
        <div className="mb-4"><Alert tone="info">
          Processing in the background — this can take a while for large files. This page refreshes automatically.
        </Alert></div>
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
          <div key={label} className="rounded-[10px] border border-[#e5e9f0] bg-white p-3">
            <div className="text-[10.5px] font-semibold text-[#5b6472]">{label}</div>
            <div className="mt-1 text-[18px] font-extrabold" style={{ color: color as string }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {canCommit && (
        <div className="mb-5">
          <Button
            onClick={handleCommit}
            loading={committing}
            loadingLabel="Enrolling…"
          >
            {committing ? "Enrolling…" : `Enroll ${job.readyRows} Ready Row(s)`}
          </Button>
        </div>
      )}

      <div className="mb-4">
        <select
          value={rowStatus}
          onChange={(e) => {
            setRowStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-[9px] border border-[#e5e9f0] bg-white px-3 py-2 text-[12.5px] text-[#171b26]"
        >
          <option value="">All rows</option>
          {ROW_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <TableFrame label="Import rows" className="min-w-[720px]">
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
              {loading ? <TableSkeleton columns={7} /> : rows.length === 0 ? (
                <tr>
                  <td colSpan={7}><EmptyState title="No rows found" description="Rows matching this status filter will appear here." /></td>
                </tr>
              ) : (
                rows.map((row) => {
                  const hasDistrictIssue =
                    row.districtName &&
                    row.issues?.some((issue) => DISTRICT_ISSUE_PATTERN.test(issue));
                  return (
                    <Fragment key={row.id}>
                      <tr className="border-b border-[#e5e9f0] last:border-0">
                        <td className="px-4 py-2.5 text-[#5b6472]">{row.rowNumber}</td>
                        <td className="px-4 py-2.5 text-[#171b26]">{row.controllerId ?? "—"}</td>
                        <td className="px-4 py-2.5 text-[#171b26]">{row.fullName ?? "—"}</td>
                        <td className="px-4 py-2.5 text-[#5b6472]">{row.districtName ?? "—"}</td>
                        <td className="px-4 py-2.5">
                          <StatusBadge tone={statusTone(row.status)}>{row.status.replaceAll("_", " ").toLowerCase()}</StatusBadge>
                        </td>
                        <td className="px-4 py-2.5 text-[#c23b3b]">
                          {row.issues && row.issues.length > 0 ? row.issues.join("; ") : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {hasDistrictIssue && (
                            <button
                              type="button"
                              onClick={() =>
                                setMappingRowId((current) =>
                                  current === row.id ? null : row.id,
                                )
                              }
                              className="text-[11.5px] font-semibold text-[#1f9c7c] hover:underline"
                            >
                              Map District
                            </button>
                          )}
                        </td>
                      </tr>
                      {mappingRowId === row.id && (
                        <tr className="border-b border-[#e5e9f0] bg-[#fafbfd] last:border-0">
                          <td colSpan={7} className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <span className="text-[12.5px] text-[#5b6472]">
                                Map "{row.districtName}" to:
                              </span>
                              <select
                                value={mappingDistrictId}
                                onChange={(e) => setMappingDistrictId(e.target.value)}
                                className="rounded-[9px] border border-[#e5e9f0] bg-white px-3 py-1.5 text-[12.5px] text-[#171b26]"
                              >
                                <option value="">Select a district…</option>
                                {districts.map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.name} · {d.region.name}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => submitDistrictMapping(row)}
                                disabled={mappingBusy || !mappingDistrictId}
                                className="rounded-[9px] bg-[#1f9c7c] px-3.5 py-1.5 text-[12px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {mappingBusy ? "Saving…" : "Save Mapping"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setMappingRowId(null)}
                                className="text-[11.5px] font-semibold text-[#5b6472]"
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
