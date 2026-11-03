export type MankradoAssessment = {
  claimNumber: string;
  name: string | null;
  claimDate: string | null;
  amountPayable: string | null;
  status: string;
  rejectReason: string | null;
};
export type AssessmentUpdate = MankradoAssessment & { lastSyncedAt: string };
