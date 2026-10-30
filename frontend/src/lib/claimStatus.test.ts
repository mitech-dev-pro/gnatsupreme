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
});
