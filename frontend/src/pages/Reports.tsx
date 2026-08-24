import { useState } from "react";
import api from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Feedback";
import Button from "@/components/ui/Button";
import { useAuth } from "@/lib/AuthContext";

type ReportDef = {
  key: string;
  path: string;
  filename: string;
  title: string;
  description: string;
  roles?: string[];
};

const REPORTS: ReportDef[] = [
  {
    key: "membership",
    path: "/reports/membership.csv",
    filename: "membership-roster.csv",
    title: "Membership Roster",
    description:
      "Every member in your access scope, with status, Report 20 match, spouse and beneficiary counts.",
  },
  {
    key: "reconciliation",
    path: "/reports/reconciliation.csv",
    filename: "report-20-reconciliation.csv",
    title: "Report 20 Reconciliation",
    description:
      "Every row from the most recent Report 20 file, including unmatched, duplicate, and invalid rows.",
    roles: ["SUPER_ADMIN", "NATIONAL_ADMIN"],
  },
  // {
  //   key: "transfers",
  //   path: "/reports/transfers.csv",
  //   filename: "transfers.csv",
  //   title: "Transfers",
  //   description: "All district transfer requests, their review outcome, and effective dates.",
  // },
  {
    key: "removals",
    path: "/reports/removals.csv",
    filename: "removed-members.csv",
    title: "Removed Members",
    description:
      "Members currently marked as Removed, with their last known school and district.",
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
  const { user } = useAuth();
  const visibleReports = REPORTS.filter(
    (report) => !report.roles || (user && report.roles.includes(user.role)),
  );
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
      <PageHeader
        title="Reports"
        description="Export CSV reports scoped to your access level. Large national reports may take a moment to prepare."
      />

      {error && (
        <div className="mb-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleReports.map((report) => (
          <div
            key={report.key}
            className="flex flex-col justify-between rounded-[12px] border border-[#e5e9f0] bg-white p-5"
          >
            <div>
              <h2 className="text-[14.5px] font-bold text-[#1e2761]">
                {report.title}
              </h2>
              <p className="mt-1.5 text-[12px] leading-relaxed text-[#5b6472]">
                {report.description}
              </p>
            </div>
            <Button
              onClick={() => void download(report)}
              loading={busyKey === report.key}
              loadingLabel="Preparing…"
              className="mt-4 self-start"
            >
              Download CSV
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
