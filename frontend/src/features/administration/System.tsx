import { AuditLogTab } from "./AuditLogTab";
import { StaffAccountsTab } from "./StaffAccountsTab";
import PageHeader from "@/components/ui/PageHeader";
import { tabButton } from "./System.model";
import { useSystem } from "./useSystem";
export default function System() {
  const { isSuperAdmin, canView, tab, setTab } = useSystem();
  if (!canView) {
    return (
      <div className="rounded-xl border border-border-default bg-white p-6 text-sm text-text-muted">
        System is available to National Admins and above.
      </div>
    );
  }
  return (
    <div>
      <PageHeader
        title="Staff & Audit"
        description="Manage staff accounts and review the full activity audit trail."
      />

      <div className="mb-5 flex gap-2" role="tablist" aria-label="System sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "users"}
          onClick={() => setTab("users")}
          className={tabButton(tab === "users")}
        >
          Staff Accounts
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "audit"}
          onClick={() => setTab("audit")}
          className={tabButton(tab === "audit")}
        >
          Audit Log
        </button>
      </div>

      {tab === "users" ? <StaffAccountsTab isSuperAdmin={isSuperAdmin} /> : <AuditLogTab />}
    </div>
  );
}
