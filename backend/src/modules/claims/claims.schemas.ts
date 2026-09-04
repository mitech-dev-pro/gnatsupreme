import { z } from "zod";

const deathTpdDetailsSchema = z.object({
  subjectName: z.string().trim().min(2).max(120),
  relationship: z.string().trim().min(2).max(80),
  dateOfEvent: z.coerce.date().max(new Date(), "Date cannot be in the future"),
  cause: z.string().trim().min(2).max(300),
});

const criticalIllnessDetailsSchema = z.object({
  diagnosisDate: z.coerce.date().max(new Date(), "Date cannot be in the future"),
  diagnosingHospital: z.string().trim().min(2).max(160),
  diagnosingPhysician: z.string().trim().min(2).max(120),
  illness: z.string().trim().min(2).max(160),
  illnessOther: z.string().trim().max(200).optional(),
});

const hospitalizationDetailsSchema = z
  .object({
    hospitalName: z.string().trim().min(2).max(160),
    admissionDate: z.coerce.date().max(new Date(), "Date cannot be in the future"),
    dischargeDate: z.coerce.date().max(new Date(), "Date cannot be in the future"),
    reason: z.string().trim().min(2).max(300),
  })
  .refine((value) => value.dischargeDate >= value.admissionDate, {
    message: "Discharge date must be on or after admission date",
    path: ["dischargeDate"],
  });

export function claimSubmissionUnion<T extends z.ZodRawShape>(baseFields: T) {
  return z.discriminatedUnion("claimType", [
    z.object({ claimType: z.literal("DEATH"), claimDetails: deathTpdDetailsSchema, ...baseFields }),
    z.object({ claimType: z.literal("TOTAL_PERMANENT_DISABILITY"), claimDetails: deathTpdDetailsSchema, ...baseFields }),
    z.object({ claimType: z.literal("CRITICAL_ILLNESS"), claimDetails: criticalIllnessDetailsSchema, ...baseFields }),
    z.object({ claimType: z.literal("HOSPITALIZATION"), claimDetails: hospitalizationDetailsSchema, ...baseFields }),
  ]);
}

// Both admission/discharge are date-only (z.coerce.date() from a `YYYY-MM-DD` input), so both
// land on UTC midnight and this diff is always a whole number of nights. If a timestamp-bearing
// date ever flows in here instead, this rounds to the nearest night rather than truncating --
// normalize both to midnight before diffing if that ever changes.
export function nightsBetween(admission: Date, discharge: Date) {
  return Math.round((discharge.getTime() - admission.getTime()) / 86_400_000);
}

export const HOSPITALIZATION_MINIMUM_NIGHTS = 10;

export type ClaimDocumentTag = "REQUIRED" | "OPTIONAL" | "ANY_ONE_REQUIRED";
export type ClaimDocumentSlot = { key: string; label: string; tag: ClaimDocumentTag };

// Per-claim-type document manifest -- tags drive both the frontend checklist UI and the
// backend's required-document check at submission time. Mirrored in
// frontend/src/lib/claimDocuments.ts (frontend can't import backend source); keep the two in
// sync by hand -- this comment and its frontend counterpart both flag the pairing.
export const CLAIM_DOCUMENT_MANIFEST: Record<string, ClaimDocumentSlot[]> = {
  DEATH: [
    { key: "medicalCertOrDoctorReport", label: "Medical Certificate or Doctor's Report of Cause of Death", tag: "ANY_ONE_REQUIRED" },
    { key: "deathCertOrMortuary", label: "Death Certificate or Mortuary Documentation", tag: "ANY_ONE_REQUIRED" },
    { key: "policeReport", label: "Police Report (in case of accident)", tag: "OPTIONAL" },
    { key: "others", label: "Others", tag: "OPTIONAL" },
  ],
  TOTAL_PERMANENT_DISABILITY: [
    { key: "doctorReport", label: "Doctor's Report of Proof of Inability to Perform Duties", tag: "REQUIRED" },
    { key: "policeReport", label: "Police Report (in case of accident)", tag: "OPTIONAL" },
    { key: "marriageCert", label: "Marriage Certificate (spouse claims only)", tag: "OPTIONAL" },
    { key: "others", label: "Others", tag: "OPTIONAL" },
  ],
  CRITICAL_ILLNESS: [
    { key: "medicalReport", label: "Medical Report / Specialist Confirmation of Diagnosis", tag: "REQUIRED" },
    { key: "labResults", label: "Laboratory / Diagnostic Test Results", tag: "OPTIONAL" },
    { key: "dischargeSummary", label: "Hospital Discharge Summary (if applicable)", tag: "OPTIONAL" },
    { key: "others", label: "Others", tag: "OPTIONAL" },
  ],
  HOSPITALIZATION: [
    { key: "dischargeSummaryOrBill", label: "Hospital Discharge Summary or Medical Bill Showing Number of Nights", tag: "REQUIRED" },
    { key: "doctorReport", label: "Doctor's Report", tag: "OPTIONAL" },
    { key: "others", label: "Others", tag: "OPTIONAL" },
  ],
};

// A claim is "document-complete" when every REQUIRED row has an uploaded file and, if any
// ANY_ONE_REQUIRED rows exist for the type, at least one of them does. Enforced server-side at
// submission time (not just as a client-side counter) so a direct API call or UI bug can't
// submit a claim with no documents attached.
// NOTE: this checks that the uploader *claims* a file satisfies a given slot (self-attested
// slotKey at upload time) -- it is a completeness gate, not a content guarantee. Nothing
// verifies a file tagged "medicalReport" is actually a medical report; that's still a manual
// staff-review judgment downstream, same as it is for every other document today.
// This logic is duplicated (not just the manifest data) in frontend/src/lib/claimDocuments.ts,
// since this repo has no shared/isomorphic package the frontend could import from -- keep both
// copies in sync by hand.
export function hasRequiredDocuments(claimType: string, uploadedKeys: Set<string>) {
  const manifest = CLAIM_DOCUMENT_MANIFEST[claimType] ?? [];
  const requiredOk = manifest.filter((d) => d.tag === "REQUIRED").every((d) => uploadedKeys.has(d.key));
  const anyOneGroup = manifest.filter((d) => d.tag === "ANY_ONE_REQUIRED");
  const anyOneOk = anyOneGroup.length === 0 || anyOneGroup.some((d) => uploadedKeys.has(d.key));
  return requiredOk && anyOneOk;
}

export function dateOfEventFromClaimDetails(claimType: string, claimDetails: Record<string, unknown>): Date {
  if (claimType === "CRITICAL_ILLNESS") return claimDetails.diagnosisDate as Date;
  if (claimType === "HOSPITALIZATION") return claimDetails.admissionDate as Date;
  return claimDetails.dateOfEvent as Date;
}
