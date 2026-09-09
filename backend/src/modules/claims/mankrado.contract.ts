import type { ClaimSubmissionInput } from "./claims.provider.js";
export { parseSubmission, parseHistory, parseDetails } from "./mankrado.responses.js";

// Provisional contract: keep provider field names and response parsing here.
export const CLAIM_FILE_FIELDS: Record<string, Record<string, string>> = {
  DEATH: {
    medicalCertOrDoctorReport: "death_med",
    deathCertOrMortuary: "death_cert",
    policeReport: "death_police",
  },
  TOTAL_PERMANENT_DISABILITY: { doctorReport: "tpd_doc", policeReport: "tpd_police" },
  CRITICAL_ILLNESS: { medicalReport: "ci_med", labResults: "ci_lab" },
  HOSPITALIZATION: { dischargeSummaryOrBill: "hospital_med" },
};
// Confirmed with Mankrado: our internal claimType enum is not sent as-is -- these short
// values are what their API expects for claim_type.
export const CLAIM_TYPE_VALUES: Record<string, string> = {
  DEATH: "death",
  TOTAL_PERMANENT_DISABILITY: "tpd",
  CRITICAL_ILLNESS: "ci",
  HOSPITALIZATION: "hospital",
};
// Confirmed against the live sandbox (2026-09-08 Postman test, HTTP 200 with a claimId
// returned): submission field names are camelCase, not snake_case -- claimType,
// claimantIdType, ghanaCardNumber, claimant, mobileNumber, paymentMethod, and
// per-claim-type detail keys (hospitalName, dischargeDate, reason, ...) are sent as-is.
// admissionDate is the one detail key that still needs renaming (see override below).
// No staff/member ID field is sent -- Mankrado matches the member by ghanaCardNumber.
// Fields beyond that confirmed set (submissionReference, memberName, claimantType,
// notes) are kept as extras: harmless if Mankrado ignores unknown fields, and may still
// matter for reconciliation/audit on their side even though the confirmed test omitted
// them.
const CLAIM_DETAIL_FIELD_OVERRIDES: Record<string, string> = {
  admissionDate: "adminDate",
};
// death_doc is reserved until its meaning is confirmed.
export const CLAIM_MAX_FILE_BYTES = 1_000_000;
export const CLAIM_MIME_EXTENSIONS: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
};
export function submissionForm(input: ClaimSubmissionInput) {
  const form = new FormData();
  const append = (key: string, value: unknown) => {
    if (value === undefined || value === null || value === "") return;
    const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
    // Every confirmed date-carrying key either starts with "date" (dateOfEvent) or ends
    // with "Date" (dischargeDate, diagnosisDate, adminDate) -- controlled, known key set.
    form.append(key, /^date|Date$/.test(key) ? text.slice(0, 10) : text);
  };
  const fields = {
    claimType: CLAIM_TYPE_VALUES[input.claimType] ?? input.claimType,
    claimantIdType: input.claimantIdType,
    ghanaCardNumber: input.claimantIdNumber,
    claimant: input.claimantName,
    mobileNumber: input.claimantContact.primaryPhone,
    paymentMethod: input.paymentMethod,
    // Extras kept alongside the confirmed fields; see comment above.
    submissionReference: input.idempotencyKey,
    memberName: input.member.fullName,
    claimantType: input.claimantType,
    notes: input.notes,
  };
  Object.entries(fields).forEach(([key, value]) => append(key, value));
  Object.entries(input.claimantContact)
    .filter(([key]) => key !== "primaryPhone")
    .forEach(([key, value]) => append(key === "fullName" ? "contactName" : key, value));
  Object.entries(input.claimDetails).forEach(([key, value]) =>
    append(CLAIM_DETAIL_FIELD_OVERRIDES[key] ?? key, value),
  );
  Object.entries(input.paymentDetails).forEach(([key, value]) => append(key, value));
  input.documents.forEach((doc) =>
    form.append(doc.field, new Blob([doc.bytes], { type: doc.mimeType }), doc.name),
  );
  return form;
}
