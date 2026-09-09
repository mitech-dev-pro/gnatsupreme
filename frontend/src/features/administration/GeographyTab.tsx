import ConfirmationPanel from "@/components/ui/ConfirmationPanel";
import Dropdown from "@/components/ui/Dropdown";
import { Alert, TableSkeleton } from "@/components/ui/Feedback";
import api from "@/lib/api";
import { getApiError } from "@/lib/errorExtract";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  type District,
  type DistrictAlias,
  inputClasses,
  labelClasses,
  type Region,
} from "./Setup.shared";

export function GeographyTab({ canEdit }: { canEdit: boolean }) {
  const [regions, setRegions] = useState<Region[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [newRegionName, setNewRegionName] = useState("");
  const [newDistrictName, setNewDistrictName] = useState("");
  const [newDistrictRegionId, setNewDistrictRegionId] = useState("");
  const [editingRegionId, setEditingRegionId] = useState<number | null>(null);
  const [editingRegionName, setEditingRegionName] = useState("");
  const [editingDistrictId, setEditingDistrictId] = useState<number | null>(null);
  const [editingDistrictName, setEditingDistrictName] = useState("");
  const [editingDistrictRegionId, setEditingDistrictRegionId] = useState("");
  const [districtRegionFilter, setDistrictRegionFilter] = useState("");
  const [districtSearch, setDistrictSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<
    { type: "region"; item: Region } | { type: "district"; item: District } | null
  >(null);

  const [aliases, setAliases] = useState<DistrictAlias[]>([]);
  const [aliasesLoading, setAliasesLoading] = useState(true);
  const [aliasError, setAliasError] = useState("");
  const [showAliasForm, setShowAliasForm] = useState(false);
  const [aliasText, setAliasText] = useState("");
  const [aliasDistrictId, setAliasDistrictId] = useState("");
  const [aliasFormError, setAliasFormError] = useState("");
  const [aliasFormBusy, setAliasFormBusy] = useState(false);
  const [aliasDeleteTarget, setAliasDeleteTarget] = useState<DistrictAlias | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [regionsRes, districtsRes] = await Promise.all([
        api.get("/regions"),
        api.get("/districts"),
      ]);
      setRegions(regionsRes.data.data);
      setDistricts(districtsRes.data.data);
    } catch {
      setError("Regions and districts could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAliases = useCallback(async () => {
    setAliasesLoading(true);
    setAliasError("");
    try {
      const res = await api.get("/districts/aliases");
      setAliases(res.data.data);
    } catch {
      setAliasError("District aliases could not be loaded.");
    } finally {
      setAliasesLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadAliases();
  }, [load, loadAliases]);

  const submitAlias = async (event: FormEvent) => {
    event.preventDefault();
    if (aliasText.trim().length < 2 || !aliasDistrictId) return;
    setAliasFormBusy(true);
    setAliasFormError("");
    try {
      await api.post("/districts/aliases", {
        alias: aliasText.trim(),
        districtId: Number(aliasDistrictId),
      });
      setAliasText("");
      setAliasDistrictId("");
      setShowAliasForm(false);
      await loadAliases();
    } catch (err: unknown) {
      setAliasFormError(getApiError(err)?.message || "Unable to save this alias.");
    } finally {
      setAliasFormBusy(false);
    }
  };

  const removeAlias = async (alias: DistrictAlias) => {
    setAliasFormBusy(true);
    setAliasError("");
    try {
      await api.delete(`/districts/aliases/${alias.id}`);
      setAliasDeleteTarget(null);
      await loadAliases();
    } catch (err: unknown) {
      setAliasError(getApiError(err)?.message || "Unable to remove this alias.");
    } finally {
      setAliasFormBusy(false);
    }
  };

  const createRegion = async (event: FormEvent) => {
    event.preventDefault();
    if (newRegionName.trim().length < 2) return;
    setBusy(true);
    setError("");
    try {
      await api.post("/regions", { name: newRegionName.trim() });
      setNewRegionName("");
      await load();
    } catch (err: unknown) {
      setError(getApiError(err)?.message || "Unable to create region.");
    } finally {
      setBusy(false);
    }
  };

  const saveRegion = async (id: number) => {
    if (editingRegionName.trim().length < 2) return;
    setBusy(true);
    setError("");
    try {
      await api.patch(`/regions/${id}`, { name: editingRegionName.trim() });
      setEditingRegionId(null);
      await load();
    } catch (err: unknown) {
      setError(getApiError(err)?.message || "Unable to update region.");
    } finally {
      setBusy(false);
    }
  };

  const deleteRegion = async (region: Region) => {
    setBusy(true);
    setError("");
    try {
      await api.delete(`/regions/${region.id}`);
      setDeleteTarget(null);
      await load();
    } catch (err: unknown) {
      setError(getApiError(err)?.message || "Unable to delete region.");
    } finally {
      setBusy(false);
    }
  };

  const createDistrict = async (event: FormEvent) => {
    event.preventDefault();
    if (newDistrictName.trim().length < 2 || !newDistrictRegionId) return;
    setBusy(true);
    setError("");
    try {
      await api.post("/districts", {
        name: newDistrictName.trim(),
        regionId: Number(newDistrictRegionId),
      });
      setNewDistrictName("");
      setNewDistrictRegionId("");
      await load();
    } catch (err: unknown) {
      setError(getApiError(err)?.message || "Unable to create district.");
    } finally {
      setBusy(false);
    }
  };

  const saveDistrict = async (id: number) => {
    if (editingDistrictName.trim().length < 2 || !editingDistrictRegionId) return;
    setBusy(true);
    setError("");
    try {
      await api.patch(`/districts/${id}`, {
        name: editingDistrictName.trim(),
        regionId: Number(editingDistrictRegionId),
      });
      setEditingDistrictId(null);
      await load();
    } catch (err: unknown) {
      setError(getApiError(err)?.message || "Unable to update district.");
    } finally {
      setBusy(false);
    }
  };

  const deleteDistrict = async (district: District) => {
    setBusy(true);
    setError("");
    try {
      await api.delete(`/districts/${district.id}`);
      setDeleteTarget(null);
      await load();
    } catch (err: unknown) {
      setError(getApiError(err)?.message || "Unable to delete district.");
    } finally {
      setBusy(false);
    }
  };

  const normalizedDistrictSearch = districtSearch.trim().toLocaleLowerCase();
  const visibleDistricts = districts.filter((district) => {
    const matchesRegion =
      !districtRegionFilter || String(district.region.id) === districtRegionFilter;
    const matchesSearch =
      !normalizedDistrictSearch ||
      district.name.toLocaleLowerCase().includes(normalizedDistrictSearch);
    return matchesRegion && matchesSearch;
  });
  const totalMembers = districts.reduce((sum, district) => sum + district._count.members, 0);

  if (loading)
    return (
      <div className="overflow-hidden rounded-xl border border-border-default bg-(--surface-raised)">
        <table className="w-full">
          <tbody>
            <TableSkeleton columns={3} />
          </tbody>
        </table>
      </div>
    );

  return (
    <div className="space-y-5">
      {error && <Alert tone="error">{error}</Alert>}

      {deleteTarget && (
        <ConfirmationPanel
          title={`Delete ${deleteTarget.type} “${deleteTarget.item.name}”?`}
          description={
            deleteTarget.type === "region"
              ? "This region will be permanently removed. Regions containing districts cannot be deleted."
              : "This district will be permanently removed. Districts containing member records cannot be deleted."
          }
          confirmLabel={`Delete ${deleteTarget.type}`}
          busyLabel="Deleting…"
          busy={busy}
          onConfirm={() =>
            deleteTarget.type === "region"
              ? void deleteRegion(deleteTarget.item)
              : void deleteDistrict(deleteTarget.item)
          }
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <div className="overflow-hidden rounded-xl border border-border-default bg-white">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border-default px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-text-strong">Geographic structure</h2>
            <p className="mt-0.5 text-xs text-text-muted">
              Select a region to narrow the district list.
            </p>
          </div>
          <div
            className="flex items-center gap-4 text-xs text-text-muted"
            aria-label="Geography summary"
          >
            <span>
              <strong className="text-sm text-ink">{regions.length}</strong> regions
            </span>
            <span>
              <strong className="text-sm text-ink">{districts.length}</strong> districts
            </span>
            <span>
              <strong className="text-sm text-ink">{totalMembers}</strong> members
            </span>
          </div>
        </div>

        <div className="grid lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,2fr)]">
          <section
            className="border-b border-border-default p-4 lg:border-b-0 lg:border-r"
            aria-labelledby="regions-heading"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3
                id="regions-heading"
                className="text-base font-bold uppercase tracking-wide text-text-muted"
              >
                Regions
              </h3>
              {districtRegionFilter && (
                <button
                  type="button"
                  onClick={() => setDistrictRegionFilter("")}
                  className="text-xs font-semibold text-text-strong hover:underline"
                >
                  Show all
                </button>
              )}
            </div>

            {canEdit && (
              <form onSubmit={createRegion} className="mb-3 flex gap-2">
                <label className="sr-only" htmlFor="new-region-name">
                  New region name
                </label>
                <input
                  id="new-region-name"
                  value={newRegionName}
                  onChange={(e) => setNewRegionName(e.target.value)}
                  placeholder="New region"
                  className={inputClasses}
                />
                <button
                  type="submit"
                  disabled={busy || newRegionName.trim().length < 2}
                  className="shrink-0 rounded-lg bg-action-primary px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Add
                </button>
              </form>
            )}

            <ul className="max-h-130 divide-y divide-[#edf0f5] overflow-y-auto">
              {regions.map((region) => {
                const isSelected = districtRegionFilter === String(region.id);
                return (
                  <li key={region.id} className="py-1.5">
                    {editingRegionId === region.id ? (
                      <div className="space-y-2 py-1">
                        <input
                          value={editingRegionName}
                          onChange={(e) => setEditingRegionName(e.target.value)}
                          className={inputClasses}
                          autoFocus
                        />
                        <div className="flex gap-3 text-xs">
                          <button
                            type="button"
                            onClick={() => void saveRegion(region.id)}
                            disabled={busy}
                            className="font-semibold text-success"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingRegionId(null)}
                            className="font-semibold text-text-muted"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`group flex items-center rounded-lg transition ${isSelected ? "bg-[#eef2f8]" : "hover:bg-surface-hover"}`}
                      >
                        <button
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() =>
                            setDistrictRegionFilter(isSelected ? "" : String(region.id))
                          }
                          className="min-w-0 flex-1 px-2.5 py-2 text-left focus:outline-none focus-visible:shadow-focus-soft"
                        >
                          <span
                            className={`block truncate font-semibold ${isSelected ? "text-text-strong" : "text-ink"}`}
                          >
                            {region.name}
                          </span>
                          <span className="text-xs text-text-muted">
                            {region._count.districts}{" "}
                            {region._count.districts === 1 ? "district" : "districts"}
                          </span>
                        </button>
                        {canEdit && (
                          <div className="flex shrink-0 gap-2 pr-2 text-xs">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingRegionId(region.id);
                                setEditingRegionName(region.name);
                              }}
                              className="font-semibold text-text-strong"
                            >
                              Rename
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget({ type: "region", item: region })}
                              disabled={region._count.districts > 0}
                              className="font-semibold text-danger disabled:cursor-not-allowed disabled:opacity-30"
                              title={
                                region._count.districts > 0
                                  ? "Remove all districts first"
                                  : undefined
                              }
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="min-w-0 p-4" aria-labelledby="districts-heading">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3
                  id="districts-heading"
                  className="text-base font-bold uppercase tracking-wide text-text-muted"
                >
                  Districts
                </h3>
                <p className="mt-0.5 text-xs text-text-muted">
                  Showing {visibleDistricts.length} of {districts.length}
                </p>
              </div>
              <div className="relative w-full sm:w-60">
                <label className="sr-only" htmlFor="district-search">
                  Search districts
                </label>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  fill="none"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#7b8492]"
                >
                  <circle cx="8.5" cy="8.5" r="5" stroke="currentColor" strokeWidth="1.5" />
                  <path
                    d="m12.2 12.2 3.3 3.3"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                <input
                  id="district-search"
                  type="search"
                  value={districtSearch}
                  onChange={(e) => setDistrictSearch(e.target.value)}
                  placeholder="Search districts"
                  className={`${inputClasses} pl-9`}
                />
              </div>
            </div>
            {canEdit && (
              <form
                onSubmit={createDistrict}
                className="mb-4 grid gap-2 rounded-lg bg-surface-subtle p-3 sm:grid-cols-[minmax(160px,1fr)_minmax(150px,0.7fr)_auto] sm:items-end"
              >
                <div>
                  <label className={labelClasses}>New district name</label>
                  <input
                    value={newDistrictName}
                    onChange={(e) => setNewDistrictName(e.target.value)}
                    className={inputClasses}
                  />
                </div>
                <div>
                  <label className={labelClasses}>Region</label>
                  <Dropdown
                    value={newDistrictRegionId}
                    onChange={setNewDistrictRegionId}
                    placeholder="Select region"
                    options={regions.map((r) => ({ value: String(r.id), label: r.name }))}
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy || newDistrictName.trim().length < 2 || !newDistrictRegionId}
                  className="rounded-lg bg-action-primary px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Add district
                </button>
              </form>
            )}
            <div className="max-h-130 overflow-y-auto overflow-x-auto">
              <table className="w-full min-w-140 text-left text-sm">
                <thead className="sticky top-0 z-10 bg-white">
                  <tr className="border-b border-border-default text-xs font-semibold uppercase tracking-wide text-text-muted">
                    <th className="py-2">Name</th>
                    <th className="py-2">Region</th>
                    <th className="py-2">Members</th>
                    {canEdit && <th className="py-2">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {visibleDistricts.map((district) => (
                    <tr key={district.id} className="border-b border-border-default last:border-0">
                      <td className="py-2">
                        {editingDistrictId === district.id ? (
                          <input
                            value={editingDistrictName}
                            onChange={(e) => setEditingDistrictName(e.target.value)}
                            className={inputClasses}
                            autoFocus
                          />
                        ) : (
                          district.name
                        )}
                      </td>
                      <td className="py-2 text-text-muted">
                        {editingDistrictId === district.id ? (
                          <Dropdown
                            className="w-40"
                            value={editingDistrictRegionId}
                            onChange={setEditingDistrictRegionId}
                            options={regions.map((r) => ({ value: String(r.id), label: r.name }))}
                          />
                        ) : (
                          district.region.name
                        )}
                      </td>
                      <td className="py-2 text-text-muted">{district._count.members}</td>
                      {canEdit && (
                        <td className="py-2">
                          {editingDistrictId === district.id ? (
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => void saveDistrict(district.id)}
                                disabled={busy}
                                className="font-semibold text-success"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingDistrictId(null)}
                                className="font-semibold text-text-muted"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-2.5">
                              <button
                                onClick={() => {
                                  setEditingDistrictId(district.id);
                                  setEditingDistrictName(district.name);
                                  setEditingDistrictRegionId(String(district.region.id));
                                }}
                                className="font-semibold text-text-strong"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() =>
                                  setDeleteTarget({ type: "district", item: district })
                                }
                                disabled={district._count.members > 0}
                                className="font-semibold text-danger disabled:cursor-not-allowed disabled:opacity-40"
                                title={
                                  district._count.members > 0
                                    ? "Reassign or remove members first"
                                    : undefined
                                }
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                  {visibleDistricts.length === 0 && (
                    <tr>
                      <td
                        colSpan={canEdit ? 4 : 3}
                        className="py-8 text-center text-xs text-text-muted"
                      >
                        No districts match the selected region or search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border-default bg-white">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border-default px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-text-strong">District spelling aliases</h2>
            <p className="mt-0.5 max-w-160 text-xs leading-relaxed text-text-muted">
              Maps a district spelling seen in an uploaded file (Report 20, bulk import) to the
              correct district, so future uploads using that spelling match automatically instead of
              landing in Unmatched.
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setShowAliasForm((v) => !v);
                setAliasText("");
                setAliasDistrictId("");
                setAliasFormError("");
              }}
              className="shrink-0 rounded-lg bg-action-primary px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {showAliasForm ? "Close" : "Add Alias"}
            </button>
          )}
        </div>

        <div className="p-4">
          {aliasError && (
            <div className="mb-3">
              <Alert tone="error">{aliasError}</Alert>
            </div>
          )}

          {aliasDeleteTarget && (
            <div className="mb-3">
              <ConfirmationPanel
                title={`Remove the mapping for "${aliasDeleteTarget.alias}"?`}
                description={`Future uploads spelled "${aliasDeleteTarget.alias}" will go back to landing in Unmatched instead of resolving to ${aliasDeleteTarget.district.name}.`}
                confirmLabel="Remove mapping"
                busyLabel="Removing…"
                busy={aliasFormBusy}
                onConfirm={() => void removeAlias(aliasDeleteTarget)}
                onCancel={() => setAliasDeleteTarget(null)}
              />
            </div>
          )}

          {showAliasForm && canEdit && (
            <form
              onSubmit={submitAlias}
              className="mb-4 grid gap-2 rounded-lg bg-surface-subtle p-3 sm:grid-cols-[minmax(160px,1fr)_minmax(200px,0.9fr)_auto] sm:items-end"
            >
              <div>
                <label className={labelClasses}>Spelling seen in the file</label>
                <input
                  value={aliasText}
                  onChange={(e) => setAliasText(e.target.value)}
                  placeholder="e.g. Akwapim North"
                  className={inputClasses}
                />
              </div>
              <div>
                <label className={labelClasses}>Correct district</label>
                <Dropdown
                  value={aliasDistrictId}
                  onChange={setAliasDistrictId}
                  placeholder="Select district"
                  options={districts.map((d) => ({
                    value: String(d.id),
                    label: `${d.name} (${d.region.name})`,
                  }))}
                />
              </div>
              <button
                type="submit"
                disabled={aliasFormBusy || aliasText.trim().length < 2 || !aliasDistrictId}
                className="rounded-lg bg-action-primary px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                Save alias
              </button>
              {aliasFormError && (
                <div className="sm:col-span-3 rounded-lg bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">
                  {aliasFormError}
                </div>
              )}
            </form>
          )}

          {aliasesLoading ? (
            <TableSkeleton columns={4} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-140 text-left text-sm">
                <thead>
                  <tr className="border-b border-border-default text-xs font-semibold uppercase tracking-wide text-text-muted">
                    <th className="py-2">Spelling</th>
                    <th className="py-2">Maps to</th>
                    <th className="py-2">Added by</th>
                    {canEdit && <th className="py-2">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {aliases.map((row) => (
                    <tr key={row.id} className="border-b border-border-default last:border-0">
                      <td className="py-2 font-semibold text-ink">{row.alias}</td>
                      <td className="py-2 text-text-muted">
                        {row.district.name} ({row.district.region.name})
                      </td>
                      <td className="py-2 text-text-muted">
                        {row.createdBy?.fullName ?? "System seed"}
                      </td>
                      {canEdit && (
                        <td className="py-2">
                          <button
                            type="button"
                            onClick={() => setAliasDeleteTarget(row)}
                            className="font-semibold text-danger"
                          >
                            Remove
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {aliases.length === 0 && (
                    <tr>
                      <td
                        colSpan={canEdit ? 4 : 3}
                        className="py-8 text-center text-xs text-text-muted"
                      >
                        No district aliases yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
