import { prisma } from "../../lib/prisma.js";
import type { ExternalClaimSubmission, Prisma } from "../../generated/prisma/client.js";
import { claimsProvider } from "./mankrado.provider.js";
import {
  ClaimsDeliveryError,
  ClaimsProviderUnavailableError,
  type ClaimSubmissionInput,
  type ClaimsProvider,
} from "./claims.provider.js";
import { ClaimDocumentError, loadClaimDocuments } from "./claims.documents.js";

export type DeliveryClaim = ExternalClaimSubmission & { member: ClaimSubmissionInput["member"] };
export interface ClaimDeliveryDependencies {
  db: {
    externalClaimSubmission: {
      updateMany(
        args: Prisma.ExternalClaimSubmissionUpdateManyArgs,
      ): PromiseLike<{ count: number }>;
      findUniqueOrThrow(args: {
        where: { id: number };
        include: { member: true };
      }): PromiseLike<DeliveryClaim>;
      findUniqueOrThrow(args: { where: { id: number } }): PromiseLike<ExternalClaimSubmission>;
      update(args: Prisma.ExternalClaimSubmissionUpdateArgs): PromiseLike<ExternalClaimSubmission>;
    };
  };
  provider: Pick<ClaimsProvider, "isConfigured" | "createSubmission">;
  documents: typeof loadClaimDocuments;
}

function readDeliveryClaim(args: {
  where: { id: number };
  include: { member: true };
}): Promise<DeliveryClaim>;
function readDeliveryClaim(args: { where: { id: number } }): Promise<ExternalClaimSubmission>;
async function readDeliveryClaim(args: { where: { id: number }; include?: { member: true } }) {
  return args.include
    ? prisma.externalClaimSubmission.findUniqueOrThrow({ where: args.where, include: args.include })
    : prisma.externalClaimSubmission.findUniqueOrThrow({ where: args.where });
}

const defaultDependencies: ClaimDeliveryDependencies = {
  db: {
    externalClaimSubmission: {
      updateMany: (args) => prisma.externalClaimSubmission.updateMany(args),
      findUniqueOrThrow: readDeliveryClaim,
      update: (args) => prisma.externalClaimSubmission.update(args),
    },
  },
  provider: claimsProvider,
  documents: loadClaimDocuments,
};

export async function expireStaleDeliveries() {
  await prisma.externalClaimSubmission.updateMany({
    where: {
      provider: "Claims System",
      deliveryState: "SENDING",
      deliveryStartedAt: { lt: new Date(Date.now() - 120_000) },
    },
    data: {
      deliveryState: "UNKNOWN",
      errorCode: "INTERRUPTED",
      errorMessage:
        "Delivery was interrupted. Check Claims Portal history before submitting again.",
    },
  });
}

export async function deliverClaim(
  id: number,
  dependencies: ClaimDeliveryDependencies = defaultDependencies,
  options: {
    allowUnknown?: boolean;
    expectedDeliveryState?: ExternalClaimSubmission["deliveryState"];
  } = {},
) {
  const { db, provider, documents: readDocuments } = dependencies;
  if (!provider.isConfigured())
    throw new ClaimsProviderUnavailableError(
      "Claims Portal is unavailable. Configure the backend API key and enable API mode.",
    );
  // Only the scoped send endpoint authorizes UNKNOWN after acknowledgment and a fresh
  // history lookup. Submission-key replays must never silently retry uncertain delivery.
  if (options.expectedDeliveryState === "UNKNOWN" && !options.allowUnknown)
    return db.externalClaimSubmission.findUniqueOrThrow({ where: { id } });
  const claimed = await db.externalClaimSubmission.updateMany({
    where: {
      id,
      provider: "Claims System",
      deliveryState: options.expectedDeliveryState ?? {
        in: options.allowUnknown ? ["NOT_SENT", "FAILED", "UNKNOWN"] : ["NOT_SENT", "FAILED"],
      },
      status: "PENDING",
      OR: [{ source: "STAFF" }, { source: "MEMBER_PORTAL", reviewedAt: { not: null } }],
    },
    data: {
      deliveryState: "SENDING",
      deliveryStartedAt: new Date(),
      errorCode: null,
      errorMessage: null,
    },
  });
  if (!claimed.count) return db.externalClaimSubmission.findUniqueOrThrow({ where: { id } });
  let requestStarted = false;
  try {
    const claim = await db.externalClaimSubmission.findUniqueOrThrow({
      where: { id },
      include: { member: true },
    });
    if (
      !claim.claimType ||
      !claim.claimantType ||
      !claim.claimantName ||
      !claim.claimantIdType ||
      !claim.claimantIdNumber ||
      !claim.paymentMethod
    )
      throw new ClaimDocumentError("Claim details are incomplete.");
    const documents = await readDocuments(
      claim.claimType,
      claim.documentIds,
      claim.memberId,
      claim.submittedByMemberId ?? undefined,
    );
    const input: ClaimSubmissionInput = {
      idempotencyKey: claim.idempotencyKey,
      member: claim.member,
      claimType: claim.claimType,
      claimantType: claim.claimantType,
      claimantName: claim.claimantName,
      claimantIdType: claim.claimantIdType,
      claimantIdNumber: claim.claimantIdNumber,
      claimantContact: (claim.claimantContact ?? {}) as Record<string, unknown>,
      claimDetails: (claim.claimDetails ?? {}) as Record<string, unknown>,
      paymentMethod: claim.paymentMethod,
      paymentDetails: (claim.paymentDetails ?? {}) as Record<string, unknown>,
      notes: claim.notes,
      documents,
    };
    requestStarted = true;
    const result = await provider.createSubmission(input);
    await db.externalClaimSubmission.update({
      where: { id },
      data: {
        deliveryState: "ACCEPTED",
        status: "SUBMITTED",
        externalClaimId: result.externalClaimId,
        externalStatus: result.externalStatus ?? null,
        submittedAt: result.submittedAt ?? new Date(),
        errorCode: null,
        errorMessage: null,
      },
    });
  } catch (error) {
    const outcome =
      error instanceof ClaimsDeliveryError ? error.outcome : requestStarted ? "UNKNOWN" : "FAILED";
    await db.externalClaimSubmission.update({
      where: { id },
      data: {
        deliveryState: outcome,
        errorCode:
          error instanceof ClaimsDeliveryError
            ? error.code
            : requestStarted
              ? "ACCEPTANCE_NOT_SAVED"
              : "PREPARATION_FAILED",
        errorMessage:
          error instanceof ClaimDocumentError || error instanceof ClaimsDeliveryError
            ? error.message
            : requestStarted
              ? "Acceptance could not be saved. Check Claims Portal history before submitting again."
              : "Claim preparation failed. Check the documents before submitting again.",
      },
    });
  }
  return db.externalClaimSubmission.findUniqueOrThrow({ where: { id } });
}
