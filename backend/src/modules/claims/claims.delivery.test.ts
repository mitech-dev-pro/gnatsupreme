import assert from "node:assert/strict";
import test from "node:test";
import { deliverClaim, type ClaimDeliveryDependencies } from "./claims.delivery.js";
import { ClaimDocumentError } from "./claims.documents.js";

// Only the fields deliverClaim actually reads off the claim/member records -- kept loose (not
// modelling the full ExternalClaimSubmission shape) so this stays a faithful test of
// deliverClaim's own logic without being brittle to unrelated schema fields.
function claimFixture(deliveryState: string) {
  return {
    idempotencyKey: "staff:1:test-key",
    memberId: 123,
    submittedByMemberId: null,
    claimType: "HOSPITALIZATION",
    claimantType: "MEMBER",
    claimantName: "Test Member",
    claimantIdType: "GHANA_CARD",
    claimantIdNumber: "GHA-123456789-0",
    claimantContact: {},
    claimDetails: {},
    paymentMethod: "CHEQUE",
    paymentDetails: {},
    documentIds: [] as number[],
    notes: null,
    deliveryState,
    member: { id: 123, controllerId: "123456", fullName: "Test Member" },
  };
}

function dependencies(
  overrides: Partial<{
    startingDeliveryState: string;
    createSubmission: () => Promise<{ externalClaimId: string; status: "SUBMITTED" }>;
    documents: () => Promise<unknown[]>;
  }> = {},
) {
  const state = { deliveryState: overrides.startingDeliveryState ?? "NOT_SENT" };
  const updateCalls: Record<string, unknown> = {};
  const db = {
    externalClaimSubmission: {
      updateMany: async () => {
        const allowed = ["NOT_SENT", "FAILED", "UNKNOWN"];
        if (!allowed.includes(state.deliveryState)) return { count: 0 };
        state.deliveryState = "SENDING";
        return { count: 1 };
      },
      findUniqueOrThrow: async () => claimFixture(state.deliveryState),
      update: async (args: { data: Record<string, unknown> }) => {
        Object.assign(updateCalls, args.data);
        if (typeof args.data.deliveryState === "string") state.deliveryState = args.data.deliveryState;
        return claimFixture(state.deliveryState);
      },
    },
  };
  const deps = {
    db,
    provider: {
      isConfigured: () => true,
      createSubmission:
        overrides.createSubmission ??
        (async () => ({ externalClaimId: "MK-1", status: "SUBMITTED" as const })),
    },
    documents: overrides.documents ?? (async () => []),
  } as unknown as ClaimDeliveryDependencies;
  return { deps, state, updateCalls };
}

for (const startingDeliveryState of ["NOT_SENT", "FAILED", "UNKNOWN"]) {
  test(`deliverClaim retries a claim starting from ${startingDeliveryState}`, async () => {
    const { deps, state } = dependencies({ startingDeliveryState });
    const result = await deliverClaim(5, deps);
    assert.equal(state.deliveryState, "ACCEPTED");
    assert.equal((result as { deliveryState: string }).deliveryState, "ACCEPTED");
  });
}

for (const inFlightState of ["SENDING", "ACCEPTED"]) {
  test(`deliverClaim refuses to re-claim a delivery already in ${inFlightState}`, async () => {
    const createSubmission = async (): Promise<{ externalClaimId: string; status: "SUBMITTED" }> => {
      assert.fail("must not contact the provider for a delivery already in flight or accepted");
    };
    const { deps, state } = dependencies({ startingDeliveryState: inFlightState, createSubmission });
    await deliverClaim(5, deps);
    // updateMany's guard rejected the claim attempt, so state is untouched.
    assert.equal(state.deliveryState, inFlightState);
  });
}

test("deliverClaim records FAILED (not UNKNOWN) when preparation fails before the provider is ever contacted", async () => {
  // A document error thrown while loading documents happens before the provider request starts,
  // so the outcome must be the more precise FAILED/PREPARATION_FAILED -- not UNKNOWN, which is
  // reserved for failures where the provider might already have received the request.
  const documents = async (): Promise<unknown[]> => {
    throw new ClaimDocumentError("Attach the required documents for this claim type.");
  };
  const createSubmission = async (): Promise<{ externalClaimId: string; status: "SUBMITTED" }> => {
    assert.fail("must not contact the provider once document preparation has failed");
  };
  const { deps, updateCalls } = dependencies({
    startingDeliveryState: "FAILED",
    createSubmission,
    documents,
  });
  const result = await deliverClaim(5, deps);
  assert.equal((result as { deliveryState: string }).deliveryState, "FAILED");
  assert.equal(updateCalls.errorCode, "PREPARATION_FAILED");
  assert.equal(updateCalls.errorMessage, "Attach the required documents for this claim type.");
});

test("deliverClaim records UNKNOWN once the provider request has actually started", async () => {
  const createSubmission = async (): Promise<{ externalClaimId: string; status: "SUBMITTED" }> => {
    throw new Error("network blip");
  };
  const { deps, updateCalls } = dependencies({
    startingDeliveryState: "FAILED",
    createSubmission,
  });
  const result = await deliverClaim(5, deps);
  assert.equal((result as { deliveryState: string }).deliveryState, "UNKNOWN");
  assert.equal(updateCalls.errorCode, "ACCEPTANCE_NOT_SAVED");
});
