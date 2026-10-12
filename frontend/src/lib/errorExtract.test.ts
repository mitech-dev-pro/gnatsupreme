import { describe, expect, it } from "vitest";
import {
  extractError,
  getApiError,
  getApiErrorStatus,
  getNestedApiErrorCode,
} from "./errorExtract";

describe("API errors", () => {
  it("preserves validation messages and authentication status", () => {
    const error = {
      response: {
        status: 401,
        data: {
          message: "Review the claim",
          errors: [{ field: "claimantContact", message: "Phone required" }],
          error: { code: "SESSION_EXPIRED", message: "Sign in again" },
        },
      },
    };
    expect(getApiError(error)).toEqual({
      message: "Review the claim",
      code: undefined,
      errors: [{ field: "claimantContact", message: "Phone required" }],
    });
    expect(getApiErrorStatus(error)).toBe(401);
    expect(getNestedApiErrorCode(error)).toBe("SESSION_EXPIRED");
    expect(extractError(error)).toBe("Sign in again");
  });
  it.each([
    null,
    undefined,
    "offline",
    new Error("offline"),
    { response: { data: { errors: [null, 12], message: {} } } },
  ])("handles untrusted failures without throwing: %s", (error) => {
    expect(() => getApiError(error)).not.toThrow();
    expect(extractError(error)).toBeNull();
  });
});
