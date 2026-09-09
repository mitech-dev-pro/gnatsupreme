import Button from "@/components/ui/Button";
import { Alert, EmptyState, TableSkeleton } from "@/components/ui/Feedback";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import TableFrame from "@/components/ui/TableFrame";
import api from "@/lib/api";
import { getApiError } from "@/lib/errorExtract";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

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
  file: { originalName: string; sizeBytes: number };
  uploadedBy: { id: number; fullName: string };
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const jobTone = (status: string): "success" | "danger" | "warning" =>
  status === "COMPLETED" ? "success" : status === "FAILED" ? "danger" : "warning";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const TEMPLATE_HEADERS = [
  "Controller ID",
  "Full Name",
  "Date of Birth",
  "Ghana Card ID",
  "Phone",
  "School",
  "District",
  "Region",
  "Spouse Name",
  "Spouse Date of Birth",
  "Spouse Ghana Card ID",
  "Beneficiary Name",
  "Beneficiary Relationship",
  "Beneficiary Date of Birth",
  "Trustee Name",
];

const TEMPLATE_EXAMPLE_ROW = [
  "1188204",
  "Ama Serwaa",
  "1985-04-12",
  "GHA-123456789-0",
  "0244000000",
  "Tema International Basic",
  "Tema Metropolitan",
  "Greater Accra",
  "Kwame Owusu",
  "1983-01-01",
  "GHA-987654321-2",
  "Kojo Owusu",
  "CHILD",
  "2010-06-15",
  "",
];

function downloadTemplate() {
  const csv = [TEMPLATE_HEADERS, TEMPLATE_EXAMPLE_ROW]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "member-upload-template.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function UploadMembers() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
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
        const res = await api.get("/imports/members");
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

    setUploading(true);
    setUploadProgress(0);
    try {
      const res = await api.post("/imports/members", formData, {
        onUploadProgress: (event) => {
          if (event.total) {
            setUploadProgress(Math.round((event.loaded / event.total) * 100));
          }
        },
      });
      navigate(`/members/upload/${res.data.data.id}`, { replace: true });
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
        to="/members"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-text-strong"
      >
        &larr; All Members
      </Link>

      <PageHeader
        eyebrow="Member administration"
        title="Bulk Import"
        description="Validate every row before enrolling new member records."
        actions={
          <Button variant="secondary" size="sm" onClick={downloadTemplate}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-3.5 w-3.5"
            >
              <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
              <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
            Download template
          </Button>
        }
      />
      <div className="mb-5 text-sm text-text-muted">
        Upload a CSV or XLSX file with Controller ID, Full Name, School, and District columns. Each
        row also needs a beneficiary name and relationship; spouse details are optional. This is a
        different format from the{" "}
        <Link to="/imports/report20" className="font-semibold text-action-primary hover:underline">
          Report 20 payroll reconciliation upload
        </Link>
        , which reconciles existing members and doesn't enroll new ones. Not sure of the exact
        columns? Download the template above — we'll validate every row before anything is enrolled.
      </div>

      {error && (
        <div className="mb-4">
          <Alert tone="error">{error}</Alert>
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

        {uploading && (
          <div className="mt-5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-info-soft">
              <div
                className="h-full rounded-full bg-action-primary transition-[width] duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <div className="mt-1.5 text-xs text-text-muted">
              {uploadProgress < 100 ? `Uploading… ${uploadProgress}%` : "Validating rows…"}
            </div>
          </div>
        )}

        <Button
          type="submit"
          disabled={!file}
          loading={uploading}
          loadingLabel={uploadProgress < 100 ? `Uploading… ${uploadProgress}%` : "Validating…"}
          className="mt-5"
        >
          {uploading
            ? uploadProgress < 100
              ? `Uploading… ${uploadProgress}%`
              : "Validating…"
            : "Upload & Validate"}
        </Button>
      </form>

      <h2 className="mb-3 mt-8 text-lg font-bold text-text-strong">Recent Uploads</h2>

      {jobsError && (
        <div className="mb-4">
          <Alert tone="error">{jobsError}</Alert>
        </div>
      )}

      <TableFrame label="Recent member uploads" className="min-w-205">
        <thead>
          <tr className="border-b border-border-default bg-surface-hover text-xs font-semibold uppercase tracking-wide text-text-muted">
            <th className="px-4 py-2.5">File</th>
            <th className="px-4 py-2.5">Uploaded By</th>
            <th className="px-4 py-2.5">Date</th>
            <th className="px-4 py-2.5">Total</th>
            <th className="px-4 py-2.5">Ready</th>
            <th className="px-4 py-2.5">Invalid / Duplicate</th>
            <th className="px-4 py-2.5">Enrolled</th>
            <th className="px-4 py-2.5">Status</th>
          </tr>
        </thead>
        <tbody>
          {jobsLoading ? (
            <TableSkeleton columns={8} />
          ) : jobs.length === 0 ? (
            <tr>
              <td colSpan={8}>
                {!jobsError && (
                  <EmptyState
                    title="No uploads yet"
                    description="Upload a member file to begin validation."
                  />
                )}
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
                    to={`/members/upload/${job.id}`}
                    className="font-semibold text-text-strong hover:underline"
                  >
                    {job.file.originalName}
                  </Link>
                  <div className="text-xs text-text-muted">{formatSize(job.file.sizeBytes)}</div>
                  {job.status === "FAILED" && job.errorMessage && (
                    <div className="mt-0.5 text-xs text-danger">{job.errorMessage}</div>
                  )}
                </td>
                <td className="px-4 py-2.5 text-text-muted">{job.uploadedBy.fullName}</td>
                <td className="px-4 py-2.5 text-text-muted">{formatDate(job.createdAt)}</td>
                <td className="px-4 py-2.5 text-ink">{job.totalRows}</td>
                <td className="px-4 py-2.5 text-success">{job.readyRows}</td>
                <td className="px-4 py-2.5 text-danger">{job.invalidRows + job.duplicateRows}</td>
                <td className="px-4 py-2.5 text-ink">{job.importedRows}</td>
                <td className="px-4 py-2.5">
                  <StatusBadge tone={jobTone(job.status)}>
                    {job.status.charAt(0) + job.status.slice(1).toLowerCase()}
                  </StatusBadge>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </TableFrame>
    </div>
  );
}
