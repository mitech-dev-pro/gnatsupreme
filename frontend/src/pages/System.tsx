import { Fragment, useCallback, useEffect, useState, type FormEvent } from "react";
import api from "@/lib/api";
import ConfirmationPanel from "@/components/ui/ConfirmationPanel";
import Dropdown from "@/components/ui/Dropdown";
import { InputField } from "@/components/ui/FormField";
import { Alert, EmptyState, TableSkeleton } from "@/components/ui/Feedback";
import Button from "@/components/ui/Button";
import PageHeader from "@/components/ui/PageHeader";
import Pagination from "@/components/ui/Pagination";
import StatusBadge from "@/components/ui/StatusBadge";
import TableFrame from "@/components/ui/TableFrame";
import { useAuth } from "@/lib/AuthContext";
import { useDistricts } from "@/lib/useDistricts";

type StaffUser = {
  id: number;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
  regionId: number | null;
  districtId: number | null;
  region: { id: number; name: string } | null;
  district: { id: number; name: string } | null;
  createdAt: string;
};

type AuditLog = {
  id: number;
  action: string;
  entityType: string | null;
  entityId: string | null;
  description: string;
  createdAt: string;
  actor: { id: number; fullName: string; email: string; role: string } | null;
  actorEmail: string | null;
  beforeData: unknown;
  afterData: unknown;
};

const ROLES = ["SUPER_ADMIN", "NATIONAL_ADMIN", "REGIONAL_ADMIN", "DISTRICT_ADMIN"];
const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  NATIONAL_ADMIN: "National Admin",
  REGIONAL_ADMIN: "Regional Admin",
  DISTRICT_ADMIN: "District Admin",
};

const inputClasses =
  "w-full rounded-[9px] border border-[#e5e9f0] bg-[#fbfcfe] px-3 py-2 text-[12.5px] transition focus:border-[#1f9c7c] focus:shadow-[0_0_0_3px_#dff7ee] focus:outline-none";
const labelClasses = "mb-1 block text-[11px] font-bold text-[#1e2761]";
const tabButton = (active: boolean) =>
  `rounded-[9px] px-4 py-2 text-[12.5px] font-bold transition ${
    active ? "bg-[#1e2761] text-white" : "border border-[#e5e9f0] text-[#1e2761] hover:bg-[#fafbfd]"
  }`;

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function StaffAccountsTab({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const { districts } = useDistricts();
  const regions = Array.from(new Map(districts.map((d) => [d.region.id, d.region])).values());
  const [rows, setRows] = useState<StaffUser[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [form, setForm] = useState({ fullName: "", email: "", role: "DISTRICT_ADMIN", regionId: "", districtId: "", password: "" });
  const [formError, setFormError] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [statusTarget, setStatusTarget] = useState<StaffUser | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<StaffUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [success, setSuccess] = useState("");

  const availableRoles = isSuperAdmin ? ROLES : ROLES.filter((r) => r !== "SUPER_ADMIN");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/users", { params: { page, limit: 20, search: search || undefined, role: roleFilter || undefined } });
      setRows(res.data.data);
      setTotal(res.data.pagination.total);
      setTotalPages(Math.max(1, res.data.pagination.totalPages));
    } catch {
      setError("Staff accounts could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [page, roleFilter, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => setForm({ fullName: "", email: "", role: "DISTRICT_ADMIN", regionId: "", districtId: "", password: "" });

  const startEdit = (row: StaffUser) => {
    setEditingId(row.id);
    setShowCreate(false);
    setForm({
      fullName: row.fullName,
      email: row.email,
      role: row.role,
      regionId: row.regionId ? String(row.regionId) : "",
      districtId: row.districtId ? String(row.districtId) : "",
      password: "",
    });
    setFormError("");
  };

  const submitCreate = async (event: FormEvent) => {
    event.preventDefault();
    setFormBusy(true);
    setFormError("");
    try {
      await api.post("/users", {
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        role: form.role,
        regionId: form.role === "REGIONAL_ADMIN" ? Number(form.regionId) : form.role === "DISTRICT_ADMIN" ? undefined : null,
        districtId: form.role === "DISTRICT_ADMIN" ? Number(form.districtId) : null,
        password: form.password,
      });
      resetForm();
      setShowCreate(false);
      await load();
    } catch (err: any) {
      setFormError(err?.response?.data?.errors?.map((i: any) => i.message).join(" ") || err?.response?.data?.message || "Unable to create this account.");
    } finally {
      setFormBusy(false);
    }
  };

  const submitEdit = async (id: number) => {
    setFormBusy(true);
    setFormError("");
    try {
      await api.patch(`/users/${id}`, {
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        role: form.role,
        regionId: form.role === "REGIONAL_ADMIN" ? Number(form.regionId) : form.role === "DISTRICT_ADMIN" ? undefined : null,
        districtId: form.role === "DISTRICT_ADMIN" ? Number(form.districtId) : null,
      });
      setEditingId(null);
      resetForm();
      await load();
    } catch (err: any) {
      setFormError(err?.response?.data?.errors?.map((i: any) => i.message).join(" ") || err?.response?.data?.message || "Unable to update this account.");
    } finally {
      setFormBusy(false);
    }
  };

  const toggleActive = async (row: StaffUser) => {
    setBusyId(row.id);
    setError("");
    try {
      await api.patch(`/users/${row.id}/status`, { isActive: !row.isActive });
      setStatusTarget(null);
      setSuccess(`${row.fullName} was ${row.isActive ? "deactivated" : "activated"}.`);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || "Unable to update this account's status.");
    } finally {
      setBusyId(null);
    }
  };

  const resetPassword = async (row: StaffUser) => {
    if (!newPassword) return;
    setBusyId(row.id);
    setError("");
    try {
      await api.patch(`/users/${row.id}/password`, { password: newPassword });
      setPasswordTarget(null);
      setNewPassword("");
      setSuccess(`Password updated for ${row.fullName}. Existing sessions were revoked.`);
    } catch (err: any) {
      setError(err?.response?.data?.message || "Unable to reset this account's password.");
    } finally {
      setBusyId(null);
    }
  };

  const roleFields = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <label className={labelClasses}>Full Name</label>
        <input value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} className={inputClasses} required />
      </div>
      <div>
        <label className={labelClasses}>Email</label>
        <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={inputClasses} required />
      </div>
      <div>
        <label className={labelClasses}>Role</label>
        <Dropdown
          value={form.role}
          onChange={(value) => setForm((f) => ({ ...f, role: value, regionId: "", districtId: "" }))}
          options={availableRoles.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
        />
      </div>
      {form.role === "REGIONAL_ADMIN" && (
        <div>
          <label className={labelClasses}>Region</label>
          <Dropdown
            value={form.regionId}
            onChange={(value) => setForm((f) => ({ ...f, regionId: value }))}
            placeholder="Select region"
            options={regions.map((r) => ({ value: String(r.id), label: r.name }))}
          />
        </div>
      )}
      {form.role === "DISTRICT_ADMIN" && (
        <div>
          <label className={labelClasses}>District</label>
          <Dropdown
            value={form.districtId}
            onChange={(value) => setForm((f) => ({ ...f, districtId: value }))}
            placeholder="Select district"
            options={districts.map((d) => ({ value: String(d.id), label: `${d.name} (${d.region.name})` }))}
          />
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email" className={`max-w-64 ${inputClasses}`} />
          <Dropdown
            className="w-48"
            value={roleFilter}
            onChange={(value) => { setRoleFilter(value); setPage(1); }}
            options={[{ value: "", label: "All roles" }, ...ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))]}
          />
        </div>
        <Button
          variant={showCreate ? "secondary" : "primary"}
          onClick={() => {
            setShowCreate((v) => !v);
            setEditingId(null);
            resetForm();
            setFormError("");
          }}
        >
          {showCreate ? "Close" : "Add Staff Account"}
        </Button>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {success && <Alert tone="success">{success}</Alert>}

      {statusTarget && (
        <ConfirmationPanel
          title={`${statusTarget.isActive ? "Deactivate" : "Activate"} ${statusTarget.fullName}?`}
          description={statusTarget.isActive ? "This person will immediately lose access. Existing sessions may no longer be usable." : "This person will regain access according to their assigned role and scope."}
          confirmLabel={statusTarget.isActive ? "Deactivate account" : "Activate account"}
          busyLabel="Updating…"
          busy={busyId === statusTarget.id}
          onConfirm={() => void toggleActive(statusTarget)}
          onCancel={() => setStatusTarget(null)}
        />
      )}

      {passwordTarget && (
        <ConfirmationPanel
          title={`Set a new password for ${passwordTarget.fullName}`}
          description="Saving the new password will revoke this user's existing sessions. Share the password through an approved secure channel."
          confirmLabel="Update password"
          busyLabel="Updating…"
          busy={busyId === passwordTarget.id}
          onConfirm={() => void resetPassword(passwordTarget)}
          onCancel={() => { setPasswordTarget(null); setNewPassword(""); }}
        >
          <div className="mt-4 max-w-96">
            <InputField
              label="New temporary password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              hint="At least 12 characters with mixed case, a number, and a symbol."
              autoComplete="new-password"
            />
          </div>
        </ConfirmationPanel>
      )}

      {showCreate && (
        <form onSubmit={submitCreate} className="rounded-[12px] border border-[#e5e9f0] bg-white p-5">
          <h2 className="mb-4 text-[14.5px] font-bold text-[#1e2761]">New staff account</h2>
          {roleFields}
          <div className="mt-4 max-w-80">
            <label className={labelClasses}>Temporary Password</label>
            <input
              type="text"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="At least 12 characters, mixed case, number, symbol"
              className={inputClasses}
              required
            />
          </div>
          {formError && <div className="mt-3 rounded-lg bg-[#fbe9e9] px-3 py-2 text-[12.5px] font-semibold text-[#c23b3b]">{formError}</div>}
          <button type="submit" disabled={formBusy} className="mt-4 rounded-[9px] bg-[#1f9c7c] px-5 py-2.5 text-[13px] font-bold text-white disabled:opacity-60">
            {formBusy ? "Creating…" : "Create account"}
          </button>
        </form>
      )}

      <TableFrame label="Staff accounts" className="min-w-[820px]">
            <thead>
              <tr className="border-b border-[#e5e9f0] bg-[#fafbfd] text-[11px] font-semibold uppercase tracking-wide text-[#5b6472]">
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Email</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5">Scope</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton columns={6} />
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6}><EmptyState title="No staff accounts found" description="No accounts match the current search and role filters." /></td>
                </tr>
              ) : (
                rows.map((row) => (
                  <Fragment key={row.id}>
                    <tr className="border-b border-[#e5e9f0] last:border-0">
                      <td className="px-4 py-2.5 font-semibold text-[#171b26]">{row.fullName}</td>
                      <td className="px-4 py-2.5 text-[#5b6472]">{row.email}</td>
                      <td className="px-4 py-2.5">{ROLE_LABELS[row.role] ?? row.role}</td>
                      <td className="px-4 py-2.5 text-[#5b6472]">{row.district?.name ?? row.region?.name ?? "National"}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge tone={row.isActive ? "success" : "danger"}>
                          {row.isActive ? "Active" : "Inactive"}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1.5">
                          <button type="button" onClick={() => startEdit(row)} className="rounded-[7px] border border-[#e5e9f0] px-2.5 py-1 text-[11.5px] font-semibold text-[#1e2761]">
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => { setPasswordTarget(row); setStatusTarget(null); setNewPassword(""); setSuccess(""); }}
                            disabled={busyId === row.id}
                            className="rounded-[7px] border border-[#e5e9f0] px-2.5 py-1 text-[11.5px] font-semibold text-[#1e2761] disabled:opacity-60"
                          >
                            Reset password
                          </button>
                          <button
                            type="button"
                            onClick={() => { setStatusTarget(row); setPasswordTarget(null); setSuccess(""); }}
                            disabled={busyId === row.id}
                            className={`rounded-[7px] border px-2.5 py-1 text-[11.5px] font-semibold disabled:opacity-60 ${row.isActive ? "border-[#c23b3b] text-[#c23b3b]" : "border-[#17805f] text-[#17805f]"}`}
                          >
                            {row.isActive ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {editingId === row.id && (
                      <tr className="border-b border-[#e5e9f0] bg-[#fafbfd]">
                        <td colSpan={6} className="px-4 py-4">
                          {roleFields}
                          {formError && <div className="mt-3 rounded-lg bg-[#fbe9e9] px-3 py-2 text-[12.5px] font-semibold text-[#c23b3b]">{formError}</div>}
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() => void submitEdit(row.id)}
                              disabled={formBusy}
                              className="rounded-[9px] bg-[#1f9c7c] px-4 py-2 text-[12.5px] font-bold text-white disabled:opacity-60"
                            >
                              {formBusy ? "Saving…" : "Save"}
                            </button>
                            <button type="button" onClick={() => setEditingId(null)} className="rounded-[9px] border border-[#e5e9f0] px-4 py-2 text-[12.5px] font-semibold text-[#1e2761]">
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
      </TableFrame>

      <Pagination page={page} totalPages={totalPages} totalItems={total} itemLabel="accounts" onPageChange={setPage} />
    </div>
  );
}

function AuditLogTab() {
  const [rows, setRows] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/audit-logs", { params: { page, limit: 30, search: search || undefined, action: action || undefined } });
      setRows(res.data.data);
      setTotal(res.data.pagination.total);
      setTotalPages(Math.max(1, res.data.pagination.totalPages));
    } catch {
      setError("Audit log could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [action, page, search]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search description"
          className={`max-w-72 ${inputClasses}`}
        />
        <input
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
          placeholder="Filter by action (e.g. USER_CREATED)"
          className={`max-w-72 ${inputClasses}`}
        />
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <TableFrame label="Audit log" className="min-w-[800px]">
            <thead>
              <tr className="border-b border-[#e5e9f0] bg-[#fafbfd] text-[11px] font-semibold uppercase tracking-wide text-[#5b6472]">
                <th className="px-4 py-2.5">When</th>
                <th className="px-4 py-2.5">Actor</th>
                <th className="px-4 py-2.5">Action</th>
                <th className="px-4 py-2.5">Description</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton columns={4} />
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4}><EmptyState title="No audit entries found" description="No recorded activity matches the current description and action filters." /></td>
                </tr>
              ) : (
                rows.map((row) => {
                  const hasDiff = row.beforeData !== null || row.afterData !== null;
                  const expanded = expandedId === row.id;
                  return (
                    <Fragment key={row.id}>
                      <tr
                        onClick={() => hasDiff && setExpandedId(expanded ? null : row.id)}
                        className={`border-b border-[#e5e9f0] last:border-0 ${hasDiff ? "cursor-pointer hover:bg-[#fafbfd]" : ""}`}
                      >
                        <td className="px-4 py-2.5 text-[#5b6472]">{formatDateTime(row.createdAt)}</td>
                        <td className="px-4 py-2.5">{row.actor?.fullName ?? row.actorEmail ?? "System"}</td>
                        <td className="px-4 py-2.5">
                          <code className="rounded bg-[#eef0fa] px-1.5 py-0.5 text-[11px] text-[#1e2761]">{row.action}</code>
                        </td>
                        <td className="px-4 py-2.5 text-[#171b26]">
                          {row.description}
                          {hasDiff && (
                            <span className="ml-2 text-[10.5px] font-semibold text-[#1f9c7c]">
                              {expanded ? "Hide details" : "View details"}
                            </span>
                          )}
                        </td>
                      </tr>
                      {expanded && hasDiff && (
                        <tr className="border-b border-[#e5e9f0] bg-[#fbfcfe] last:border-0">
                          <td colSpan={4} className="px-4 py-3">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                              <div>
                                <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-[#5b6472]">Before</div>
                                <pre className="max-h-64 overflow-auto rounded-[8px] border border-[#e5e9f0] bg-white p-2.5 text-[11px] text-[#171b26]">
                                  {row.beforeData ? JSON.stringify(row.beforeData, null, 2) : "—"}
                                </pre>
                              </div>
                              <div>
                                <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-[#5b6472]">After</div>
                                <pre className="max-h-64 overflow-auto rounded-[8px] border border-[#e5e9f0] bg-white p-2.5 text-[11px] text-[#171b26]">
                                  {row.afterData ? JSON.stringify(row.afterData, null, 2) : "—"}
                                </pre>
                              </div>
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

      <Pagination page={page} totalPages={totalPages} totalItems={total} itemLabel="entries" onPageChange={setPage} />
    </div>
  );
}

const VIEW_ROLES = ["SUPER_ADMIN", "NATIONAL_ADMIN"];

export default function System() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const canView = user ? VIEW_ROLES.includes(user.role) : false;
  const [tab, setTab] = useState<"users" | "audit">("users");

  if (!canView) {
    return (
      <div className="rounded-[12px] border border-[#e5e9f0] bg-white p-6 text-[13px] text-[#5b6472]">
        System is available to National Admins and above.
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Staff & Audit" description="Manage staff accounts and review the full activity audit trail." />

      <div className="mb-5 flex gap-2" role="tablist" aria-label="System sections">
        <button type="button" role="tab" aria-selected={tab === "users"} onClick={() => setTab("users")} className={tabButton(tab === "users")}>
          Staff Accounts
        </button>
        <button type="button" role="tab" aria-selected={tab === "audit"} onClick={() => setTab("audit")} className={tabButton(tab === "audit")}>
          Audit Log
        </button>
      </div>

      {tab === "users" ? <StaffAccountsTab isSuperAdmin={isSuperAdmin} /> : <AuditLogTab />}
    </div>
  );
}
