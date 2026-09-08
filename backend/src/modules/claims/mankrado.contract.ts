import { z } from "zod";
import type { ClaimSubmissionInput, ClaimSubmissionResult, ExternalClaim, ExternalClaimDetails } from "./claims.provider.js";
import { ClaimsDeliveryError } from "./claims.provider.js";

// Provisional contract: keep provider field names and response parsing here.
export const CLAIM_FILE_FIELDS: Record<string, Record<string, string>> = {
  DEATH: { medicalCertOrDoctorReport: "death_med", deathCertOrMortuary: "death_cert", policeReport: "death_police" },
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
  "application/pdf": [".pdf"], "image/jpeg": [".jpg", ".jpeg"], "application/msword": [".doc"],
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
  Object.entries(input.claimDetails).forEach(([key, value]) => append(CLAIM_DETAIL_FIELD_OVERRIDES[key] ?? key, value));
  Object.entries(input.paymentDetails).forEach(([key, value]) => append(key, value));
  input.documents.forEach((doc) => form.append(doc.field, new Blob([doc.bytes], { type: doc.mimeType }), doc.name));
  return form;
}
// Validate grouping before removing commas so malformed amounts cannot silently change value.
const payableSchema = z.union([
  z.string().trim().regex(/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/).transform((amount) => amount.replaceAll(",", "")),
  z.number().finite().nonnegative().transform(String),
]).nullable();
// Confirmed submission response from the live sandbox (2026-09-08 Postman test):
// {"status":"200","claimId":"316192"} -- no externalStatus/submittedAt are returned.
export function parseSubmission(value: unknown): ClaimSubmissionResult {
  const result = z.object({
    status: z.union([z.literal("200"), z.literal(200)]),
    claimId: z.union([z.string().trim().min(1).max(200), z.number().int().positive()]).transform(String),
  }).safeParse(value);
  if (!result.success) throw new ClaimsDeliveryError("UNKNOWN", "INVALID_RESPONSE", "Mankrado acceptance could not be confirmed. Check claim history before attempting another submission.");
  return { externalClaimId: result.data.claimId, status: "SUBMITTED" };
}
export function parseHistory(value: unknown): ExternalClaim[] {
  const { history } = z.object({
    status: z.union([z.literal("200"), z.literal(200)]),
    history: z.array(z.object({
      claimNumber: z.union([z.string().trim().min(1), z.number().int().safe().nonnegative()]).transform(String),
      name: z.string().nullable(),
      claimDate: z.iso.date().nullable(),
      amountPayable: payableSchema,
      claimStatus: z.string().trim().min(1),
      staff_id: z.string().optional(),
    })),
  }).parse(value);
  // Preserve repeated rows: a repeated claim number does not prove they are the same record.
  return history.map((item) => ({ id: item.claimNumber, claimNumber: item.claimNumber,
    name: item.name, claimDate: item.claimDate, amountPayable: item.amountPayable,
    status: item.claimStatus, staffId: item.staff_id }));
}
// Confirmed details envelope from Postman. The lookup ID and claimNumber are distinct:
// the provider may accept a numeric ID and return a human-readable MC reference.
export function parseDetails(value: unknown, requestedId: string): ExternalClaimDetails {
  const { details } = z.object({
    status: z.union([z.literal("200"), z.literal(200)]),
    details: z.object({
      claimNumber: z.string().trim().min(1),
      name: z.string().nullable(),
      claimDate: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,7})?$/).nullable(),
      amountPayable: payableSchema,
      claimStatus: z.string().trim().min(1),
      rejectReason: z.string().nullable(),
    }),
  }).parse(value);
  return { id: requestedId, claimNumber: details.claimNumber, name: details.name,
    claimDate: details.claimDate, amountPayable: details.amountPayable,
    status: details.claimStatus, rejectReason: details.rejectReason };
}
