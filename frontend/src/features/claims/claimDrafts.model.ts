import {
  CLAIM_DOCUMENT_MANIFEST,
  type ClaimType,
  nightsBetween,
  HOSPITALIZATION_MINIMUM_NIGHTS,
} from "@/lib/claimDocuments";
import { hasGhanaCardIdDigits } from "@/lib/ghanaCardId";
import type { UploadedClaimDocument } from "@/components/claims/ClaimDocumentChecklist";

export type ClaimDraftPayload = {
  claimType: ClaimType | "";
  claimantType: "MEMBER" | "SPOUSE";
  claimantIdNumber: string;
  contact: {
    fullName: string;
    nationality: string;
    email: string;
    gpsAddress: string;
    residentialAddress: string;
  };
  details: {
    subjectName: string;
    relationship: string;
    dateOfEvent: string;
    cause: string;
    diagnosisDate: string;
    diagnosingHospital: string;
    diagnosingPhysician: string;
    illness: string;
    illnessOther: string;
    hospitalName: string;
    admissionDate: string;
    dischargeDate: string;
    reason: string;
  };
  paymentDetails: { payeeName?: string };
  notes: string;
  page: number;
};
export type ClaimDraft = {
  id: number;
  revision: number;
  memberId: number;
  member: { id: number; controllerId: string; fullName: string };
  payload: ClaimDraftPayload;
  documents: UploadedClaimDocument[];
  submissionKey: string;
  updatedAt: string;
  missingDocumentCount?: number;
};
export function draftSignature(payload: ClaimDraftPayload, documentIds: number[]) {
  const normalize = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(normalize)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, item]) => [key, normalize(item)]),
          )
        : value;
  const { page: _page, ...data } = payload;
  return JSON.stringify(
    normalize({ payload: data, documentIds: [...documentIds].sort((a, b) => a - b) }),
  );
}
export function draftTasks(
  payload: ClaimDraftPayload,
  documents: UploadedClaimDocument[],
): string[] {
  const tasks: string[] = [],
    details = payload.details;
  if (!payload.claimType) tasks.push("Choose a claim type");
  if (!hasGhanaCardIdDigits(payload.claimantIdNumber))
    tasks.push("Complete the covered person's Ghana Card number");
  if (payload.contact.fullName.trim().length < 2) tasks.push("Complete the claimant contact name");
  if (payload.contact.nationality.trim().length < 2)
    tasks.push("Complete the claimant nationality");
  const required =
    payload.claimType === "HOSPITALIZATION"
      ? [
          [details.hospitalName, "Hospital name"],
          [details.admissionDate, "Admission date"],
          [details.dischargeDate, "Discharge date"],
          [details.reason, "Reason for hospitalization"],
        ]
      : payload.claimType === "CRITICAL_ILLNESS"
        ? [
            [details.diagnosisDate, "Diagnosis date"],
            [details.diagnosingHospital, "Diagnosing hospital"],
            [details.illness, "Named illness"],
            ...(details.illness === "Others"
              ? [[details.illnessOther, "Specify the illness"]]
              : []),
          ]
        : payload.claimType
          ? [
              [details.subjectName, "Covered person's name"],
              [details.relationship, "Relationship"],
              [details.dateOfEvent, "Date of event"],
              [details.cause, "Cause"],
            ]
          : [];
  required.forEach(([value, label]) => {
    if (!value?.trim()) tasks.push(label);
  });
  if (
    payload.claimType === "HOSPITALIZATION" &&
    details.admissionDate &&
    details.dischargeDate &&
    nightsBetween(details.admissionDate, details.dischargeDate) < HOSPITALIZATION_MINIMUM_NIGHTS
  )
    tasks.push("Check the admission dates: the 10-night minimum must be met");
  if (payload.claimType) {
    const slots = CLAIM_DOCUMENT_MANIFEST[payload.claimType],
      uploaded = new Set(documents.map((item) => item.slotKey));
    slots
      .filter((slot) => slot.tag === "REQUIRED" && !uploaded.has(slot.key))
      .forEach((slot) => tasks.push(`Attach ${slot.label}`));
    const any = slots.filter((slot) => slot.tag === "ANY_ONE_REQUIRED");
    if (any.length && !any.some((slot) => uploaded.has(slot.key)))
      tasks.push(`Attach one of: ${any.map((slot) => slot.label).join(" or ")}`);
  }
  tasks.push("Review the details and accept the declaration before submitting");
  return tasks;
}
