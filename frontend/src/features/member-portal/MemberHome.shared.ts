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
export type MemberProfile = {
  id: number;
  controllerId: string;
  fullName: string;
  ghanaCardId: string | null;
  phone: string | null;
  phoneVerifiedAt: string | null;
  school: string;
  status: string;
  report20Matched: boolean;
  district: {
    id: number;
    name: string;
    region: { id: number; name: string };
  } | null;
  spouse: Spouse | null;
  beneficiaries: Beneficiary[];
};
export type BenefitLine = {
  type: string;
  enabled: boolean;
  memberAmount: string;
  spouseAmount: string | null;
  note: string | null;
  namedConditions: string[];
};
export type BenefitPlan = {
  effectiveFrom: string;
  monthlyPremium: string;
  collectionMethod: string;
  note: string | null;
  benefits: BenefitLine[];
} | null;
export const BENEFIT_LABELS: Record<string, string> = {
  DEATH: "Death / Funeral Benefit",
  TOTAL_PERMANENT_DISABILITY: "Total Permanent Disability",
  CRITICAL_ILLNESS: "Critical Illness",
  HOSPITALIZATION: "Hospitalisation",
};
export type MemberNotification = {
  id: number;
  type: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
};
export type ClaimItem = {
  deliveryState?: string;
  reviewedAt?: string | null;
  id: number;
  provider: string;
  externalClaimId: string | null;
  status: "PENDING" | "REDIRECT_READY" | "SUBMITTED" | "RETURNED" | "FAILED" | "SYNCHRONIZED";
  source: "STAFF" | "MEMBER_PORTAL";
  claimType: string | null;
  claimantType: string | null;
  estimatedAmount: string | null;
  reviewNote: string | null;
  errorMessage: string | null;
  submittedAt: string | null;
  createdAt: string;
};
export const CLAIM_TYPE_LABELS: Record<string, string> = {
  DEATH: "Death Claim",
  TOTAL_PERMANENT_DISABILITY: "Total & Permanent Disability",
  CRITICAL_ILLNESS: "Named Critical Illness",
  HOSPITALIZATION: "Hospitalization",
};
export type ProfileCompletion = {
  complete: boolean;
  percentage: number;
  showExpandedPrompt: boolean;
  items: Array<{
    key: "ghanaCardId" | "spouse" | "beneficiary";
    label: string;
    status: "COMPLETE" | "PENDING" | "MISSING";
    requestType: "MEMBER_DETAILS" | "SPOUSE" | "BENEFICIARY_ADD";
  }>;
};
export type ChangeRequest = {
  id: number;
  type:
    "MEMBER_DETAILS" | "SPOUSE" | "BENEFICIARY_ADD" | "BENEFICIARY_UPDATE" | "BENEFICIARY_REMOVE";
  status: "PENDING" | "APPROVED" | "RETURNED" | "REJECTED" | "CANCELLED";
  targetBeneficiaryId: number | null;
  proposedData: Record<string, unknown> | null;
  requestNote: string | null;
  reviewNote: string | null;
  requestedAt: string;
  reviewedAt: string | null;
};
export const RELATIONSHIPS = ["CHILD", "SPOUSE", "PARENT", "SIBLING", "OTHER"];
export const REQUEST_TYPE_LABELS: Record<string, string> = {
  MEMBER_DETAILS: "My details",
  SPOUSE: "Spouse",
  BENEFICIARY_ADD: "Add beneficiary",
  BENEFICIARY_UPDATE: "Update beneficiary",
  BENEFICIARY_REMOVE: "Remove beneficiary",
};
export const REQUEST_STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-warning-soft text-warning-accent",
  APPROVED: "bg-success-soft text-success",
  RETURNED: "bg-warning-soft text-warning-accent",
  REJECTED: "bg-danger-soft text-danger",
  CANCELLED: "bg-info-soft text-text-muted",
};
export const REQUEST_FIELD_LABELS: Record<string, string> = {
  fullName: "Full name",
  dateOfBirth: "Date of birth",
  ghanaCardId: "Ghana Card ID",
  phone: "Phone number",
  school: "School",
  relationship: "Relationship",
  trusteeName: "Trustee name",
  trusteeGhanaCardId: "Trustee Ghana Card ID",
};
export function requestValue(value: unknown) {
  if (value === null || value === "") return "Not provided";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value).replaceAll("_", " ");
}
export const inputClasses =
  "w-full rounded-lg border border-border-default bg-text-on-action px-3 py-2 text-sm transition focus:border-action-primary focus:shadow-focus-soft focus:outline-none";
export const labelClasses = "mb-1 block text-xs font-bold text-text-strong";
export function timeAgo(iso: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
export function formatDate(iso: string | null) {
  if (!iso) return "Not provided";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
export function toDateInput(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}
export type MemberPortalSection =
  "profile" | "coverage" | "requests" | "claims" | "notifications" | "help";
