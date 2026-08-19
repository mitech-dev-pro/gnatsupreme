import { env } from "../../config/env.js";
import {
  type ClaimsProvider,
  ClaimsProviderUnavailableError,
  type ClaimSubmissionInput,
  type ClaimSubmissionResult,
} from "./claims.provider.js";

export class MankradoClaimsProvider implements ClaimsProvider {
  readonly name = "MANKRADO";
  readonly mode = env.MANKRADO_MODE;

  isConfigured() {
    return Boolean(
      env.MANKRADO_ENABLED &&
        env.MANKRADO_BASE_URL &&
        (this.mode === "HOSTED_FORM" || env.MANKRADO_API_KEY),
    );
  }

  async createSubmission(_input: ClaimSubmissionInput): Promise<ClaimSubmissionResult> {
    if (!this.isConfigured()) {
      throw new ClaimsProviderUnavailableError("Mankrado claims integration is not configured");
    }

    throw new ClaimsProviderUnavailableError(
      "Mankrado integration is configured but awaiting the official request and response contract",
    );
  }
}

export const claimsProvider = new MankradoClaimsProvider();
