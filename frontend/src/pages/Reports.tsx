import { useState } from "react";
import api from "@/lib/api";

type ReportDef = {
  key: string;
  path: string;
  filename: string;
  title: string;
  description: string;
};

const REPORTS: ReportDef[] = [
  {
    key: "membership",
    path: "/reports/membership.csv",
    filename: "membership-roster.csv",
    title: "Membership Roster",
    description: "Every member in your access scope, with status, Report 20 match, spouse and beneficiary counts.",
  },
  {
    key: "reconciliation",
    path: "/reports/reconciliation.csv",
    filename: "report-20-reconciliation.csv",
    title: "Report 20 Reconciliation",
    description: "Member status against the most recent Report 20 match outcome.",
  },
  {
    key: "transfers",
    path: "/reports/transfers.csv",
    filename: "transfers.csv",
    title: "Transfers",
    description: "All district transfer requests, their review outcome, and effective dates.",
  },
  {
    key: "removals",
    path: "/reports/removals.csv",
    filename: "removed-members.csv",
    title: "Removed Members",
    description: "Members currently marked as Removed, with their last known school and district.",
  },
  {
    key: "claims",
    path: "/reports/claims.csv",
    filename: "claims.csv",
    title: "Claim Submissions",
    description: "External claim submissions and their synchronization status.",
  },
];

export default function Reports() {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState("");

  const download = async (report: ReportDef) => {
    setBusyKey(report.key);
    setError("");
    try {
      const res = await api.get(report.path, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = report.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      setError(`Unable to download ${report.title}. Try again.`);
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div>
      <h1 className="mb-1 text-[22px] font-extrabold text-[#1e2761]">Reports</h1>
      <div className="mb-5 text-[12.5px] text-[#5b6472]">
        Export CSV reports scoped to your access level. Large reports stream directly from the
        server, so exports may take a moment for national-level data.
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-[#fbe9e9] px-3 py-2 text-[12.5px] font-semibold text-[#c23b3b]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((report) => (
          <div
            key={report.key}
            className="flex flex-col justify-between rounded-[12px] border border-[#e5e9f0] bg-white p-5"
          >
            <div>
              <h2 className="text-[14.5px] font-bold text-[#1e2761]">{report.title}</h2>
              <p className="mt-1.5 text-[12px] leading-relaxed text-[#5b6472]">
                {report.description}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void download(report)}
              disabled={busyKey === report.key}
              className="mt-4 self-start rounded-[9px] bg-[#1f9c7c] px-4 py-2 text-[12.5px] font-bold text-white shadow-[0_2px_6px_rgba(31,156,124,0.35)] transition hover:bg-[#17805f] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyKey === report.key ? "Preparing…" : "Download CSV"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
