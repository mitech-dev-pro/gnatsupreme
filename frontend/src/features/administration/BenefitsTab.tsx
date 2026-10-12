import DatePicker from "@/components/ui/DatePicker";
import { Alert, TableSkeleton } from "@/components/ui/Feedback";
import api from "@/lib/api";
import { getApiError } from "@/lib/errorExtract";
import { parseISODate, toISODate } from "@/lib/utils";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  BENEFIT_KEY_TO_TYPE,
  BENEFIT_KEYS,
  BENEFIT_LABELS,
  type BenefitPlan,
  EMPTY_BENEFITS,
  formatDate,
  formatMoney,
  inputClasses,
  labelClasses,
  MEMBER_ONLY_BENEFITS,
} from "./Setup.shared";

import { BenefitHistoryItem } from "./BenefitHistoryItem";
import { BenefitToggle } from "./BenefitToggle";
export function BenefitsTab({ canEdit }: { canEdit: boolean }) {
  const [current, setCurrent] = useState<BenefitPlan | null>(null);
  const [nextPlan, setNextPlan] = useState<BenefitPlan | null>(null);
  const [history, setHistory] = useState<BenefitPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<number | null>(null);
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

  const updateBenefit = (
    key: string,
    field: "enabled" | "memberAmount" | "spouseAmount" | "note",
    value: boolean | string,
  ) => {
    setBenefits((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  };

  const populatePlanForm = (source: BenefitPlan | null) => {
    setMonthlyPremium(source?.monthlyPremium ?? "");
    setCollectionMethod(source?.collectionMethod ?? "");
    setBenefits(
      Object.fromEntries(
        BENEFIT_KEYS.map((key) => {
          const benefit = source?.benefits.find((item) => item.type === BENEFIT_KEY_TO_TYPE[key]);
          return [
            key,
            {
              enabled: benefit?.enabled ?? true,
              memberAmount: benefit?.memberAmount ?? "",
              spouseAmount: MEMBER_ONLY_BENEFITS.has(key) ? "" : (benefit?.spouseAmount ?? ""),
              note: benefit?.note ?? "",
              namedConditions: benefit?.namedConditions?.join("\n") ?? "",
            },
          ];
        }),
      ) as ReturnType<typeof EMPTY_BENEFITS>,
    );
  };

  const openPlanForm = () => {
    const source = nextPlan ?? current;
    populatePlanForm(source);
    const sourceYear = source ? new Date(source.effectiveFrom).getUTCFullYear() : null;
    setEffectiveFrom(
      sourceYear ? `${sourceYear + 1}-01-01` : new Date().toISOString().slice(0, 10),
    );
    setEditingPlanId(null);
    setShowForm(true);
  };

  const openEditCurrentForm = () => {
    if (!current) return;
    populatePlanForm(current);
    setEffectiveFrom(current.effectiveFrom.slice(0, 10));
    setEditingPlanId(current.id);
    setShowForm(true);
  };

  const closePlanForm = () => {
    setShowForm(false);
    setEditingPlanId(null);
    setError("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = {
        effectiveFrom,
        monthlyPremium,
        collectionMethod,
        benefits: Object.fromEntries(
          BENEFIT_KEYS.map((key) => [
            key,
            {
              enabled: benefits[key].enabled,
              memberAmount: benefits[key].memberAmount,
              spouseAmount: MEMBER_ONLY_BENEFITS.has(key)
                ? null
                : benefits[key].spouseAmount || null,
              note: benefits[key].note.trim() || null,
              namedConditions:
                key === "criticalIllness"
                  ? benefits[key].namedConditions
                      .split(/\r?\n|,/)
                      .map((item) => item.trim())
                      .filter(Boolean)
                  : [],
            },
          ]),
        ),
      };
      if (editingPlanId) await api.patch(`/benefits/${editingPlanId}`, payload);
      else await api.post("/benefits", payload);
      setShowForm(false);
      setEditingPlanId(null);
      setEffectiveFrom("");
      setMonthlyPremium("");
      setCollectionMethod("");
      setBenefits(EMPTY_BENEFITS());
      await load();
    } catch (err: unknown) {
      setError(
        getApiError(err)?.message ||
          `Unable to ${editingPlanId ? "update" : "publish"} this benefit plan.`,
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading)
    return (
      <div className="overflow-hidden rounded-xl border border-border-default bg-(--surface-raised)">
        <table className="w-full">
          <tbody>
            <TableSkeleton columns={4} />
          </tbody>
        </table>
      </div>
    );

  return (
    <div className="space-y-5">
      {error && <Alert tone="error">{error}</Alert>}

      <div className="rounded-xl border border-border-default bg-white p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-text-strong">Current Benefit Plan</h2>
            {current && (
              <div className="mt-1 text-xs text-text-muted">
                Effective {formatDate(current.effectiveFrom)} ·{" "}
                {formatMoney(current.monthlyPremium)}/month via {current.collectionMethod}
              </div>
            )}
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              {current && (
                <button
                  type="button"
                  onClick={openEditCurrentForm}
                  className="rounded-lg border border-border-strong bg-text-on-action px-4 py-2 text-sm font-bold text-text-strong hover:bg-surface-subtle focus:outline-none focus-visible:shadow-focus-soft"
                >
                  Edit Current Plan
                </button>
              )}
              <button
                type="button"
                onClick={showForm && editingPlanId === null ? closePlanForm : openPlanForm}
                className="rounded-lg bg-action-primary px-4 py-2 text-sm font-bold text-white hover:bg-success focus:outline-none focus-visible:shadow-focus-soft"
              >
                {showForm && editingPlanId === null ? "Close" : "Publish New Plan"}
              </button>
            </div>
          )}
        </div>

        {!current && (
          <div className="text-sm text-text-muted">No benefit plan has been published yet.</div>
        )}

        {nextPlan && (
          <div className="mb-4">
            <Alert tone="info">
              A new plan is scheduled for {formatDate(nextPlan.effectiveFrom)} at{" "}
              {formatMoney(nextPlan.monthlyPremium)} per month.
            </Alert>
          </div>
        )}

        {current && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border-default text-xs font-semibold uppercase tracking-wide text-text-muted">
                <th className="py-2">Benefit</th>
                <th className="py-2">Enabled</th>
                <th className="py-2">Member Amount</th>
                <th className="py-2">Spouse Amount</th>
                <th className="py-2">Benefit Note</th>
              </tr>
            </thead>
            <tbody>
              {current.benefits.map((b) => (
                <tr key={b.type} className="border-b border-border-default last:border-0">
                  <td className="py-2">{BENEFIT_LABELS[b.type] ?? b.type}</td>
                  <td className="py-2">{b.enabled ? "Yes" : "No"}</td>
                  <td className="py-2">{formatMoney(b.memberAmount)}</td>
                  <td className="py-2">{formatMoney(b.spouseAmount)}</td>
                  <td className="max-w-[38ch] py-2 text-text-muted">
                    {b.note || "No note provided"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && canEdit && (
        <form onSubmit={submit} className="rounded-xl border border-border-default bg-white p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-text-strong">
                {editingPlanId ? "Edit current benefit plan" : "Publish a new benefit plan version"}
              </h2>
              {editingPlanId && (
                <p className="mt-1 max-w-[70ch] text-xs leading-relaxed text-text-muted">
                  Saving updates the effective plan immediately. The previous values and your
                  changes will be recorded in the audit log.
                </p>
              )}
            </div>
            {editingPlanId && (
              <button
                type="button"
                onClick={closePlanForm}
                className="rounded-lg border border-border-default px-3 py-1.5 text-xs font-bold text-text-muted hover:bg-surface-subtle"
              >
                Close
              </button>
            )}
          </div>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <DatePicker
                label="Effective From"
                required
                value={parseISODate(effectiveFrom)}
                onChange={(date) => setEffectiveFrom(date ? toISODate(date) : "")}
              />
            </div>
            <div>
              <label className={labelClasses}>Monthly Premium (GHS)</label>
              <input
                value={monthlyPremium}
                onChange={(e) => setMonthlyPremium(e.target.value)}
                placeholder="0.00"
                className={inputClasses}
                required
              />
            </div>
            <div>
              <label className={labelClasses}>Collection Method</label>
              <input
                value={collectionMethod}
                onChange={(e) => setCollectionMethod(e.target.value)}
                placeholder="Payroll deduction"
                className={inputClasses}
                required
              />
            </div>
          </div>

          <div className="mb-4 overflow-x-auto">
            <table className="w-full min-w-205 text-left text-sm">
              <thead>
                <tr className="border-b border-border-default text-xs font-semibold uppercase tracking-wide text-text-muted">
                  <th className="py-2">Benefit</th>
                  <th className="py-2">Enabled</th>
                  <th className="py-2">Member Amount</th>
                  <th className="py-2">Spouse Amount</th>
                  <th className="py-2">Benefit Note (optional)</th>
                </tr>
              </thead>
              <tbody>
                {BENEFIT_KEYS.map((key) => (
                  <tr key={key} className="border-b border-border-default last:border-0">
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
                      {key === "criticalIllness" && (
                        <div className="mt-2">
                          <label
                            htmlFor="critical-illness-list"
                            className="mb-1 block text-xs font-bold text-text-strong"
                          >
                            Named critical illnesses
                          </label>
                          <textarea
                            id="critical-illness-list"
                            value={benefits[key].namedConditions}
                            onChange={(event) =>
                              setBenefits((previous) => ({
                                ...previous,
                                [key]: { ...previous[key], namedConditions: event.target.value },
                              }))
                            }
                            placeholder={"One illness per line\nCancer\nStroke"}
                            rows={4}
                            disabled={!benefits[key].enabled}
                            aria-describedby="critical-illness-list-help"
                            className={inputClasses}
                          />
                          <p
                            id="critical-illness-list-help"
                            className="mt-1 text-xs leading-relaxed text-text-muted"
                          >
                            Enter one covered condition per line. This list appears beside Critical
                            Illness in the member portal.
                          </p>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="submit"
            disabled={busy || !effectiveFrom || !monthlyPremium || !collectionMethod}
            className="rounded-lg bg-action-primary px-5 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy
              ? editingPlanId
                ? "Saving…"
                : "Publishing…"
              : editingPlanId
                ? "Save Plan Changes"
                : "Publish Plan"}
          </button>
        </form>
      )}

      {history.length > 0 && (
        <div className="rounded-xl border border-border-default bg-white p-5">
          <h2 className="mb-3 text-lg font-bold text-text-strong">Plan History</h2>
          <ul className="text-sm">
            {history.map((plan, index) => (
              <BenefitHistoryItem key={plan.id} plan={plan} initiallyOpen={index === 0} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
