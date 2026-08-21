import { useCallback, useEffect, useState, type FormEvent } from "react";
import api from "@/lib/api";
import ConfirmationPanel from "@/components/ui/ConfirmationPanel";
import { useAuth } from "@/lib/AuthContext";
import PageHeader from "@/components/ui/PageHeader";
import { Alert, TableSkeleton } from "@/components/ui/Feedback";

type Region = { id: number; name: string; _count: { districts: number } };
type District = { id: number; name: string; region: { id: number; name: string }; _count: { members: number } };

type Benefit = { type: string; enabled: boolean; memberAmount: string; spouseAmount: string | null; note: string | null };
type BenefitPlan = {
  id: number;
  effectiveFrom: string;
  monthlyPremium: string;
  collectionMethod: string;
  note: string | null;
  benefits: Benefit[];
  createdBy: { id: number; fullName: string } | null;
  createdAt: string;
};

const EDIT_ROLES = ["SUPER_ADMIN", "NATIONAL_ADMIN"];
const BENEFIT_LABELS: Record<string, string> = {
  DEATH: "Death",
  TOTAL_PERMANENT_DISABILITY: "Total Permanent Disability",
  CRITICAL_ILLNESS: "Critical Illness",
  HOSPITALIZATION: "Hospitalization",
};
const BENEFIT_KEYS = ["death", "totalPermanentDisability", "criticalIllness", "hospitalization"] as const;
const BENEFIT_KEY_TO_TYPE: Record<(typeof BENEFIT_KEYS)[number], string> = {
  death: "DEATH",
  totalPermanentDisability: "TOTAL_PERMANENT_DISABILITY",
  criticalIllness: "CRITICAL_ILLNESS",
  hospitalization: "HOSPITALIZATION",
};
const MEMBER_ONLY_BENEFITS = new Set(["criticalIllness", "hospitalization"]);
const EMPTY_BENEFITS = () => Object.fromEntries(BENEFIT_KEYS.map((key) => [key, { enabled: true, memberAmount: "", spouseAmount: "", note: "" }])) as Record<string, { enabled: boolean; memberAmount: string; spouseAmount: string; note: string }>;

const inputClasses =
  "w-full rounded-[9px] border border-[#e5e9f0] bg-[#fbfcfe] px-3 py-2 text-[12.5px] transition focus:border-[#1f9c7c] focus:shadow-[0_0_0_3px_#dff7ee] focus:outline-none";
const labelClasses = "mb-1 block text-[11px] font-bold text-[#1e2761]";
const tabButton = (active: boolean) =>
  `rounded-[9px] px-4 py-2 text-[12.5px] font-bold transition ${
    active ? "bg-[#1e2761] text-white" : "border border-[#e5e9f0] text-[#1e2761] hover:bg-[#fafbfd]"
  }`;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function formatMoney(value: string | null) {
  if (value == null) return "—";
  return `GHS ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function BenefitToggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`${label} ${checked ? "enabled" : "disabled"}`}
      onClick={() => onChange(!checked)}
      className={`inline-flex min-h-8 min-w-[74px] items-center justify-between gap-2 rounded-full border px-2.5 py-1 text-[11px] font-bold transition focus:outline-none focus-visible:shadow-[0_0_0_3px_#dff7ee] ${
        checked ? "border-[#1f9c7c] bg-[#dff7ee] text-[#17805f]" : "border-[#d7dce5] bg-[#f4f6fa] text-[#5b6472]"
      }`}
    >
      <span>{checked ? "On" : "Off"}</span>
      <span aria-hidden="true" className={`size-3.5 rounded-full ${checked ? "bg-[#1f9c7c]" : "bg-[#9aa3b2]"}`} />
    </button>
  );
}

function BenefitHistoryItem({ plan, initiallyOpen }: { plan: BenefitPlan; initiallyOpen: boolean }) {
  const [isOpen, setIsOpen] = useState(initiallyOpen);

  return (
    <li className="border-t border-[#e5e9f0] first:border-t-0">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={`benefit-plan-${plan.id}`}
        onClick={() => setIsOpen((open) => !open)}
        className="group flex w-full items-center gap-3 py-3 text-left focus:outline-none focus-visible:rounded-[7px] focus-visible:shadow-[0_0_0_3px_#dff7ee]"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={`size-4 shrink-0 text-[#5b6472] transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}>
          <path d="m7.5 5 5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-[#171b26]">Effective {formatDate(plan.effectiveFrom)}</span>
          <span className="mt-0.5 block truncate text-[11.5px] text-[#5b6472]">
            {plan.collectionMethod} · Published by {plan.createdBy?.fullName ?? "System"} on {formatDate(plan.createdAt)}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-semibold text-[#1e2761]">{formatMoney(plan.monthlyPremium)}</span>
          <span className="block text-[10.5px] text-[#5b6472]">per month</span>
        </span>
      </button>

      {isOpen && (
        <div id={`benefit-plan-${plan.id}`} className="pb-4 pl-7">
          <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            {plan.benefits.map((benefit) => (
              <div key={benefit.type} className="border-t border-[#edf0f5] py-2.5 first:border-t-0 sm:[&:nth-child(2)]:border-t-0">
                <dt className="flex items-center justify-between gap-3 font-semibold text-[#1e2761]">
                  <span>{BENEFIT_LABELS[benefit.type] ?? benefit.type}</span>
                  <span className="text-[10.5px] font-semibold text-[#5b6472]">{benefit.enabled ? "Enabled" : "Disabled"}</span>
                </dt>
                <dd className="mt-0.5 text-[#5b6472]">Member {formatMoney(benefit.memberAmount)} · Spouse {formatMoney(benefit.spouseAmount)}</dd>
                {benefit.note && <dd className="mt-1 max-w-[70ch] text-[11.5px] leading-relaxed text-[#5b6472]">{benefit.note}</dd>}
              </div>
            ))}
          </dl>
        </div>
      )}
    </li>
  );
}

function GeographyTab({ canEdit }: { canEdit: boolean }) {
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
  const [deleteTarget, setDeleteTarget] = useState<{ type: "region"; item: Region } | { type: "district"; item: District } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [regionsRes, districtsRes] = await Promise.all([api.get("/regions"), api.get("/districts")]);
      setRegions(regionsRes.data.data);
      setDistricts(districtsRes.data.data);
    } catch {
      setError("Regions and districts could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createRegion = async (event: FormEvent) => {
    event.preventDefault();
    if (newRegionName.trim().length < 2) return;
    setBusy(true);
    setError("");
    try {
      await api.post("/regions", { name: newRegionName.trim() });
      setNewRegionName("");
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || "Unable to create region.");
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
    } catch (err: any) {
      setError(err?.response?.data?.message || "Unable to update region.");
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
    } catch (err: any) {
      setError(err?.response?.data?.message || "Unable to delete region.");
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
      await api.post("/districts", { name: newDistrictName.trim(), regionId: Number(newDistrictRegionId) });
      setNewDistrictName("");
      setNewDistrictRegionId("");
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || "Unable to create district.");
    } finally {
      setBusy(false);
    }
  };

  const saveDistrict = async (id: number) => {
    if (editingDistrictName.trim().length < 2 || !editingDistrictRegionId) return;
    setBusy(true);
    setError("");
    try {
      await api.patch(`/districts/${id}`, { name: editingDistrictName.trim(), regionId: Number(editingDistrictRegionId) });
      setEditingDistrictId(null);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || "Unable to update district.");
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
    } catch (err: any) {
      setError(err?.response?.data?.message || "Unable to delete district.");
    } finally {
      setBusy(false);
    }
  };

  const normalizedDistrictSearch = districtSearch.trim().toLocaleLowerCase();
  const visibleDistricts = districts.filter((district) => {
    const matchesRegion = !districtRegionFilter || String(district.region.id) === districtRegionFilter;
    const matchesSearch = !normalizedDistrictSearch || district.name.toLocaleLowerCase().includes(normalizedDistrictSearch);
    return matchesRegion && matchesSearch;
  });
  const totalMembers = districts.reduce((sum, district) => sum + district._count.members, 0);

  if (loading) return <div className="overflow-hidden rounded-[12px] border border-(--border-default) bg-(--surface-raised)"><table className="w-full"><tbody><TableSkeleton columns={3} /></tbody></table></div>;

  return (
    <div className="space-y-5">
      {error && <Alert tone="error">{error}</Alert>}

      {deleteTarget && (
        <ConfirmationPanel
          title={`Delete ${deleteTarget.type} “${deleteTarget.item.name}”?`}
          description={deleteTarget.type === "region" ? "This region will be permanently removed. Regions containing districts cannot be deleted." : "This district will be permanently removed. Districts containing member records cannot be deleted."}
          confirmLabel={`Delete ${deleteTarget.type}`}
          busyLabel="Deleting…"
          busy={busy}
          onConfirm={() => deleteTarget.type === "region" ? void deleteRegion(deleteTarget.item) : void deleteDistrict(deleteTarget.item)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <div className="overflow-hidden rounded-[12px] border border-[#e5e9f0] bg-white">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#e5e9f0] px-5 py-4">
          <div>
            <h2 className="text-[14.5px] font-bold text-[#1e2761]">Geographic structure</h2>
            <p className="mt-0.5 text-[11.5px] text-[#5b6472]">Select a region to narrow the district list.</p>
          </div>
          <div className="flex items-center gap-4 text-[11.5px] text-[#5b6472]" aria-label="Geography summary">
            <span><strong className="text-[13px] text-[#171b26]">{regions.length}</strong> regions</span>
            <span><strong className="text-[13px] text-[#171b26]">{districts.length}</strong> districts</span>
            <span><strong className="text-[13px] text-[#171b26]">{totalMembers}</strong> members</span>
          </div>
        </div>

        <div className="grid lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,2fr)]">
          <section className="border-b border-[#e5e9f0] p-4 lg:border-b-0 lg:border-r" aria-labelledby="regions-heading">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 id="regions-heading" className="text-[12px] font-bold uppercase tracking-wide text-[#5b6472]">Regions</h3>
              {districtRegionFilter && (
                <button type="button" onClick={() => setDistrictRegionFilter("")} className="text-[11.5px] font-semibold text-[#1e2761] hover:underline">
                  Show all
                </button>
              )}
            </div>

            {canEdit && (
              <form onSubmit={createRegion} className="mb-3 flex gap-2">
                <label className="sr-only" htmlFor="new-region-name">New region name</label>
                <input id="new-region-name" value={newRegionName} onChange={(e) => setNewRegionName(e.target.value)} placeholder="New region" className={inputClasses} />
                <button type="submit" disabled={busy || newRegionName.trim().length < 2} className="shrink-0 rounded-[9px] bg-[#1f9c7c] px-3 py-2 text-[12px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">
                  Add
                </button>
              </form>
            )}

            <ul className="divide-y divide-[#edf0f5]">
              {regions.map((region) => {
                const isSelected = districtRegionFilter === String(region.id);
                return (
                  <li key={region.id} className="py-1.5">
                    {editingRegionId === region.id ? (
                      <div className="space-y-2 py-1">
                        <input value={editingRegionName} onChange={(e) => setEditingRegionName(e.target.value)} className={inputClasses} autoFocus />
                        <div className="flex gap-3 text-[11.5px]">
                          <button type="button" onClick={() => void saveRegion(region.id)} disabled={busy} className="font-semibold text-[#17805f]">Save</button>
                          <button type="button" onClick={() => setEditingRegionId(null)} className="font-semibold text-[#5b6472]">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className={`group flex items-center rounded-[8px] transition ${isSelected ? "bg-[#eef2f8]" : "hover:bg-[#fafbfd]"}`}>
                        <button type="button" aria-pressed={isSelected} onClick={() => setDistrictRegionFilter(isSelected ? "" : String(region.id))} className="min-w-0 flex-1 px-2.5 py-2 text-left focus:outline-none focus-visible:shadow-[0_0_0_3px_#dff7ee]">
                          <span className={`block truncate font-semibold ${isSelected ? "text-[#1e2761]" : "text-[#171b26]"}`}>{region.name}</span>
                          <span className="text-[10.5px] text-[#5b6472]">{region._count.districts} {region._count.districts === 1 ? "district" : "districts"}</span>
                        </button>
                        {canEdit && (
                          <div className="flex shrink-0 gap-2 pr-2 text-[11px]">
                            <button type="button" onClick={() => { setEditingRegionId(region.id); setEditingRegionName(region.name); }} className="font-semibold text-[#1e2761]">Rename</button>
                            <button type="button" onClick={() => setDeleteTarget({ type: "region", item: region })} disabled={region._count.districts > 0} className="font-semibold text-[#c23b3b] disabled:cursor-not-allowed disabled:opacity-30" title={region._count.districts > 0 ? "Remove all districts first" : undefined}>Delete</button>
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
            <h3 id="districts-heading" className="text-[12px] font-bold uppercase tracking-wide text-[#5b6472]">Districts</h3>
            <p className="mt-0.5 text-[11px] text-[#5b6472]">Showing {visibleDistricts.length} of {districts.length}</p>
          </div>
          <div className="relative w-full sm:w-60">
            <label className="sr-only" htmlFor="district-search">Search districts</label>
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#7b8492]">
              <circle cx="8.5" cy="8.5" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="m12.2 12.2 3.3 3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input id="district-search" type="search" value={districtSearch} onChange={(e) => setDistrictSearch(e.target.value)} placeholder="Search districts" className={`${inputClasses} pl-9`} />
          </div>
        </div>
        {canEdit && (
          <form onSubmit={createDistrict} className="mb-4 grid gap-2 rounded-[9px] bg-[#f4f6fa] p-3 sm:grid-cols-[minmax(160px,1fr)_minmax(150px,0.7fr)_auto] sm:items-end">
            <div>
              <label className={labelClasses}>New district name</label>
              <input value={newDistrictName} onChange={(e) => setNewDistrictName(e.target.value)} className={inputClasses} />
            </div>
            <div>
              <label className={labelClasses}>Region</label>
              <select value={newDistrictRegionId} onChange={(e) => setNewDistrictRegionId(e.target.value)} className={inputClasses}>
                <option value="">Select region</option>
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={busy || newDistrictName.trim().length < 2 || !newDistrictRegionId}
              className="rounded-[9px] bg-[#1f9c7c] px-4 py-2 text-[12.5px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              Add district
            </button>
          </form>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-[#e5e9f0] text-[11px] font-semibold uppercase tracking-wide text-[#5b6472]">
                <th className="py-2">Name</th>
                <th className="py-2">Region</th>
                <th className="py-2">Members</th>
                {canEdit && <th className="py-2">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {visibleDistricts.map((district) => (
                <tr key={district.id} className="border-b border-[#e5e9f0] last:border-0">
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
                  <td className="py-2 text-[#5b6472]">
                    {editingDistrictId === district.id ? (
                      <select
                        value={editingDistrictRegionId}
                        onChange={(e) => setEditingDistrictRegionId(e.target.value)}
                        className={inputClasses}
                      >
                        {regions.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      district.region.name
                    )}
                  </td>
                  <td className="py-2 text-[#5b6472]">{district._count.members}</td>
                  {canEdit && (
                    <td className="py-2">
                      {editingDistrictId === district.id ? (
                        <div className="flex gap-1.5">
                          <button onClick={() => void saveDistrict(district.id)} disabled={busy} className="font-semibold text-[#17805f]">
                            Save
                          </button>
                          <button onClick={() => setEditingDistrictId(null)} className="font-semibold text-[#5b6472]">
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
                            className="font-semibold text-[#1e2761]"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteTarget({ type: "district", item: district })}
                            disabled={district._count.members > 0}
                            className="font-semibold text-[#c23b3b] disabled:cursor-not-allowed disabled:opacity-40"
                            title={district._count.members > 0 ? "Reassign or remove members first" : undefined}
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
                  <td colSpan={canEdit ? 4 : 3} className="py-8 text-center text-[12px] text-[#5b6472]">
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
    </div>
  );
}

function BenefitsTab({ canEdit }: { canEdit: boolean }) {
  const [current, setCurrent] = useState<BenefitPlan | null>(null);
  const [nextPlan, setNextPlan] = useState<BenefitPlan | null>(null);
  const [history, setHistory] = useState<BenefitPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [monthlyPremium, setMonthlyPremium] = useState("");
  const [collectionMethod, setCollectionMethod] = useState("");
  const [benefits, setBenefits] = useState(EMPTY_BENEFITS);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [scheduleRes, historyRes] = await Promise.all([
        api.get("/benefits/schedule"),
        api.get("/benefits/history", { params: { limit: 10 } }),
      ]);
      setCurrent(scheduleRes.data.data.current);
      setNextPlan(scheduleRes.data.data.next);
      setHistory(historyRes.data.data);
    } catch {
      setError("Benefit plan could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateBenefit = (key: string, field: "enabled" | "memberAmount" | "spouseAmount" | "note", value: boolean | string) => {
    setBenefits((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  };

  const openPlanForm = () => {
    const source = nextPlan ?? current;
    setMonthlyPremium(source?.monthlyPremium ?? "");
    setCollectionMethod(source?.collectionMethod ?? "");
    setBenefits(Object.fromEntries(BENEFIT_KEYS.map((key) => {
      const benefit = source?.benefits.find((item) => item.type === BENEFIT_KEY_TO_TYPE[key]);
      return [key, { enabled: benefit?.enabled ?? true, memberAmount: benefit?.memberAmount ?? "", spouseAmount: MEMBER_ONLY_BENEFITS.has(key) ? "" : benefit?.spouseAmount ?? "", note: benefit?.note ?? "" }];
    })) as ReturnType<typeof EMPTY_BENEFITS>);
    const sourceYear = source ? new Date(source.effectiveFrom).getUTCFullYear() : null;
    setEffectiveFrom(sourceYear ? `${sourceYear + 1}-01-01` : new Date().toISOString().slice(0, 10));
    setShowForm(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("/benefits", {
        effectiveFrom,
        monthlyPremium,
        collectionMethod,
        benefits: Object.fromEntries(
          BENEFIT_KEYS.map((key) => [
            key,
            { enabled: benefits[key].enabled, memberAmount: benefits[key].memberAmount, spouseAmount: MEMBER_ONLY_BENEFITS.has(key) ? null : benefits[key].spouseAmount || null, note: benefits[key].note.trim() || null },
          ]),
        ),
      });
      setShowForm(false);
      setEffectiveFrom("");
      setMonthlyPremium("");
      setCollectionMethod("");
      setBenefits(EMPTY_BENEFITS());
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || "Unable to publish this benefit plan.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="overflow-hidden rounded-[12px] border border-(--border-default) bg-(--surface-raised)"><table className="w-full"><tbody><TableSkeleton columns={4} /></tbody></table></div>;

  return (
    <div className="space-y-5">
      {error && <Alert tone="error">{error}</Alert>}

      <div className="rounded-[12px] border border-[#e5e9f0] bg-white p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[14.5px] font-bold text-[#1e2761]">Current Benefit Plan</h2>
            {current && (
              <div className="mt-1 text-[12px] text-[#5b6472]">
                Effective {formatDate(current.effectiveFrom)} · {formatMoney(current.monthlyPremium)}/month via {current.collectionMethod}
              </div>
            )}
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => showForm ? setShowForm(false) : openPlanForm()}
              className="rounded-[9px] bg-[#1f9c7c] px-4 py-2 text-[12.5px] font-bold text-white"
            >
              {showForm ? "Close" : "Publish New Plan"}
            </button>
          )}
        </div>

        {!current && <div className="text-[12.5px] text-[#5b6472]">No benefit plan has been published yet.</div>}

        {nextPlan && <div className="mb-4"><Alert tone="info">A new plan is scheduled for {formatDate(nextPlan.effectiveFrom)} at {formatMoney(nextPlan.monthlyPremium)} per month.</Alert></div>}

        {current && (
          <table className="w-full text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-[#e5e9f0] text-[11px] font-semibold uppercase tracking-wide text-[#5b6472]">
                <th className="py-2">Benefit</th>
                <th className="py-2">Enabled</th>
                <th className="py-2">Member Amount</th>
                <th className="py-2">Spouse Amount</th>
                <th className="py-2">Benefit Note</th>
              </tr>
            </thead>
            <tbody>
              {current.benefits.map((b) => (
                <tr key={b.type} className="border-b border-[#e5e9f0] last:border-0">
                  <td className="py-2">{BENEFIT_LABELS[b.type] ?? b.type}</td>
                  <td className="py-2">{b.enabled ? "Yes" : "No"}</td>
                  <td className="py-2">{formatMoney(b.memberAmount)}</td>
                  <td className="py-2">{formatMoney(b.spouseAmount)}</td>
                  <td className="max-w-[38ch] py-2 text-[#5b6472]">{b.note || "No note provided"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && canEdit && (
        <form onSubmit={submit} className="rounded-[12px] border border-[#e5e9f0] bg-white p-5">
          <h2 className="mb-4 text-[14.5px] font-bold text-[#1e2761]">Publish a new benefit plan version</h2>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={labelClasses}>Effective From</label>
              <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} className={inputClasses} required />
            </div>
            <div>
              <label className={labelClasses}>Monthly Premium (GHS)</label>
              <input value={monthlyPremium} onChange={(e) => setMonthlyPremium(e.target.value)} placeholder="0.00" className={inputClasses} required />
            </div>
            <div>
              <label className={labelClasses}>Collection Method</label>
              <input value={collectionMethod} onChange={(e) => setCollectionMethod(e.target.value)} placeholder="Payroll deduction" className={inputClasses} required />
            </div>
          </div>

          <div className="mb-4 overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-[#e5e9f0] text-[11px] font-semibold uppercase tracking-wide text-[#5b6472]">
                  <th className="py-2">Benefit</th>
                  <th className="py-2">Enabled</th>
                  <th className="py-2">Member Amount</th>
                  <th className="py-2">Spouse Amount</th>
                  <th className="py-2">Benefit Note (optional)</th>
                </tr>
              </thead>
              <tbody>
                {BENEFIT_KEYS.map((key) => (
                  <tr key={key} className="border-b border-[#e5e9f0] last:border-0">
                    <td className="py-2">{BENEFIT_LABELS[BENEFIT_KEY_TO_TYPE[key]]}</td>
                    <td className="py-2">
                      <BenefitToggle
                        checked={benefits[key].enabled}
                        onChange={(checked) => updateBenefit(key, "enabled", checked)}
                        label={BENEFIT_LABELS[BENEFIT_KEY_TO_TYPE[key]]}
                      />
                    </td>
                    <td className="py-2">
                      <input
                        value={benefits[key].memberAmount}
                        onChange={(e) => updateBenefit(key, "memberAmount", e.target.value)}
                        placeholder="0.00"
                        disabled={!benefits[key].enabled}
                        className={inputClasses}
                      />
                    </td>
                    <td className="py-2">
                      <input
                        value={benefits[key].spouseAmount}
                        onChange={(e) => updateBenefit(key, "spouseAmount", e.target.value)}
                        placeholder={MEMBER_ONLY_BENEFITS.has(key) ? "Not covered" : "0.00"}
                        disabled={!benefits[key].enabled || MEMBER_ONLY_BENEFITS.has(key)}
                        className={inputClasses}
                      />
                    </td>
                    <td className="py-2 pl-3">
                      <textarea
                        value={benefits[key].note}
                        onChange={(e) => updateBenefit(key, "note", e.target.value)}
                        placeholder="Explain eligibility, limits, or conditions"
                        rows={2}
                        maxLength={500}
                        className={inputClasses}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="submit"
            disabled={busy || !effectiveFrom || !monthlyPremium || !collectionMethod}
            className="rounded-[9px] bg-[#1f9c7c] px-5 py-2.5 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Publishing…" : "Publish Plan"}
          </button>
        </form>
      )}

      {history.length > 0 && (
        <div className="rounded-[12px] border border-[#e5e9f0] bg-white p-5">
          <h2 className="mb-3 text-[14.5px] font-bold text-[#1e2761]">Plan History</h2>
          <ul className="text-[12.5px]">
            {history.map((plan, index) => <BenefitHistoryItem key={plan.id} plan={plan} initiallyOpen={index === 0} />)}
          </ul>
        </div>
      )}
    </div>
  );
}

const VIEW_ROLES = ["SUPER_ADMIN", "NATIONAL_ADMIN", "REGIONAL_ADMIN"];

export default function Setup() {
  const { user } = useAuth();
  const canEdit = user ? EDIT_ROLES.includes(user.role) : false;
  const canView = user ? VIEW_ROLES.includes(user.role) : false;
  const [tab, setTab] = useState<"geography" | "benefits">("geography");

  if (!canView) {
    return (
      <div className="rounded-[12px] border border-[#e5e9f0] bg-white p-6 text-[13px] text-[#5b6472]">
        Setup is available to Regional Admins and above.
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Setup" description="Configure regions, districts, and the benefit plan. Regional Admins can review configuration; National Admins and Super Admins can publish changes." />

      <div className="mb-5 flex gap-2" role="tablist" aria-label="Setup sections">
        <button type="button" role="tab" aria-selected={tab === "geography"} onClick={() => setTab("geography")} className={tabButton(tab === "geography")}>
          Regions &amp; Districts
        </button>
        <button type="button" role="tab" aria-selected={tab === "benefits"} onClick={() => setTab("benefits")} className={tabButton(tab === "benefits")}>
          Benefit Plan
        </button>
      </div>

      {tab === "geography" ? <GeographyTab canEdit={canEdit} /> : <BenefitsTab canEdit={canEdit} />}
    </div>
  );
}
