export const RELATIONSHIPS = ["CHILD", "SPOUSE", "PARENT", "SIBLING", "OTHER"];
export const REMOVAL_REASONS = ["DEATH", "DISABILITY", "RETIREMENT", "RESIGNATION", "OTHER"];
export const ELEVATED_ROLES = ["SUPER_ADMIN", "NATIONAL_ADMIN", "REGIONAL_ADMIN"];
export const inputClasses =
  "w-full rounded-lg border border-border-default bg-text-on-action px-3 py-2 text-sm transition focus:border-action-primary focus:shadow-focus-soft focus:outline-none";
export const labelClasses = "mb-1 block text-xs font-bold text-text-strong";
export type Beneficiary = {
  id: number;
  fullName: string;
  relationship: string;
  dateOfBirth: string | null;
  trusteeName: string | null;
  trusteeGhanaCardId: string | null;
};
export type Spouse = {
  fullName: string;
  ghanaCardId: string | null;
};
export type MemberDetailData = {
  id: number;
  controllerId: string;
  fullName: string;
  ghanaCardId: string | null;
  phone: string | null;
  phoneVerifiedAt: string | null;
  email: string | null;
  school: string;
  status: string;
  employmentCategory: "TEACHING" | "NON_TEACHING";
  report20Matched: boolean;
  missingFromReport20At: string | null;
  createdAt: string;
  district: {
    id: number;
    name: string;
    region: { id: number; name: string };
  } | null;
  spouse: Spouse | null;
  beneficiaries: Beneficiary[];
  createdBy: { id: number; fullName: string } | null;
};
export type WorkflowEvent = {
  id: number;
  action: string;
  fromStatus: string;
  toStatus: string;
  reason: string | null;
  note: string | null;
  createdAt: string;
  performedBy: { id: number; fullName: string; role: string };
};
export function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
export function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="member-data-field">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
