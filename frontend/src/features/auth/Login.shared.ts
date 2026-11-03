export const RELATIONSHIPS = ["CHILD", "SPOUSE", "PARENT", "SIBLING", "OTHER"];
export const GHANA_CARD = /^GHA-\d{9}-\d$/;
export type BeneficiaryDraft = {
  fullName: string;
  relationship: string;
  dateOfBirth: string;
  trusteeName: string;
};
export const emptyBeneficiary = (): BeneficiaryDraft => ({
  fullName: "",
  relationship: "CHILD",
  dateOfBirth: "",
  trusteeName: "",
});
export const inputClasses =
  "w-full rounded-lg border border-border-default bg-text-on-action py-[11px] pl-9 pr-3 text-sm transition-[border-color,box-shadow] duration-150 ease-out focus:border-action-primary focus:shadow-focus-soft focus:outline-none";
