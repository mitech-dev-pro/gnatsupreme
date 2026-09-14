import { inspect } from "node:util";
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

// console.log's default inspection depth (2) collapses anything nested past that into
// "[Object]"/"[Array]" -- exactly the data (a history array of claim objects, a nested error's
// Zod issues) this is meant to make visible for debugging the external endpoint. depth: null
// expands fully; maxArrayLength/breakLength keep a large history array from producing a wall of
// truncation dots instead.
function dump(label: string, data: unknown) {
  console.log(
    `\n\n\n ${label} \n\n\n${inspect(data, { depth: null, maxArrayLength: null, breakLength: 120 })}\n`,
  );
}

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
        const uncertain = response.status >= 500 || [408, 409, 429, 401].includes(response.status);
        const responseBody = await response.text().catch(() => "");
        dump("Mankrado request failed", { url: String(url), status: response.status, body: responseBody });
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
      dump("Mankrado request errored before a response could be read", { url: String(url), error });
      throw new ClaimsDeliveryError(
        "UNKNOWN",
        "UNCONFIRMED_RESPONSE",
        "Mankrado delivery is unconfirmed. Check claim history before submitting again.",
      );
    }
  }
  async createSubmission(input: ClaimSubmissionInput) {
    const value = await this.request("claim/submit", submissionForm(input));
    try {
      return parseSubmission(value);
    } catch (error) {
      dump("Mankrado submission response did not match the expected shape", { value, error });
      throw error;
    }
  }
  async history(staffId: string) {
    const value = await this.request(`claims/history/${encodeURIComponent(staffId)}`);
    try {
      return parseHistory(value);
    } catch (error) {
      dump("Mankrado history response did not match the expected shape", { value, error });
      throw error;
    }
  }
  async details(id: string | number) {
    const value = await this.request(`claimdetails/${encodeURIComponent(String(id))}`);
    try {
      return parseDetails(value, String(id));
    } catch (error) {
      dump("Mankrado details response did not match the expected shape", { value, error });
      throw error;
    }
  }
}
export const claimsProvider = new MankradoClaimsProvider();
