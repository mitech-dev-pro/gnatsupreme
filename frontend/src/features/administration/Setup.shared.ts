export type Region = { id: number; name: string; _count: { districts: number } };
export type District = {
  id: number;
  name: string;
  region: { id: number; name: string };
  _count: { members: number };
};
export type DistrictAlias = {
  id: number;
  alias: string;
  district: { id: number; name: string; region: { id: number; name: string } };
  createdBy: { id: number; fullName: string } | null;
  createdAt: string;
};
export type Benefit = {
  type: string;
  enabled: boolean;
  memberAmount: string;
  spouseAmount: string | null;
  note: string | null;
  namedConditions: string[];
};
export type BenefitPlan = {
  id: number;
  effectiveFrom: string;
  monthlyPremium: string;
  collectionMethod: string;
  note: string | null;
  benefits: Benefit[];
  createdBy: { id: number; fullName: string } | null;
  createdAt: string;
};
export const EDIT_ROLES = ["SUPER_ADMIN", "NATIONAL_ADMIN"];
export const BENEFIT_LABELS: Record<string, string> = {
  DEATH: "Death",
  TOTAL_PERMANENT_DISABILITY: "Total Permanent Disability",
  CRITICAL_ILLNESS: "Critical Illness",
  HOSPITALIZATION: "Hospitalization",
};
export const BENEFIT_KEYS = [
  "death",
  "totalPermanentDisability",
  "criticalIllness",
  "hospitalization",
] as const;
export const BENEFIT_KEY_TO_TYPE: Record<(typeof BENEFIT_KEYS)[number], string> = {
  death: "DEATH",
  totalPermanentDisability: "TOTAL_PERMANENT_DISABILITY",
  criticalIllness: "CRITICAL_ILLNESS",
  hospitalization: "HOSPITALIZATION",
};
export const MEMBER_ONLY_BENEFITS = new Set(["criticalIllness", "hospitalization"]);
export const EMPTY_BENEFITS = () =>
  Object.fromEntries(
    BENEFIT_KEYS.map((key) => [
      key,
      { enabled: true, memberAmount: "", spouseAmount: "", note: "", namedConditions: "" },
    ]),
  ) as Record<
    string,
    {
      enabled: boolean;
      memberAmount: string;
      spouseAmount: string;
      note: string;
      namedConditions: string;
    }
  >;
export const inputClasses =
  "w-full rounded-lg border border-border-default bg-text-on-action px-3 py-2 text-sm transition focus:border-action-primary focus:shadow-focus-soft focus:outline-none";
export const labelClasses = "mb-1 block text-xs font-bold text-text-strong";
export const tabButton = (active: boolean) =>
  `rounded-lg px-4 py-2 text-sm font-bold transition ${
    active
      ? "bg-text-strong text-white"
      : "border border-border-default text-text-strong hover:bg-surface-hover"
  }`;
export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
export function formatMoney(value: string | null) {
  if (value == null) return "—";
  return `GHS ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export const VIEW_ROLES = ["SUPER_ADMIN", "NATIONAL_ADMIN", "REGIONAL_ADMIN"];
