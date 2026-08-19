export type ClaimSubmissionInput = {
  idempotencyKey: string;
  member: {
    id: number;
    controllerId: string;
    fullName: string;
  };
  returnUrl?: string;
};

export type ClaimSubmissionResult = {
  externalClaimId?: string;
  formUrl?: string;
  status: "REDIRECT_READY" | "SUBMITTED";
};

export interface ClaimsProvider {
  readonly name: string;
  readonly mode: "HOSTED_FORM" | "API";
  isConfigured(): boolean;
  createSubmission(input: ClaimSubmissionInput): Promise<ClaimSubmissionResult>;
}

export class ClaimsProviderUnavailableError extends Error {}
