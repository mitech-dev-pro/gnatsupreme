import Button from "@/components/ui/Button";
import ConfirmationPanel from "@/components/ui/ConfirmationPanel";
import Dropdown from "@/components/ui/Dropdown";
import { Alert, EmptyState, TableSkeleton } from "@/components/ui/Feedback";
import { InputField } from "@/components/ui/FormField";
import Pagination from "@/components/ui/Pagination";
import StatusBadge from "@/components/ui/StatusBadge";
import TableFrame from "@/components/ui/TableFrame";
import api from "@/lib/api";
import { getApiError } from "@/lib/errorExtract";
import { useDistricts } from "@/lib/useDistricts";
import { Fragment, useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ROLES,
  ROLE_LABELS,
  inputClasses,
  labelClasses,
  useDebouncedValue,
  type StaffUser,
} from "./System.model";
export function StaffAccountsTab({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const { districts } = useDistricts();
  const regions = Array.from(new Map(districts.map((d) => [d.region.id, d.region])).values());
  const [rows, setRows] = useState<StaffUser[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [roleFilter, setRoleFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    role: "DISTRICT_ADMIN",
    regionId: "",
    districtId: "",
    password: "",
  });
  const [formError, setFormError] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [statusTarget, setStatusTarget] = useState<StaffUser | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<StaffUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [success, setSuccess] = useState("");

  const availableRoles = isSuperAdmin ? ROLES : ROLES.filter((r) => r !== "SUPER_ADMIN");

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const res = await api.get("/users", {
          signal,
          params: {
            page,
            limit: 20,
            search: debouncedSearch || undefined,
            role: roleFilter || undefined,
          },
        });
        setRows(res.data.data);
        setTotal(res.data.pagination.total);
        setTotalPages(Math.max(1, res.data.pagination.totalPages));
      } catch {
        if (!signal?.aborted) setError("Staff accounts could not be loaded.");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [debouncedSearch, page, roleFilter],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const resetForm = () =>
    setForm({
      fullName: "",
      email: "",
      role: "DISTRICT_ADMIN",
      regionId: "",
      districtId: "",
      password: "",
    });

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
        regionId:
          form.role === "REGIONAL_ADMIN"
            ? Number(form.regionId)
            : form.role === "DISTRICT_ADMIN"
              ? undefined
              : null,
        districtId: form.role === "DISTRICT_ADMIN" ? Number(form.districtId) : null,
        password: form.password,
      });
      resetForm();
      setShowCreate(false);
      await load();
    } catch (err: unknown) {
      setFormError(
        getApiError(err)
          ?.errors?.map((i) => i.message)
          .join(" ") ||
          getApiError(err)?.message ||
          "Unable to create this account.",
      );
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
        regionId:
          form.role === "REGIONAL_ADMIN"
            ? Number(form.regionId)
            : form.role === "DISTRICT_ADMIN"
              ? undefined
              : null,
        districtId: form.role === "DISTRICT_ADMIN" ? Number(form.districtId) : null,
      });
      setEditingId(null);
      resetForm();
      await load();
    } catch (err: unknown) {
      setFormError(
        getApiError(err)
          ?.errors?.map((i) => i.message)
          .join(" ") ||
          getApiError(err)?.message ||
          "Unable to update this account.",
      );
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
    } catch (err: unknown) {
      setError(getApiError(err)?.message || "Unable to update this account's status.");
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
    } catch (err: unknown) {
      setError(getApiError(err)?.message || "Unable to reset this account's password.");
    } finally {
      setBusyId(null);
    }
  };

  const roleFields = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <label className={labelClasses}>Full Name</label>
        <input
          value={form.fullName}
          onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
          className={inputClasses}
          required
        />
      </div>
      <div>
        <label className={labelClasses}>Email</label>
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          className={inputClasses}
          required
        />
      </div>
      <div>
        <label className={labelClasses}>Role</label>
        <Dropdown
          value={form.role}
          onChange={(value) =>
            setForm((f) => ({ ...f, role: value, regionId: "", districtId: "" }))
          }
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
            options={districts.map((d) => ({
              value: String(d.id),
              label: `${d.name} (${d.region.name})`,
            }))}
          />
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search name or email"
            className={`max-w-64 ${inputClasses}`}
          />
          <Dropdown
            className="w-48"
            value={roleFilter}
            onChange={(value) => {
              setRoleFilter(value);
              setPage(1);
            }}
            options={[
              { value: "", label: "All roles" },
              ...ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] })),
            ]}
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
          description={
            statusTarget.isActive
              ? "This person will immediately lose access. Existing sessions may no longer be usable."
              : "This person will regain access according to their assigned role and scope."
          }
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
          onCancel={() => {
            setPasswordTarget(null);
            setNewPassword("");
          }}
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
        <form
          onSubmit={submitCreate}
          className="rounded-xl border border-border-default bg-white p-5"
        >
          <h2 className="mb-4 text-lg font-bold text-text-strong">New staff account</h2>
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
          {formError && (
            <div className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">
              {formError}
            </div>
          )}
          <button
            type="submit"
            disabled={formBusy}
            className="mt-4 rounded-lg bg-action-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {formBusy ? "Creating…" : "Create account"}
          </button>
        </form>
      )}

      <TableFrame label="Staff accounts" className="min-w-205">
        <thead>
          <tr className="border-b border-border-default bg-surface-hover text-xs font-semibold uppercase tracking-wide text-text-muted">
            <th className="px-4 py-2.5">Name</th>
            <th className="px-4 py-2.5">Email</th>
            <th className="px-4 py-2.5">Role</th>
            <th className="px-4 py-2.5">Scope</th>
            <th className="px-4 py-2.5">Status</th>
            <th className="px-4 py-2.5">Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading && rows.length === 0 ? (
            <TableSkeleton columns={6} />
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={6}>
                <EmptyState
                  title="No staff accounts found"
                  description="No accounts match the current search and role filters."
                />
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <Fragment key={row.id}>
                <tr className="border-b border-border-default last:border-0">
                  <td className="px-4 py-2.5 font-semibold text-ink">{row.fullName}</td>
                  <td className="px-4 py-2.5 text-text-muted">{row.email}</td>
                  <td className="px-4 py-2.5">{ROLE_LABELS[row.role] ?? row.role}</td>
                  <td className="px-4 py-2.5 text-text-muted">
                    {row.district?.name ?? row.region?.name ?? "National"}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge tone={row.isActive ? "success" : "danger"}>
                      {row.isActive ? "Active" : "Inactive"}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => startEdit(row)}
                        className="rounded-lg border border-border-default px-2.5 py-1 text-xs font-semibold text-text-strong"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPasswordTarget(row);
                          setStatusTarget(null);
                          setNewPassword("");
                          setSuccess("");
                        }}
                        disabled={busyId === row.id}
                        className="rounded-lg border border-border-default px-2.5 py-1 text-xs font-semibold text-text-strong disabled:opacity-60"
                      >
                        Reset password
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setStatusTarget(row);
                          setPasswordTarget(null);
                          setSuccess("");
                        }}
                        disabled={busyId === row.id}
                        className={`rounded-lg border px-2.5 py-1 text-xs font-semibold disabled:opacity-60 ${row.isActive ? "border-danger text-danger" : "border-success text-success"}`}
                      >
                        {row.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>
                {editingId === row.id && (
                  <tr className="border-b border-border-default bg-surface-hover">
                    <td colSpan={6} className="px-4 py-4">
                      {roleFields}
                      {formError && (
                        <div className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">
                          {formError}
                        </div>
                      )}
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => void submitEdit(row.id)}
                          disabled={formBusy}
                          className="rounded-lg bg-action-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                        >
                          {formBusy ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="rounded-lg border border-border-default px-4 py-2 text-sm font-semibold text-text-strong"
                        >
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

      <Pagination
        page={page}
        totalPages={totalPages}
        totalItems={total}
        itemLabel="accounts"
        onPageChange={setPage}
      />
    </div>
  );
}
