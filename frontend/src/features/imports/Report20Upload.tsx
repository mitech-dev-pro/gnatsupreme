import api from "@/lib/api";
import { getApiError } from "@/lib/errorExtract";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

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
  file: { originalName: string; sizeBytes: number };
  uploadedBy: { id: number; fullName: string };
};

const JOB_STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-warning-soft text-warning-accent",
  PROCESSING: "bg-warning-soft text-warning-accent",
  COMPLETED: "bg-success-soft text-success",
  FAILED: "bg-danger-soft text-danger",
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function Report20Upload() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [reportMonth, setReportMonth] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get("/imports");
        if (!cancelled) setJobs(res.data.data);
      } catch (err: unknown) {
        if (!cancelled) {
          setJobsError(getApiError(err)?.message || "Unable to load past uploads.");
        }
      } finally {
        if (!cancelled) setJobsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!file) {
      setError("Choose a CSV or XLSX file to upload.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    if (reportMonth) formData.append("reportMonth", reportMonth);

    setUploading(true);
    setUploadProgress(0);
    try {
      const res = await api.post("/imports/report-20", formData, {
        onUploadProgress: (event) => {
          if (event.total) {
            setUploadProgress(Math.round((event.loaded / event.total) * 100));
          }
        },
      });
      navigate(`/imports/report20/${res.data.data.id}`, { replace: true });
    } catch (err: unknown) {
      setError(getApiError(err)?.message || "Unable to upload this file.");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <div>
      <Link
        to="/"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-text-strong"
      >
        &larr; Dashboard
      </Link>

      <h1 className="mb-1 text-2xl font-extrabold text-text-strong">Report 20 Reconciliation</h1>
      <div className="mb-5 text-sm text-text-muted">
        Upload the monthly Report 20 payroll deductions file to reconcile it against enrolled
        members. This is a separate file format from bulk member enrollment — it has payroll fields
        (Employee No, Amount, Balance, District, Reference), not member/beneficiary details.
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-border-default bg-white p-6"
      >
        <div
          onClick={() => fileInputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border-default px-6 py-10 text-center transition hover:border-action-primary"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="mb-3 h-8 w-8 text-text-muted"
          >
            <path d="M12 3v12m0-12 4 4m-4-4-4 4" />
            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>
          <div className="text-sm font-semibold text-text-strong">
            {file ? file.name : "Click to choose a file"}
          </div>
          <div className="mt-1 text-xs text-text-muted">CSV or XLSX</div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="hidden"
          />
        </div>

        <div className="mt-4 max-w-52">
          <label className="mb-1 block text-xs font-bold text-text-strong">
            Report Month (optional)
          </label>
          <input
            type="month"
            value={reportMonth}
            onChange={(e) => setReportMonth(e.target.value)}
            className="w-full rounded-lg border border-border-default bg-text-on-action px-3 py-2 text-sm focus:border-action-primary focus:shadow-focus-soft focus:outline-none"
          />
        </div>

        {uploading && (
          <div className="mt-5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-info-soft">
              <div
                className="h-full rounded-full bg-action-primary transition-[width] duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <div className="mt-1.5 text-xs text-text-muted">
              {uploadProgress < 100 ? `Uploading… ${uploadProgress}%` : "Reconciling rows…"}
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={uploading || !file}
          className="mt-5 rounded-lg bg-action-primary px-5 py-2.5 text-sm font-bold text-white shadow-action transition hover:bg-success disabled:cursor-not-allowed disabled:opacity-60"
        >
          {uploading
            ? uploadProgress < 100
              ? `Uploading… ${uploadProgress}%`
              : "Reconciling…"
            : "Upload & Reconcile"}
        </button>
      </form>

      <h2 className="mb-3 mt-8 text-lg font-bold text-text-strong">Recent Uploads</h2>

      {jobsError && (
        <div className="mb-4 rounded-lg bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">
          {jobsError}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border-default bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-205 text-left text-sm">
            <thead>
              <tr className="border-b border-border-default bg-surface-hover text-xs font-semibold uppercase tracking-wide text-text-muted">
                <th className="px-4 py-2.5">File</th>
                <th className="px-4 py-2.5">Uploaded By</th>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Total</th>
                <th className="px-4 py-2.5">Matched</th>
                <th className="px-4 py-2.5">Unmatched</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {jobsLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-text-muted">
                    Loading…
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-text-muted">
                    {jobsError ? "—" : "No uploads yet."}
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <tr
                    key={job.id}
                    className="border-b border-border-default last:border-0 hover:bg-surface-hover"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        to={`/imports/report20/${job.id}`}
                        className="font-semibold text-text-strong hover:underline"
                      >
                        {job.file.originalName}
                      </Link>
                      <div className="text-xs text-text-muted">
                        {formatSize(job.file.sizeBytes)}
                      </div>
                      {job.status === "FAILED" && job.errorMessage && (
                        <div className="mt-0.5 text-xs text-danger">{job.errorMessage}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-text-muted">{job.uploadedBy.fullName}</td>
                    <td className="px-4 py-2.5 text-text-muted">{formatDate(job.createdAt)}</td>
                    <td className="px-4 py-2.5 text-ink">{job.totalRows}</td>
                    <td className="px-4 py-2.5 text-success">{job.matchedRows}</td>
                    <td className="px-4 py-2.5 text-danger">{job.unmatchedRows}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${JOB_STATUS_STYLES[job.status] ?? ""}`}
                      >
                        {job.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
