import { useEffect, useState } from "react";
import api from "@/lib/api";

type DashboardData = {
  members: {
    total: number;
    active: number;
    pending: number;
    flagged: number;
    returned: number;
    removed: number;
  };
  coverage: { spouses: number; beneficiaries: number };
  report20: {
    matchedMembers: number;
    unmatchedMembers: number;
    matchRate: number;
    latestImport: { reportMonth: string; status: string } | null;
  };
  transfers: { pending: number };
  claims: Record<string, number>;
  enrollmentGrowth: { month: string; count: number }[];
  recentActivity: {
    id: number;
    action: string;
    description: string;
    createdAt: string;
    actor: { id: number; fullName: string } | null;
  }[];
};

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div className="rounded-[12px] border border-[#e5e9f0] bg-white p-4">
      <div className="text-[11.5px] font-semibold text-[#5b6472]">{label}</div>
      <div
        className="mt-1.5 text-[22px] font-extrabold"
        style={{ color: accent ?? "#1e2761" }}
      >
        {value}
      </div>
    </div>
  );
}

function monthLabel(month: string) {
  const [year, m] = month.split("-");
  const date = new Date(Number(year), Number(m) - 1, 1);
  return date.toLocaleDateString(undefined, { month: "short" });
}

function EnrollmentChart({
  data,
}: {
  data: { month: string; count: number }[];
}) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex h-32 items-end gap-2">
      {data.map((d) => (
        <div key={d.month} className="flex flex-1 flex-col items-center gap-1.5">
          <div
            className="w-full rounded-t-[4px] bg-[#1f9c7c]"
            style={{ height: `${Math.max(4, (d.count / max) * 100)}px` }}
            title={`${d.month}: ${d.count}`}
          />
          <div className="text-[9.5px] text-[#5b6472]">{monthLabel(d.month)}</div>
        </div>
      ))}
    </div>
  );
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get("/dashboard");
        if (!cancelled) setData(res.data.data);
      } catch {
        if (!cancelled) setError("Unable to load dashboard data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="text-[13px] text-[#5b6472]">Loading dashboard…</div>;
  }

  if (error || !data) {
    return (
      <div className="rounded-[12px] border border-[#e5e9f0] bg-white p-6 text-[13px] text-[#5b6472]">
        {error || "No data available."}
      </div>
    );
  }

  const claimEntries = Object.entries(data.claims);

  return (
    <div>
      <h1 className="mb-5 text-[25px] font-extrabold text-[#1e2761]">
        Dashboard
      </h1>

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total Members" value={data.members.total} />
        <StatCard label="Active" value={data.members.active} accent="#17805f" />
        <StatCard label="Pending" value={data.members.pending} accent="#b9791a" />
        <StatCard label="Flagged" value={data.members.flagged} accent="#c23b3b" />
        <StatCard label="Removed" value={data.members.removed} accent="#5b6472" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3.5 lg:grid-cols-3">
        <StatCard
          label="Report 20 Match Rate"
          value={`${data.report20.matchRate}%`}
          accent="#1f9c7c"
        />
        <StatCard label="Pending Transfers" value={data.transfers.pending} />
        <StatCard
          label="Coverage (Spouses + Beneficiaries)"
          value={data.coverage.spouses + data.coverage.beneficiaries}
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3.5 lg:grid-cols-3">
        <div className="rounded-[12px] border border-[#e5e9f0] bg-white p-4 lg:col-span-2">
          <h2 className="mb-4 text-[15px] font-bold text-[#1e2761]">
            Enrollment Growth (12 months)
          </h2>
          <EnrollmentChart data={data.enrollmentGrowth} />
        </div>

        <div className="rounded-[12px] border border-[#e5e9f0] bg-white p-4">
          <h2 className="mb-3 text-[15px] font-bold text-[#1e2761]">
            Claims by Status
          </h2>
          {claimEntries.length === 0 ? (
            <div className="text-[12.5px] text-[#5b6472]">
              No claim submissions yet.
            </div>
          ) : (
            <ul className="space-y-2 text-[12.5px]">
              {claimEntries.map(([status, count]) => (
                <li key={status} className="flex justify-between">
                  <span className="text-[#5b6472]">{status}</span>
                  <span className="font-semibold text-[#171b26]">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-5 rounded-[12px] border border-[#e5e9f0] bg-white p-4">
        <h2 className="mb-3 text-[15px] font-bold text-[#1e2761]">
          Recent Activity
        </h2>
        {data.recentActivity.length === 0 ? (
          <div className="text-[12.5px] text-[#5b6472]">No recent activity.</div>
        ) : (
          <ul className="divide-y divide-[#e5e9f0]">
            {data.recentActivity.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 py-2.5">
                <div>
                  <div className="text-[12.5px] font-semibold text-[#171b26]">
                    {item.description}
                  </div>
                  <div className="text-[11px] text-[#5b6472]">
                    {item.actor?.fullName ?? "System"}
                  </div>
                </div>
                <div className="whitespace-nowrap text-[11px] text-[#5b6472]">
                  {timeAgo(item.createdAt)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
