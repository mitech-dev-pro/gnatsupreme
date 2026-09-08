export type ClaimSubmissionInput = {
  idempotencyKey: string;
  member: {
    id: number;
    controllerId: string;
    fullName: string;
  };
  claimType: string;
  claimantType: string;
  claimantName: string;
  claimantIdType: string;
  claimantIdNumber: string;
  claimantContact: Record<string, unknown>;
  claimDetails: Record<string, unknown>;
  paymentMethod: string;
  paymentDetails: Record<string, unknown>;
  notes?: string | null;
  documents: { field: string; name: string; mimeType: string; bytes: Uint8Array<ArrayBuffer> }[];
};

export type ClaimSubmissionResult = {
  externalClaimId: string;
  status: "SUBMITTED";
  externalStatus?: string;
  submittedAt?: Date;
};

export interface ClaimsProvider {
  readonly name: string;
  readonly mode: "HOSTED_FORM" | "API";
  isConfigured(): boolean;
  createSubmission(input: ClaimSubmissionInput): Promise<ClaimSubmissionResult>;
  history(staffId: string): Promise<ExternalClaim[]>;
  details(id: string | number): Promise<ExternalClaimDetails>;
}

export class ClaimsProviderUnavailableError extends Error {}
export type ExternalClaim = {
  id: string; staffId?: string; status?: string; submittedAt?: string; claimType?: string;
  claimNumber?: string; name?: string | null; claimDate?: string | null; amountPayable?: string | null;
};
export type ExternalClaimDetails = ExternalClaim & {
  claimNumber: string;
  name: string | null;
  claimDate: string | null;
  amountPayable: string | null;
  rejectReason: string | null;
};
export class ClaimsDeliveryError extends Error {
  constructor(public readonly outcome: "FAILED" | "UNKNOWN", public readonly code: string, message: string) { super(message); }
}

