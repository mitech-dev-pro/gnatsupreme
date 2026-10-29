import { expect, it } from "vitest";
import { claimNotificationLink } from "./notificationLinks";
it("allows only claim actions in the correct portal", () => {
  expect(claimNotificationLink("/claims/42", "staff")).toBe("/claims/42");
  expect(claimNotificationLink("/member/claims#claim-42", "member")).toBe(
    "/member/claims#claim-42",
  );
  expect(claimNotificationLink("/member/claims/42/resubmit", "member")).toBe(
    "/member/claims/42/resubmit",
  );
  for (const path of [
    "https://example.test",
    "//example.test",
    "javascript:alert(1)",
    "/claims/42",
    "/member/claims/../admin",
    "/member/claims#claim-0",
  ])
    expect(claimNotificationLink(path, "member")).toBeNull();
  expect(claimNotificationLink("/member/claims#claim-42", "staff")).toBeNull();
});
