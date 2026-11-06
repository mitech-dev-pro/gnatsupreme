import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
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
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  ROLES,
  ROLE_LABELS,
  inputClasses,
  labelClasses,
  useDebouncedValue,
  type StaffUser,
} from "./System.model";

// Joined name list, truncated with a count -- a multi-scope admin's row would otherwise overflow
// the table cell.
function scopeLabel(row: StaffUser) {
  const names = row.districts.length
    ? row.districts.map((d) => d.name)
    : row.regions.map((r) => r.name);
  if (!names.length) return "National";
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
}
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
    regionIds: [] as string[],
    districtIds: [] as string[],
    password: "",
  });
  const [formError, setFormError] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [statusTarget, setStatusTarget] = useState<StaffUser | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<StaffUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [success, setSuccess] = useState("");

  const [actionError, setActionError] = useState("");
  const [discarding, setDiscarding] = useState(false);
  const initialForm = useRef("");
  const actionLock = useRef(false);
  const closeForm = (discard = false) => {
    if (formBusy) return;
    if (JSON.stringify(form) !== initialForm.current && !discard) {
      setDiscarding(true);
      return;
    }
    setShowCreate(false);
    setEditingId(null);
    setDiscarding(false);
    setFormError("");
    resetForm();
  };
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
        if (signal?.aborted) return;
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
      regionIds: [],
      districtIds: [],
      password: "",
    });

  const startEdit = (row: StaffUser) => {
    setEditingId(row.id);
    setShowCreate(false);
    const next = {
      fullName: row.fullName,
      email: row.email,
      role: row.role,
      regionIds: row.regionIds.map(String),
      districtIds: row.districtIds.map(String),
      password: "",
    };
    setForm(next);
    initialForm.current = JSON.stringify(next);
    setDiscarding(false);
    setFormError("");
  };

  const submitCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (actionLock.current) return;
    actionLock.current = true;
    setFormBusy(true);
    setFormError("");
    try {
      await api.post("/users", {
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        role: form.role,
        regionIds: form.role === "REGIONAL_ADMIN" ? form.regionIds.map(Number) : [],
        districtIds: form.role === "DISTRICT_ADMIN" ? form.districtIds.map(Number) : [],
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
      actionLock.current = false;
      setFormBusy(false);
    }
  };

  const submitEdit = async (id: number) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setFormBusy(true);
    setFormError("");
    try {
      await api.patch(`/users/${id}`, {
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        role: form.role,
        regionIds: form.role === "REGIONAL_ADMIN" ? form.regionIds.map(Number) : [],
        districtIds: form.role === "DISTRICT_ADMIN" ? form.districtIds.map(Number) : [],
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
      actionLock.current = false;
      setFormBusy(false);
    }
  };

  const toggleActive = async (row: StaffUser) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusyId(row.id);
    setActionError("");
    try {
      await api.patch(`/users/${row.id}/status`, { isActive: !row.isActive });
      setStatusTarget(null);
      setSuccess(`${row.fullName} was ${row.isActive ? "deactivated" : "activated"}.`);
      await load();
    } catch (err: unknown) {
      setActionError(getApiError(err)?.message || "Unable to update this account's status.");
    } finally {
      actionLock.current = false;
      setBusyId(null);
    }
  };

  const resetPassword = async (row: StaffUser) => {
    if (!newPassword) return;
    if (actionLock.current) return;
    actionLock.current = true;
    setBusyId(row.id);
    setActionError("");
    try {
      await api.patch(`/users/${row.id}/password`, { password: newPassword });
      setPasswordTarget(null);
      setNewPassword("");
      setSuccess(`Password updated for ${row.fullName}. Existing sessions were revoked.`);
    } catch (err: unknown) {
      setActionError(getApiError(err)?.message || "Unable to reset this account's password.");
    } finally {
      actionLock.current = false;
      setBusyId(null);
    }
  };

  const roleFields = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor="staff-name" className={labelClasses}>
          Full Name
        </label>
        <input
          id="staff-name"
          value={form.fullName}
          onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
          className={inputClasses}
          required
        />
      </div>
      <div>
        <label htmlFor="staff-email" className={labelClasses}>
          Email
        </label>
        <input
          id="staff-email"
          type="email"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          className={inputClasses}
          required
        />
      </div>
      <div>
        <label htmlFor="staff-role" className={labelClasses}>
          Role
        </label>
        <Dropdown
          id="staff-role"
          aria-label="Role"
          value={form.role}
          onChange={(value) =>
            setForm((f) => ({ ...f, role: value, regionIds: [], districtIds: [] }))
          }
          options={availableRoles.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
        />
      </div>
      {form.role === "REGIONAL_ADMIN" && (
        <div className="sm:col-span-2">
          <label className={labelClasses}>Regions</label>
          <div className="grid max-h-48 grid-cols-2 gap-1.5 overflow-y-auto rounded-lg border border-border-default p-2.5 sm:grid-cols-3">
            {regions.map((r) => {
              const id = String(r.id);
              const checked = form.regionIds.includes(id);
              return (
                <label key={id} className="flex items-center gap-1.5 text-[12.5px]">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setForm((f) => ({
                        ...f,
                        regionIds: checked
                          ? f.regionIds.filter((v) => v !== id)
                          : [...f.regionIds, id],
                      }))
                    }
                  />
                  {r.name}
                </label>
              );
            })}
          </div>
        </div>
      )}
      {form.role === "DISTRICT_ADMIN" && (
        <div className="sm:col-span-2">
          <label className={labelClasses}>Districts</label>
          <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-border-default p-2.5">
            {regions.map((region) => {
              const regionDistricts = districts.filter((d) => d.region.id === region.id);
              if (!regionDistricts.length) return null;
              return (
                <div key={region.id}>
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">
                    {region.name}
                  </p>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {regionDistricts.map((d) => {
                      const id = String(d.id);
                      const checked = form.districtIds.includes(id);
                      return (
                        <label key={id} className="flex items-center gap-1.5 text-[12.5px]">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setForm((f) => ({
                                ...f,
                                districtIds: checked
                                  ? f.districtIds.filter((v) => v !== id)
                                  : [...f.districtIds, id],
                              }))
                            }
                          />
                          {d.name}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
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
          variant="primary"
          onClick={() => {
            setShowCreate(true);
            setDiscarding(false);
            initialForm.current = JSON.stringify({
              fullName: "",
              email: "",
              role: "DISTRICT_ADMIN",
              regionIds: [],
              districtIds: [],
              password: "",
            });
            setEditingId(null);
            resetForm();
            setFormError("");
          }}
        >
          Add Staff Account
        </Button>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {success && <Alert tone="success">{success}</Alert>}

      {statusTarget && (
        <Dialog
          title={statusTarget.isActive ? "Deactivate staff account" : "Activate staff account"}
          description={statusTarget.email}
          busy={busyId !== null}
          onClose={() => setStatusTarget(null)}
        >
          {actionError && <Alert tone="error">{actionError}</Alert>}
          <ConfirmationPanel
            title={statusTarget.fullName}
            description={
              statusTarget.isActive
                ? "This person will immediately lose access. Existing sessions may no longer be usable."
                : "This person will regain access according to their assigned role and scope."
            }
            confirmVariant={statusTarget.isActive ? "danger" : "primary"}
            confirmLabel={statusTarget.isActive ? "Deactivate account" : "Activate account"}
            busyLabel="Updating…"
            busy={busyId !== null}
            onConfirm={() => void toggleActive(statusTarget)}
            onCancel={() => setStatusTarget(null)}
          />
        </Dialog>
      )}
      {passwordTarget && (
        <Dialog
          title="Reset staff password"
          description={passwordTarget.fullName + " · " + passwordTarget.email}
          busy={busyId !== null}
          onClose={() => {
            setPasswordTarget(null);
            setNewPassword("");
          }}
        >
          <p className="mb-4 text-sm text-text-muted">
            Saving the new password will revoke this user's existing sessions. Share the password
            through an approved secure channel.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void resetPassword(passwordTarget);
            }}
          >
            <fieldset disabled={busyId !== null} className="min-w-0 space-y-4">
              <InputField
                label="New temporary password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                minLength={12}
                hint="At least 12 characters with mixed case, a number, and a symbol."
                autoComplete="new-password"
              />
              {actionError && <Alert tone="error">{actionError}</Alert>}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="submit"
                  disabled={!newPassword}
                  loading={busyId !== null}
                  loadingLabel="Updating…"
                >
                  Update password
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setPasswordTarget(null);
                    setNewPassword("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </fieldset>
          </form>
        </Dialog>
      )}
      {(showCreate || editingId !== null) && (
        <Dialog
          title={showCreate ? "Add staff account" : "Edit staff account"}
          description={
            showCreate
              ? "Set account details, access role and geographical scope."
              : rows.find((row) => row.id === editingId)?.email
          }
          busy={formBusy}
          onClose={() => closeForm()}
        >
          {discarding ? (
            <div className="space-y-4">
              <p className="text-sm text-text-muted">Discard your unsaved changes?</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="danger" onClick={() => closeForm(true)}>
                  Discard changes
                </Button>
                <Button variant="secondary" onClick={() => setDiscarding(false)}>
                  Keep editing
                </Button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={(event) => {
                if (showCreate) void submitCreate(event);
                else {
                  event.preventDefault();
                  void submitEdit(editingId!);
                }
              }}
            >
              <fieldset disabled={formBusy} className="min-w-0 space-y-4">
                {roleFields}
                {showCreate && (
                  <InputField
                    label="Temporary password"
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm((f) => ({ ...f, password: event.target.value }))}
                    required
                    minLength={12}
                    autoComplete="new-password"
                    hint="At least 12 characters with mixed case, a number, and a symbol."
                  />
                )}
                {formError && <Alert tone="error">{formError}</Alert>}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="submit"
                    disabled={
                      (form.role === "DISTRICT_ADMIN" && form.districtIds.length === 0) ||
                      (form.role === "REGIONAL_ADMIN" && form.regionIds.length === 0)
                    }
                    loading={formBusy}
                    loadingLabel={showCreate ? "Creating…" : "Saving…"}
                  >
                    {showCreate ? "Create account" : "Save changes"}
                  </Button>
                  <Button variant="secondary" onClick={() => closeForm()}>
                    Cancel
                  </Button>
                </div>
              </fieldset>
            </form>
          )}
        </Dialog>
      )}

      <TableFrame label="Staff accounts" className="min-w-205">
        <thead>
          <tr className="border-b border-border-default bg-surface-hover text-[11px] font-semibold uppercase tracking-wide text-text-muted">
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
              <tr key={row.id} className="border-b border-border-default last:border-0">
                <td className="px-4 py-2.5 font-semibold text-ink">{row.fullName}</td>
                <td className="px-4 py-2.5 text-text-muted">{row.email}</td>
                <td className="px-4 py-2.5">{ROLE_LABELS[row.role] ?? row.role}</td>
                <td className="px-4 py-2.5 text-text-muted">{scopeLabel(row)}</td>
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
                      className="rounded-lg border border-border-default px-2.5 py-1 text-[11.5px] font-semibold text-text-strong"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActionError("");
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
                        setActionError("");
                        setStatusTarget(row);
                        setPasswordTarget(null);
                        setSuccess("");
                      }}
                      disabled={busyId === row.id}
                      className={`rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold disabled:opacity-60 ${row.isActive ? "border-danger text-danger" : "border-success text-success"}`}
                    >
                      {row.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </td>
              </tr>
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
