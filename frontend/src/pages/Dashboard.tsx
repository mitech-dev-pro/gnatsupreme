import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import "./Dashboard.css";

type DashboardData = {
  members: {
    total: number;
    active: number;
    pending: number;
    flagged: number;
    returned: number;
    removed: number;
    inactive: number;
    missingFromReport20: number;
  };
  coverage: { spouses: number; beneficiaries: number };
  report20: {
    matchedMembers: number;
    unmatchedMembers: number;
    matchRate: number;
    latestImport: {
      id: number;
      reportMonth: string;
      status: string;
      unmatchedRows: number;
    } | null;
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

const icons = {
  members: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  active: (
    <>
      <path d="M20 6 9 17l-5-5" />
    </>
  ),
  pending: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  flagged: (
    <>
      <path d="M5 22V4m0 0h11l-2 4 2 4H5" />
    </>
  ),
};

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function Metric({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  tone: string;
}) {
  return (
    <article className="dash-metric">
      <div className={`dash-metric__icon ${tone}`}>
        <Icon>{icon}</Icon>
      </div>
      <div>
        <p>{label}</p>
        <strong>{value.toLocaleString()}</strong>
      </div>
    </article>
  );
}

function timeAgo(value: string) {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 60_000),
  );
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

function EnrollmentChart({
  data,
}: {
  data: DashboardData["enrollmentGrowth"];
}) {
  const hasEnrollment = data.some((item) => item.count > 0);
  if (!hasEnrollment)
    return (
      <div className="dash-chart-empty">
        <div className="dash-chart-empty__lines">
          <span />
          <span />
          <span />
        </div>
        <p>Enrollment trends will appear after members are added.</p>
        <Link to="/members/new">Add the first member</Link>
      </div>
    );
  const max = Math.max(...data.map((item) => item.count), 1);
  return (
    <div className="dash-bars">
      {data.map((item) => (
        <div className="dash-bar" key={item.month}>
          <strong>{item.count || ""}</strong>
          <span
            style={{ height: `${Math.max(5, (item.count / max) * 128)}px` }}
          />
          <small>
            {new Date(`${item.month}-01T00:00:00`).toLocaleDateString(
              undefined,
              { month: "short" },
            )}
          </small>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/dashboard");
      setData(response.data.data);
    } catch {
      setError(
        "Dashboard data could not be loaded. Confirm that the API is running, then try again.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading)
    return (
      <div className="dash-skeleton" aria-label="Loading dashboard">
        <span />
        <div>
          <span />
          <span />
          <span />
          <span />
        </div>
        <span />
      </div>
    );
  if (error || !data)
    return (
      <div className="dash-error">
        <div>!</div>
        <h1>Dashboard unavailable</h1>
        <p>{error || "No dashboard data is available."}</p>
        <button onClick={() => void load()}>Try again</button>
      </div>
    );

  const claims = Object.entries(data.claims);
  const claimsTotal = claims.reduce((sum, [, count]) => sum + count, 0);
  const firstName = user?.fullName?.trim().split(/\s+/)[0];

  const today = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <div className="dashboard">
      <header className="dash-heading">
        <div>
          <p>{today}</p>
          <h1>Good morning{firstName ? `, ${firstName}` : ""}</h1>
          <span>
            A quick view of membership operations and current exceptions.
          </span>
        </div>
        <div className="dash-actions">
          <Link className="dash-button dash-button--quiet" to="/members/upload">
            Import members
          </Link>
          <Link className="dash-button dash-button--primary" to="/members/new">
            <b>+</b> Add member
          </Link>
        </div>
      </header>

      <section className="dash-metrics" aria-label="Membership summary">
        <Metric
          label="Total members"
          value={data.members.total}
          icon={icons.members}
          tone="navy"
        />
        <Metric
          label="Active members"
          value={data.members.active}
          icon={icons.active}
          tone="green"
        />
        <Metric
          label="Pending approval"
          value={data.members.pending}
          icon={icons.pending}
          tone="amber"
        />
        <Metric
          label="Needs attention"
          value={
            data.members.flagged + data.members.returned + data.members.inactive
          }
          icon={icons.flagged}
          tone="red"
        />
      </section>

      <div className="dash-grid">
        <section className="dash-panel dash-panel--chart">
          <div className="dash-panel__heading">
            <div>
              <h2>Enrollment</h2>
              <p>Members added during the last 12 months</p>
            </div>
            <Link to="/members">View members</Link>
          </div>
          <EnrollmentChart data={data.enrollmentGrowth} />
        </section>

        <section className="dash-panel dash-health">
          <div className="dash-panel__heading">
            <div>
              <h2>Operational health</h2>
              <p>Items requiring review</p>
            </div>
          </div>
          <div className="dash-health__score">
            <div
              style={
                {
                  "--score": `${data.report20.matchRate * 3.6}deg`,
                } as CSSProperties
              }
            >
              <strong>{data.report20.matchRate}%</strong>
              <span>latest upload</span>
            </div>
            <p>Report 20 reconciliation</p>
          </div>
          <ul>
            <li>
              <span className="amber" />
              Pending transfers <strong>{data.transfers.pending}</strong>
            </li>
            <li>
              <span className="red" />
              Flagged members <strong>{data.members.flagged}</strong>
            </li>
            <li>
              <span className="amber" />
              Missing from Report 20{" "}
              <strong>
                <Link to="/members?missingFromReport20=1">
                  {data.members.missingFromReport20.toLocaleString()}
                </Link>
              </strong>
            </li>
            <li>
              <span className="navy" />
              Unmatched in latest file{" "}
              <strong>
                {data.report20.latestImport ? (
                  <Link
                    to={`/imports/report20/${data.report20.latestImport.id}`}
                  >
                    {data.report20.latestImport.unmatchedRows.toLocaleString()}
                  </Link>
                ) : (
                  0
                )}
              </strong>
            </li>
          </ul>
          <Link className="dash-text-link" to="/imports/report20">
            Review Report 20 <span>→</span>
          </Link>
        </section>
      </div>

      <div className="dash-lower-grid">
        <section className="dash-panel dash-activity">
          <div className="dash-panel__heading">
            <div>
              <h2>Recent activity</h2>
              <p>Latest actions across the system</p>
            </div>
          </div>
          {data.recentActivity.length === 0 ? (
            <div className="dash-empty">
              <p>No activity has been recorded yet.</p>
            </div>
          ) : (
            <ul>
              {data.recentActivity.slice(0, 6).map((item) => (
                <li key={item.id}>
                  <div className="dash-activity__avatar">
                    {item.actor?.fullName?.charAt(0) || "S"}
                  </div>
                  <div>
                    <strong>{item.description}</strong>
                    <span>{item.actor?.fullName ?? "System"}</span>
                  </div>
                  <time dateTime={item.createdAt}>
                    {timeAgo(item.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="dash-panel dash-quick">
          <div className="dash-panel__heading">
            <div>
              <h2>At a glance</h2>
              <p>Coverage and claims</p>
            </div>
          </div>
          <dl>
            <div>
              <dt>Covered family members</dt>
              <dd>
                {(
                  data.coverage.spouses + data.coverage.beneficiaries
                ).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt>Claims submitted</dt>
              <dd>{claimsTotal.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Members removed</dt>
              <dd>{data.members.removed.toLocaleString()}</dd>
            </div>
          </dl>
          {claimsTotal === 0 && (
            <p className="dash-quick__note">
              Claim status totals will appear here after Mankrado begins sending
              submissions.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
