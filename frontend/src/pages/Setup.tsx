import { useCallback, useEffect, useState, type FormEvent } from "react";
import api from "@/lib/api";
import ConfirmationPanel from "@/components/ui/ConfirmationPanel";
import { useAuth } from "@/lib/AuthContext";

type Region = { id: number; name: string; _count: { districts: number } };
type District = { id: number; name: string; region: { id: number; name: string }; _count: { members: number } };

type Benefit = { type: string; enabled: boolean; memberAmount: string; spouseAmount: string | null };
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

  const visibleDistricts = districtRegionFilter
    ? districts.filter((d) => String(d.region.id) === districtRegionFilter)
    : districts;

  if (loading) return <div className="text-[13px] text-[#5b6472]">Loading…</div>;

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg bg-[#fbe9e9] px-3 py-2 text-[12.5px] font-semibold text-[#c23b3b]">{error}</div>
      )}

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

      <div className="rounded-[12px] border border-[#e5e9f0] bg-white p-5">
        <h2 className="mb-3 text-[14.5px] font-bold text-[#1e2761]">Regions</h2>
        {canEdit && (
          <form onSubmit={createRegion} className="mb-4 flex flex-wrap items-end gap-2">
            <div className="max-w-64 flex-1">
              <label className={labelClasses}>New region name</label>
              <input value={newRegionName} onChange={(e) => setNewRegionName(e.target.value)} className={inputClasses} />
            </div>
            <button
              type="submit"
              disabled={busy || newRegionName.trim().length < 2}
              className="rounded-[9px] bg-[#1f9c7c] px-4 py-2 text-[12.5px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              Add region
            </button>
          </form>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-[#e5e9f0] text-[11px] font-semibold uppercase tracking-wide text-[#5b6472]">
                <th className="py-2">Name</th>
                <th className="py-2">Districts</th>
                {canEdit && <th className="py-2">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {regions.map((region) => (
                <tr key={region.id} className="border-b border-[#e5e9f0] last:border-0">
                  <td className="py-2">
                    {editingRegionId === region.id ? (
                      <input
                        value={editingRegionName}
                        onChange={(e) => setEditingRegionName(e.target.value)}
                        className={inputClasses}
                        autoFocus
                      />
                    ) : (
                      region.name
                    )}
                  </td>
                  <td className="py-2 text-[#5b6472]">{region._count.districts}</td>
                  {canEdit && (
                    <td className="py-2">
                      {editingRegionId === region.id ? (
                        <div className="flex gap-1.5">
                          <button onClick={() => void saveRegion(region.id)} disabled={busy} className="font-semibold text-[#17805f]">
                            Save
                          </button>
                          <button onClick={() => setEditingRegionId(null)} className="font-semibold text-[#5b6472]">
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2.5">
                          <button
                            onClick={() => {
                              setEditingRegionId(region.id);
                              setEditingRegionName(region.name);
                            }}
                            className="font-semibold text-[#1e2761]"
                          >
                            Rename
                          </button>
                          <button
                            onClick={() => setDeleteTarget({ type: "region", item: region })}
                            disabled={region._count.districts > 0}
                            className="font-semibold text-[#c23b3b] disabled:cursor-not-allowed disabled:opacity-40"
                            title={region._count.districts > 0 ? "Remove all districts first" : undefined}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-[12px] border border-[#e5e9f0] bg-white p-5">
        <h2 className="mb-3 text-[14.5px] font-bold text-[#1e2761]">Districts</h2>
        {canEdit && (
          <form onSubmit={createDistrict} className="mb-4 flex flex-wrap items-end gap-2">
            <div className="max-w-64 flex-1">
              <label className={labelClasses}>New district name</label>
              <input value={newDistrictName} onChange={(e) => setNewDistrictName(e.target.value)} className={inputClasses} />
            </div>
            <div className="max-w-52">
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
        <div className="mb-3">
          <select value={districtRegionFilter} onChange={(e) => setDistrictRegionFilter(e.target.value)} className={`max-w-52 ${inputClasses}`}>
            <option value="">All regions</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
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
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function BenefitsTab({ canEdit }: { canEdit: boolean }) {
  const [current, setCurrent] = useState<BenefitPlan | null>(null);
  const [history, setHistory] = useState<BenefitPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [monthlyPremium, setMonthlyPremium] = useState("");
  const [collectionMethod, setCollectionMethod] = useState("");
  const [note, setNote] = useState("");
  const [benefits, setBenefits] = useState(
    Object.fromEntries(BENEFIT_KEYS.map((key) => [key, { enabled: true, memberAmount: "", spouseAmount: "" }])) as Record<
      string,
      { enabled: boolean; memberAmount: string; spouseAmount: string }
    >,
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [currentRes, historyRes] = await Promise.all([
        api.get("/benefits/current"),
        api.get("/benefits/history", { params: { limit: 10 } }),
      ]);
      setCurrent(currentRes.data.data);
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

  const updateBenefit = (key: string, field: "enabled" | "memberAmount" | "spouseAmount", value: boolean | string) => {
    setBenefits((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
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
        note: note.trim() || undefined,
        benefits: Object.fromEntries(
          BENEFIT_KEYS.map((key) => [
            key,
            { enabled: benefits[key].enabled, memberAmount: benefits[key].memberAmount, spouseAmount: benefits[key].spouseAmount || null },
          ]),
        ),
      });
      setShowForm(false);
      setEffectiveFrom("");
      setMonthlyPremium("");
      setCollectionMethod("");
      setNote("");
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || "Unable to publish this benefit plan.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="text-[13px] text-[#5b6472]">Loading…</div>;

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg bg-[#fbe9e9] px-3 py-2 text-[12.5px] font-semibold text-[#c23b3b]">{error}</div>
      )}

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
              onClick={() => setShowForm((v) => !v)}
              className="rounded-[9px] bg-[#1f9c7c] px-4 py-2 text-[12.5px] font-bold text-white"
            >
              {showForm ? "Close" : "Publish New Plan"}
            </button>
          )}
        </div>

        {!current && <div className="text-[12.5px] text-[#5b6472]">No benefit plan has been published yet.</div>}

        {current && (
          <table className="w-full text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-[#e5e9f0] text-[11px] font-semibold uppercase tracking-wide text-[#5b6472]">
                <th className="py-2">Benefit</th>
                <th className="py-2">Enabled</th>
                <th className="py-2">Member Amount</th>
                <th className="py-2">Spouse Amount</th>
              </tr>
            </thead>
            <tbody>
              {current.benefits.map((b) => (
                <tr key={b.type} className="border-b border-[#e5e9f0] last:border-0">
                  <td className="py-2">{BENEFIT_LABELS[b.type] ?? b.type}</td>
                  <td className="py-2">{b.enabled ? "Yes" : "No"}</td>
                  <td className="py-2">{formatMoney(b.memberAmount)}</td>
                  <td className="py-2">{formatMoney(b.spouseAmount)}</td>
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
            <table className="w-full min-w-[560px] text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-[#e5e9f0] text-[11px] font-semibold uppercase tracking-wide text-[#5b6472]">
                  <th className="py-2">Benefit</th>
                  <th className="py-2">Enabled</th>
                  <th className="py-2">Member Amount</th>
                  <th className="py-2">Spouse Amount</th>
                </tr>
              </thead>
              <tbody>
                {BENEFIT_KEYS.map((key) => (
                  <tr key={key} className="border-b border-[#e5e9f0] last:border-0">
                    <td className="py-2">{BENEFIT_LABELS[BENEFIT_KEY_TO_TYPE[key]]}</td>
                    <td className="py-2">
                      <input
                        type="checkbox"
                        checked={benefits[key].enabled}
                        onChange={(e) => updateBenefit(key, "enabled", e.target.checked)}
                      />
                    </td>
                    <td className="py-2">
                      <input
                        value={benefits[key].memberAmount}
                        onChange={(e) => updateBenefit(key, "memberAmount", e.target.value)}
                        placeholder="0.00"
                        className={inputClasses}
                      />
                    </td>
                    <td className="py-2">
                      <input
                        value={benefits[key].spouseAmount}
                        onChange={(e) => updateBenefit(key, "spouseAmount", e.target.value)}
                        placeholder="0.00"
                        className={inputClasses}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mb-4">
            <label className={labelClasses}>Note (optional)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} className={inputClasses} />
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
          <ul className="divide-y divide-[#e5e9f0]">
            {history.map((plan) => (
              <li key={plan.id} className="py-2.5 text-[12.5px]">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#171b26]">Effective {formatDate(plan.effectiveFrom)}</span>
                  <span className="text-[11px] text-[#5b6472]">{formatMoney(plan.monthlyPremium)}/month</span>
                </div>
                <div className="mt-0.5 text-[11.5px] text-[#5b6472]">
                  Published by {plan.createdBy?.fullName ?? "System"} on {formatDate(plan.createdAt)}
                </div>
              </li>
            ))}
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
      <h1 className="mb-1 text-[22px] font-extrabold text-[#1e2761]">Setup</h1>
      <div className="mb-5 text-[12.5px] text-[#5b6472]">
        Scheme configuration — regions, districts, and the benefit plan. Only Super Admins and
        National Admins can make changes; other roles can view what's in their scope.
      </div>

      <div className="mb-5 flex gap-2">
        <button type="button" onClick={() => setTab("geography")} className={tabButton(tab === "geography")}>
          Regions &amp; Districts
        </button>
        <button type="button" onClick={() => setTab("benefits")} className={tabButton(tab === "benefits")}>
          Benefit Plan
        </button>
      </div>

      {tab === "geography" ? <GeographyTab canEdit={canEdit} /> : <BenefitsTab canEdit={canEdit} />}
    </div>
  );
}
