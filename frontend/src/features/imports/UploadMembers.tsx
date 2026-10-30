import { importStage, recoveryImportId } from "./importStatus";
import Pagination from "@/components/ui/Pagination";
import Button from "@/components/ui/Button";
import Dropdown from "@/components/ui/Dropdown";
import { Alert, EmptyState, TableSkeleton } from "@/components/ui/Feedback";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import TableFrame from "@/components/ui/TableFrame";
import api from "@/lib/api";
import { getApiError } from "@/lib/errorExtract";
import { useAuth } from "@/lib/AuthContext";
import { useDistricts } from "@/lib/useDistricts";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
  "Gender",
  "Ghana Card ID",
  "Phone",
  "School",
  "District",
  "Region",
  "Place of Work",
  "Spouse Name",
  "Spouse Ghana Card ID",
  "Beneficiary Name",
  "Beneficiary Relationship",
  "Beneficiary Date of Birth",
  "Trustee Name",
];

const TEMPLATE_EXAMPLE_ROW = [
  "1188204",
  "Ama Serwaa",
  "Female",
  "GHA-123456789-0",
  "0244000000",
  "Tema International Basic",
  "Tema Metropolitan",
  "Greater Accra",
  "",
  "Kwame Owusu",
  "GHA-987654321-2",
  "Kojo Owusu",
  "CHILD",
  "2010-06-15",
  "Kwame Owusu",
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
  const { user } = useAuth();
  const { districts } = useDistricts();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [employmentCategory, setEmploymentCategory] = useState<"" | "TEACHING" | "NON_TEACHING">(
    "",
  );
  const [regionId, setRegionId] = useState("");
  const [error, setError] = useState("");
  const [existingImportId, setExistingImportId] = useState<number | null>(null);
  const uploadLock = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Only SUPER_ADMIN/NATIONAL_ADMIN have no fixed region -- REGIONAL_ADMIN/DISTRICT_ADMIN
  // uploads resolve their region automatically server-side, same as manual enrollment.
  const needsRegionPicker =
    employmentCategory === "NON_TEACHING" &&
    (user?.role === "SUPER_ADMIN" || user?.role === "NATIONAL_ADMIN");
  const regionOptions = useMemo(() => {
    const map = new Map<number, string>();
    districts.forEach((item) => map.set(item.region.id, item.region.name));
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [districts]);

  const [historyPage, setHistoryPage] = useState(1),
    [historyStatus, setHistoryStatus] = useState("");
  const [historyTotal, setHistoryTotal] = useState(0),
    [historyPages, setHistoryPages] = useState(1);
  const historyAbort = useRef<AbortController | null>(null);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState("");

  const loadJobs = useCallback(async () => {
    historyAbort.current?.abort();
    const controller = new AbortController();
    historyAbort.current = controller;
    setJobsLoading(true);
    setJobsError("");
    try {
      const res = await api.get("/imports/members", {
        signal: controller.signal,
        params: { page: historyPage, limit: 10, status: historyStatus || undefined },
      });
      if (controller.signal.aborted) return;
      const pages = Math.max(1, res.data.pagination?.totalPages ?? 1);
      if (historyPage > pages) {
        setHistoryPage(pages);
        return;
      }
      setJobs(res.data.data);
      setHistoryTotal(res.data.pagination?.total ?? res.data.data.length);
      setHistoryPages(pages);
    } catch (err) {
      if (!controller.signal.aborted)
        setJobsError(
          getApiError(err)?.message ||
            "Unable to refresh import history. Loaded results remain available.",
        );
    } finally {
      if (!controller.signal.aborted) setJobsLoading(false);
    }
  }, [historyPage, historyStatus]);
  useEffect(() => {
    setJobs([]);
    void loadJobs();
    return () => historyAbort.current?.abort();
  }, [loadJobs]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (uploadLock.current) return;
    setError("");
    setExistingImportId(null);

    if (!file) {
      setError("Choose a CSV or XLSX file to upload.");
      return;
    }
    if (!/\.(csv|xlsx)$/i.test(file.name) || file.size === 0) {
      setError("Choose a non-empty CSV or XLSX file.");
      return;
    }
    if (!employmentCategory) {
      setError("Choose whether this file contains teaching or non-teaching staff.");
      return;
    }
    if (needsRegionPicker && !regionId) {
      setError("Select the region these non-teaching staff belong to.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("employmentCategory", employmentCategory);
    if (needsRegionPicker && regionId) formData.append("regionId", regionId);

    uploadLock.current = true;
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
      setError(
        getApiError(err)?.message ||
          "Unable to confirm this upload. Refresh import history before uploading again.",
      );
      setExistingImportId(recoveryImportId(err));
      void loadJobs();
    } finally {
      uploadLock.current = false;
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
        row also needs a beneficiary name and relationship; spouse details are optional. For
        non-teaching staff, School/District/beneficiary aren't needed — use Place of Work instead,
        and choose "Non-teaching staff" below. This is a different format from the{" "}
        <Link to="/imports/report20" className="font-semibold text-action-primary hover:underline">
          Report 20 payroll reconciliation upload
        </Link>
        , which reconciles existing members and doesn't enroll new ones. Not sure of the exact
        columns? Download the template above — we'll validate every row before anything is enrolled.
      </div>

      {error && (
        <div className="mb-4">
          <Alert tone="error">
            {error}{" "}
            {existingImportId && (
              <Link to={`/members/upload/${existingImportId}`} className="ml-1 font-bold underline">
                Open saved import #{existingImportId}
              </Link>
            )}
          </Alert>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-border-default bg-white p-6"
      >
        <div className="mb-5">
          <div className="mb-1.5 text-sm font-semibold text-text-strong">
            This file contains<b className="ml-1 text-danger">Required</b>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={uploading}
              aria-pressed={employmentCategory === "TEACHING"}
              onClick={() => setEmploymentCategory("TEACHING")}
              className={`min-h-10 flex-1 rounded-lg border px-3 text-sm font-semibold transition ${
                employmentCategory === "TEACHING"
                  ? "border-action-primary bg-info-soft text-text-strong"
                  : "border-border-default text-text-muted hover:border-action-primary"
              }`}
            >
              Teaching staff
            </button>
            <button
              type="button"
              disabled={uploading}
              aria-pressed={employmentCategory === "NON_TEACHING"}
              onClick={() => setEmploymentCategory("NON_TEACHING")}
              className={`min-h-10 flex-1 rounded-lg border px-3 text-sm font-semibold transition ${
                employmentCategory === "NON_TEACHING"
                  ? "border-action-primary bg-info-soft text-text-strong"
                  : "border-border-default text-text-muted hover:border-action-primary"
              }`}
            >
              Non-teaching staff
            </button>
          </div>
          {needsRegionPicker && (
            <div className="mt-3">
              <div className="mb-1.5 text-sm font-semibold text-text-strong">
                Region<b className="ml-1 text-danger">Required</b>
              </div>
              <Dropdown
                className="w-full"
                disabled={uploading}
                value={regionId}
                onChange={setRegionId}
                placeholder="Select a region"
                aria-label="Region for these non-teaching staff"
                options={regionOptions.map((r) => ({ value: String(r.id), label: r.name }))}
              />
            </div>
          )}
        </div>

        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border-default px-6 py-10 text-center transition hover:border-action-primary"
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
        </button>
        <input
          aria-label="Member import file"
          disabled={uploading}
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setError("");
            setExistingImportId(null);
          }}
          className="hidden"
        />

        {uploading && (
          <div className="mt-5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-info-soft">
              <div
                className="h-full origin-left rounded-full bg-action-primary transition-transform duration-200 motion-reduce:transition-none"
                role="progressbar"
                aria-label="File upload"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={uploadProgress}
                style={{ transform: `scaleX(${uploadProgress / 100})` }}
              />
            </div>
            <div className="mt-1.5 text-xs text-text-muted">
              {uploadProgress < 100 ? `Uploading… ${uploadProgress}%` : "Saving upload…"}
            </div>
          </div>
        )}

        <Button
          type="submit"
          disabled={!file || !employmentCategory || (needsRegionPicker && !regionId)}
          loading={uploading}
          loadingLabel={uploadProgress < 100 ? `Uploading… ${uploadProgress}%` : "Saving upload…"}
          className="mt-5"
        >
          Upload & Validate
        </Button>
      </form>

      <div className="mb-3 mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-text-strong">Import history</h2>
        <div className="flex flex-wrap gap-2">
          <Dropdown
            className="w-60"
            aria-label="Filter import history"
            value={historyStatus}
            onChange={(value) => {
              setHistoryStatus(value);
              setHistoryPage(1);
            }}
            options={[
              { value: "", label: "All imports" },
              { value: "PENDING", label: "Queued" },
              { value: "PROCESSING", label: "Processing" },
              { value: "COMPLETED", label: "Validation / enrollment finished" },
              { value: "FAILED", label: "Failed" },
            ]}
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={jobsLoading}
            onClick={() => void loadJobs()}
          >
            Refresh history
          </Button>
        </div>
      </div>

      {jobsError && (
        <div className="mb-4">
          <Alert tone="error">{jobsError}</Alert>
        </div>
      )}

      <TableFrame label="Recent member uploads" className="min-w-205">
        <thead>
          <tr className="border-b border-border-default bg-surface-hover text-xs font-semibold uppercase tracking-wide text-text-muted">
            <th className="px-4 py-2.5">No.</th>
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
          {jobsLoading && jobs.length === 0 ? (
            <TableSkeleton columns={9} />
          ) : jobs.length === 0 ? (
            <tr>
              <td colSpan={9}>
                {!jobsError && (
                  <EmptyState
                    title="No uploads yet"
                    description="Upload a member file to begin validation."
                  />
                )}
              </td>
            </tr>
          ) : (
            jobs.map((job, index) => (
              <tr
                key={job.id}
                className="border-b border-border-default last:border-0 hover:bg-surface-hover"
              >
                <td className="px-4 py-2.5 text-text-muted">
                  {(historyPage - 1) * 10 + index + 1}
                </td>
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
                  <StatusBadge tone={importStage(job).tone}>{importStage(job).label}</StatusBadge>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </TableFrame>
      <Pagination
        page={historyPage}
        totalPages={historyPages}
        totalItems={historyTotal}
        itemLabel="imports"
        onPageChange={setHistoryPage}
      />
    </div>
  );
}
