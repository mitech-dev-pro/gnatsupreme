import { useState } from "react";
import { BENEFIT_LABELS, type BenefitPlan, formatDate, formatMoney } from "./Setup.shared";

export function BenefitHistoryItem({
  plan,
  initiallyOpen,
}: {
  plan: BenefitPlan;
  initiallyOpen: boolean;
}) {
  const [isOpen, setIsOpen] = useState(initiallyOpen);

  return (
    <li className="border-t border-border-default first:border-t-0">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={`benefit-plan-${plan.id}`}
        onClick={() => setIsOpen((open) => !open)}
        className="group flex w-full items-center gap-3 py-3 text-left focus:outline-none focus-visible:rounded-lg focus-visible:shadow-focus-soft"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          className={`size-4 shrink-0 text-text-muted transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
        >
          <path
            d="m7.5 5 5 5-5 5"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink">
            Effective {formatDate(plan.effectiveFrom)}
          </span>
          <span className="mt-0.5 block truncate text-xs text-text-muted">
            {plan.collectionMethod} · Published by {plan.createdBy?.fullName ?? "System"} on{" "}
            {formatDate(plan.createdAt)}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-semibold text-text-strong">
            {formatMoney(plan.monthlyPremium)}
          </span>
          <span className="block text-xs text-text-muted">per month</span>
        </span>
      </button>

      {isOpen && (
        <div id={`benefit-plan-${plan.id}`} className="pb-4 pl-7">
          <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            {plan.benefits.map((benefit) => (
              <div
                key={benefit.type}
                className="border-t border-surface-disabled py-2.5 first:border-t-0 sm:[&:nth-child(2)]:border-t-0"
              >
                <dt className="flex items-center justify-between gap-3 font-semibold text-text-strong">
                  <span>{BENEFIT_LABELS[benefit.type] ?? benefit.type}</span>
                  <span className="text-xs font-semibold text-text-muted">
                    {benefit.enabled ? "Enabled" : "Disabled"}
                  </span>
                </dt>
                <dd className="mt-0.5 text-text-muted">
                  Member {formatMoney(benefit.memberAmount)} · Spouse{" "}
                  {formatMoney(benefit.spouseAmount)}
                </dd>
                {benefit.note && (
                  <dd className="mt-1 max-w-[70ch] text-xs leading-relaxed text-text-muted">
                    {benefit.note}
                  </dd>
                )}
              </div>
            ))}
          </dl>
        </div>
      )}
    </li>
  );
}
