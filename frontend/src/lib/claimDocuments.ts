// Frontend mirror of backend/src/modules/claims/claims.schemas.ts's CLAIM_DOCUMENT_MANIFEST and
// hasRequiredDocuments. This repo has no shared/isomorphic package the frontend could import
// from, so both the manifest data and the completeness-check logic are hand-duplicated here --
// keep the two files in sync by hand when either changes.

export type ClaimDocumentTag = "REQUIRED" | "OPTIONAL" | "ANY_ONE_REQUIRED";
export type ClaimDocumentSlot = { key: string; label: string; tag: ClaimDocumentTag };
export type ClaimType = "DEATH" | "TOTAL_PERMANENT_DISABILITY" | "CRITICAL_ILLNESS" | "HOSPITALIZATION";

export const CLAIM_DOCUMENT_MANIFEST: Record<ClaimType, ClaimDocumentSlot[]> = {
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

// NOTE: this checks that the uploader *claims* a file satisfies a given slot (self-attested
// slotKey at upload time) -- it is a completeness gate, not a content guarantee. It doubles as
// the pre-submit gate for the Submit button, independent of the server's own hard enforcement.
export function hasRequiredDocuments(claimType: ClaimType, uploadedKeys: Set<string>) {
  const manifest = CLAIM_DOCUMENT_MANIFEST[claimType] ?? [];
  const requiredOk = manifest.filter((d) => d.tag === "REQUIRED").every((d) => uploadedKeys.has(d.key));
  const anyOneGroup = manifest.filter((d) => d.tag === "ANY_ONE_REQUIRED");
  const anyOneOk = anyOneGroup.length === 0 || anyOneGroup.some((d) => uploadedKeys.has(d.key));
  return requiredOk && anyOneOk;
}

export function nightsBetween(admission: string, discharge: string) {
  const a = new Date(admission);
  const d = new Date(discharge);
  return Math.round((d.getTime() - a.getTime()) / 86_400_000);
}

export const HOSPITALIZATION_MINIMUM_NIGHTS = 10;

export const CLAIM_TYPES: { value: ClaimType; label: string; coverage: string }[] = [
  { value: "DEATH", label: "Death Claim", coverage: "Member & Spouse" },
  { value: "TOTAL_PERMANENT_DISABILITY", label: "Total & Permanent Disability", coverage: "Member & Spouse" },
  { value: "CRITICAL_ILLNESS", label: "Named Critical Illness", coverage: "Member only" },
  { value: "HOSPITALIZATION", label: "Hospitalization", coverage: "Member only" },
];

export function claimSupportsSpouse(claimType: ClaimType) {
  return claimType === "DEATH" || claimType === "TOTAL_PERMANENT_DISABILITY";
}
