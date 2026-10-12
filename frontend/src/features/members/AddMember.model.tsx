import { type ReactNode } from "react";
export const RELATIONSHIPS = ["CHILD", "SPOUSE", "PARENT", "SIBLING", "OTHER"];
export const GHANA_CARD = /^GHA-\d{9}-\d$/;
export type BeneficiaryDraft = {
  fullName: string;
  relationship: string;
  dateOfBirth: string;
  trusteeName: string;
};
export type Errors = Record<string, string>;
export type CreatedMember = { id: number; fullName: string; controllerId: string };
export const emptyBeneficiary = (): BeneficiaryDraft => ({
  fullName: "",
  relationship: "CHILD",
  dateOfBirth: "",
  trusteeName: "",
});
export function Field({
  label,
  required,
  help,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  help?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className={`enroll-field ${error ? "has-error" : ""}`}>
      <span>
        {label}
        {required && <b>Required</b>}
      </span>
      {children}
      {error ? (
        <small className="enroll-field__error">{error}</small>
      ) : help ? (
        <small>{help}</small>
      ) : null}
    </label>
  );
}
export function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="enroll-summary-row">
      <dt>{label}</dt>
      <dd>{value || <span>Not provided</span>}</dd>
    </div>
  );
}
