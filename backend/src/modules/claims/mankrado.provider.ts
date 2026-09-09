import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import {
  ClaimsDeliveryError,
  ClaimsProviderUnavailableError,
  type ClaimsProvider,
  type ClaimSubmissionInput,
} from "./claims.provider.js";
import {
  parseDetails,
  parseHistory,
  parseSubmission,
  submissionForm,
} from "./mankrado.contract.js";

type Configuration = {
  enabled: boolean;
  baseUrl?: string;
  apiKey?: string;
  mode: "HOSTED_FORM" | "API";
};
export class MankradoClaimsProvider implements ClaimsProvider {
  readonly name = "MANKRADO";
  get mode() {
    return this.config.mode;
  }
  constructor(
    private readonly config: Configuration = {
      enabled: env.MANKRADO_ENABLED,
      baseUrl: env.MANKRADO_BASE_URL,
      apiKey: env.MANKRADO_API_KEY,
      mode: env.MANKRADO_MODE,
    },
    private readonly transport: typeof fetch = fetch,
  ) {}
  isConfigured() {
    return Boolean(
      this.config.enabled && this.config.baseUrl && this.config.apiKey && this.mode === "API",
    );
  }
  private async request(relativePath: string, body?: FormData) {
    if (!this.isConfigured())
      throw new ClaimsProviderUnavailableError(
        "Mankrado is unavailable. Configure the backend API key and enable API mode.",
      );
    const url = new URL(relativePath, `${this.config.baseUrl!.replace(/\/+$/, "")}/`);
    // TEMPORARY: log the exact outbound payload while confirming field names for the
    // remaining claim types against the real sandbox. Remove once all types are verified.
    if (body) {
      const payload: Record<string, string> = {};
      for (const [key, value] of body.entries()) {
        payload[key] = value instanceof File ? `[file: ${value.name}, ${value.size} bytes]` : value;
      }
      logger.info({ url: String(url), payload }, "Mankrado outbound submission payload");
    }
    try {
      const response = await this.transport(url, {
        method: body ? "POST" : "GET",
        body,
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
        headers: { "x-api-key": this.config.apiKey!, Accept: "application/json" },
      });
      if (!response.ok) {
        const uncertain = response.status >= 500 || [408, 409, 429].includes(response.status);
        throw new ClaimsDeliveryError(
          uncertain ? "UNKNOWN" : "FAILED",
          `HTTP_${response.status}`,
          uncertain
            ? "Mankrado delivery is unconfirmed. Check claim history before submitting again."
            : `Mankrado rejected the request (HTTP ${response.status}). Check credentials and claim fields.`,
        );
      }
      return (await response.json()) as unknown;
    } catch (error) {
      if (error instanceof ClaimsDeliveryError) throw error;
      throw new ClaimsDeliveryError(
        "UNKNOWN",
        "UNCONFIRMED_RESPONSE",
        "Mankrado delivery is unconfirmed. Check claim history before submitting again.",
      );
    }
  }
  async createSubmission(input: ClaimSubmissionInput) {
    return parseSubmission(await this.request("claim/submit", submissionForm(input)));
  }
  async history(staffId: string) {
    return parseHistory(await this.request(`claims/history/${encodeURIComponent(staffId)}`));
  }
  async details(id: string | number) {
    return parseDetails(
      await this.request(`claimdetails/${encodeURIComponent(String(id))}`),
      String(id),
    );
  }
}
export const claimsProvider = new MankradoClaimsProvider();
