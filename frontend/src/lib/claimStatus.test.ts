import { describe, expect, it } from "vitest";
import { claimStage, claimStatusTone } from "./claimStatus";

describe("claim stages", () => {
  const claim = {
    provider: "Claims System",
    source: "MEMBER_PORTAL",
    status: "PENDING",
    reviewedAt: null,
    deliveryState: "NOT_SENT",
  };
  it("identifies who acts next through review and delivery", () => {
    expect(claimStage(claim).label).toBe("Awaiting GNAT review");
    expect(claimStage({ ...claim, reviewedAt: "2026-10-29" }).label).toBe(
      "Ready to send to Claims Portal",
    );
    expect(claimStage({ ...claim, deliveryState: "SENDING" }).label).toBe(
      "Sending to Claims Portal",
    );
    expect(claimStage({ ...claim, deliveryState: "ACCEPTED" }).label).toBe(
      "Received by Claims Portal",
    );
  });
  it("prioritizes delivery problems over a submitted status", () => {
    expect(claimStage({ ...claim, status: "SUBMITTED", deliveryState: "UNKNOWN" }).label).toBe(
      "Delivery unconfirmed",
    );
    expect(claimStage({ ...claim, status: "SUBMITTED", deliveryState: "FAILED" }).label).toBe(
      "Delivery failed",
    );
  });
  it("distinguishes GNAT rejection, correction and historical simulation", () => {
    expect(claimStage({ ...claim, status: "FAILED" }).label).toBe("Rejected by GNAT");
    expect(claimStage({ ...claim, status: "RETURNED" }).label).toBe("Returned for correction");
    expect(claimStage({ ...claim, provider: "SIMULATION" }).label).toBe("Historical simulation");
  });
  it("does not mistake awaiting approval for approval", () => {
    expect(claimStatusTone("Awaiting Approval")).toBe("info");
    expect(claimStatusTone("Approved")).toBe("success");
    expect(claimStatusTone("Rejected")).toBe("danger");
    expect(claimStatusTone("Unfamiliar insurer stage")).toBe("neutral");
  });
  it("never names the external delivery pipeline or its states to a member", () => {
    const member = { audience: "member" as const };
    // NOT_SENT, SENDING, FAILED and UNKNOWN delivery states all collapse to the same
    // non-actionable "being processed" label for a member -- none of them are things the member
    // can or should act on, unlike for staff.
    for (const deliveryState of ["NOT_SENT", "SENDING", "FAILED", "UNKNOWN"]) {
      expect(claimStage({ ...claim, reviewedAt: "2026-10-29", deliveryState }, member).label).toBe(
        "Being processed",
      );
    }
    expect(claimStage({ ...claim, deliveryState: "ACCEPTED" }, member).label).toBe(
      "Submitted for assessment",
    );
    expect(claimStage({ ...claim, deliveryState: "ACCEPTED" }, member).next).not.toMatch(
      /claims portal/i,
    );
    expect(claimStage(claim, member).label).toBe("Awaiting GNAT review");
    expect(claimStage({ ...claim, provider: "SIMULATION" }, member).next).not.toMatch(
      /claims portal/i,
    );
  });
  it("still gives staff the explicit delivery states by default", () => {
    expect(claimStage({ ...claim, deliveryState: "FAILED" }).label).toBe("Delivery failed");
    expect(claimStage({ ...claim, deliveryState: "UNKNOWN" }).label).toBe("Delivery unconfirmed");
  });
});
