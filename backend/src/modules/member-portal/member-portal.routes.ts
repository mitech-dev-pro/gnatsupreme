import { memberClaimSubmissionSchema } from "./member-portal.claims.schemas.js";
import { activeBenefit, uploadedSlotKeys } from "../claims/claims.service.js";
import path from "node:path";
import {
  ClaimDocumentError,
  loadClaimDocuments,
  validateClaimFile,
} from "../claims/claims.documents.js";
import { claimFileUpload } from "../files/file.storage.js";
import { unlink } from "node:fs/promises";

import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";

import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { getCurrentBenefitPlan } from "../benefits/benefit.service.js";
import {
  authenticateMember,
  type AuthenticatedMember,
} from "../../middleware/authenticate-member.js";
import { recordAudit } from "../audit/audit.service.js";
import { createChangeRequestSchema } from "../workflows/workflow.schemas.js";
import { onboardingDetailsSchema } from "../member-auth/member-auth.schemas.js";
import { notifyMember, notifyStaffForMember } from "../notifications/notification.service.js";
import { getOrganizationSettings, publicBranding } from "../settings/settings.service.js";
import { getMemberProfileCompletion } from "./profile-completion.service.js";
import { hasValidFileSignature, memberFileUpload, uploadRoot } from "../files/file.storage.js";
import {
  dateOfEventFromClaimDetails,
  hasRequiredDocuments,
  HOSPITALIZATION_MINIMUM_NIGHTS,
  nightsBetween,
} from "../claims/claims.schemas.js";

export const memberPortalRouter = Router();

function member(response: Response) {
  return response.locals.member as AuthenticatedMember;
}

function asJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

memberPortalRouter.use(authenticateMember);

memberPortalRouter.get("/settings", async (_request, response) => {
  const settings = await getOrganizationSettings();
  response.json({
    success: true,
    data: {
      ...publicBranding(settings),
      address: settings.address,
      privacyNotice: settings.privacyNotice,
    },
  });
});

memberPortalRouter.get("/profile", async (_request, response) => {
  const currentMember = member(response);
  const [profile, benefitPlan, profileCompletion] = await Promise.all([
    prisma.member.findUnique({
      where: { id: currentMember.id },
      select: {
        id: true,
        controllerId: true,
        fullName: true,
        ghanaCardId: true,
        phone: true,
        phoneVerifiedAt: true,
        school: true,
        status: true,
        report20Matched: true,
        district: {
          select: { id: true, name: true, region: { select: { id: true, name: true } } },
        },
        spouse: { select: { id: true, fullName: true, ghanaCardId: true } },
        beneficiaries: { orderBy: { id: "asc" } },
      },
    }),
    getCurrentBenefitPlan(),
    getMemberProfileCompletion(currentMember.id),
  ]);
  if (!profileCompletion.complete) {
    const incompleteLabels = profileCompletion.items
      .filter((item) => item.status !== "COMPLETE")
      .map((item) => item.label);
    await notifyMember({
      memberId: currentMember.id,
      type: "PROFILE_COMPLETION_REQUIRED",
      title: "Complete your membership details",
      message: `Please review these details: ${incompleteLabels.join(", ")}.`,
      idempotencyKey: `profile-completion:${currentMember.id}:v1`,
      sendSms: false,
    });
  }
  response.json({ success: true, data: { member: profile, benefitPlan, profileCompletion } });
});

memberPortalRouter.patch("/profile-completion/dismiss", async (request, response) => {
  const currentMember = member(response);
  const dismissedAt = new Date();
  await prisma.member.update({
    where: { id: currentMember.id },
    data: { profileCompletionDismissedAt: dismissedAt },
  });
  await recordAudit({
    request,
    action: "MEMBER_PROFILE_COMPLETION_DISMISSED",
    entityType: "MEMBER",
    entityId: currentMember.id,
    description: `Member ${currentMember.controllerId} chose to complete their profile later`,
    afterData: { profileCompletionDismissedAt: dismissedAt },
  });
  response.json({ success: true, data: { dismissedAt } });
});

memberPortalRouter.patch("/profile-completion/spouse-declaration", async (request, response) => {
  const parsed = z.object({ hasSpouse: z.literal(false) }).safeParse(request.body);
  if (!parsed.success) {
    response
      .status(400)
      .json({ success: false, message: "Confirm that no spouse should be recorded" });
    return;
  }
  const currentMember = member(response);
  const [existingSpouse, pendingRequest] = await Promise.all([
    prisma.spouse.findUnique({ where: { memberId: currentMember.id }, select: { id: true } }),
    prisma.memberChangeRequest.findFirst({
      where: { memberId: currentMember.id, type: "SPOUSE", status: "PENDING" },
      select: { id: true },
    }),
  ]);
  if (existingSpouse) {
    response.status(409).json({
      success: false,
      message: "A spouse is already recorded. Submit a change request if this is incorrect.",
    });
    return;
  }
  if (pendingRequest) {
    response
      .status(409)
      .json({ success: false, message: "A spouse request is already awaiting review" });
    return;
  }
  await prisma.member.update({
    where: { id: currentMember.id },
    data: { spouseDeclarationStatus: "NONE" },
  });
  await recordAudit({
    request,
    action: "MEMBER_SPOUSE_NONE_DECLARED",
    entityType: "MEMBER",
    entityId: currentMember.id,
    description: `Member ${currentMember.controllerId} declared that no spouse should be recorded`,
    beforeData: { spouseDeclarationStatus: "UNKNOWN" },
    afterData: { spouseDeclarationStatus: "NONE" },
  });
  response.json({ success: true, data: await getMemberProfileCompletion(currentMember.id) });
});

// Direct-write onboarding, distinct from the change-request flow above: this only ever fills in
// currently-blank fields on a brand-new profile (right after account setup), so there is nothing
// to review — an established profile can only be edited afterward via a change request, which is
// where the approval step actually earns its keep.
memberPortalRouter.post("/onboarding", async (request, response) => {
  const parsed = onboardingDetailsSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      success: false,
      message: "Enter valid details to continue",
      errors: parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }
  const currentMember = member(response);
  const { ghanaCardId, spouse, beneficiaries } = parsed.data;

  if (spouse?.ghanaCardId && spouse.ghanaCardId === ghanaCardId) {
    response
      .status(400)
      .json({ success: false, message: "Member and spouse cannot use the same Ghana Card ID." });
    return;
  }

  const existing = await prisma.member.findUniqueOrThrow({
    where: { id: currentMember.id },
    select: {
      ghanaCardId: true,
      spouse: { select: { id: true } },
      _count: { select: { beneficiaries: true } },
    },
  });
  if (existing.ghanaCardId) {
    response.status(409).json({
      success: false,
      message: "Your Ghana Card is already on record. Submit a change request to update it.",
    });
    return;
  }
  if (spouse && existing.spouse) {
    response.status(409).json({
      success: false,
      message: "A spouse is already recorded. Submit a change request to update it.",
    });
    return;
  }
  // A member enrolled by staff may already have a beneficiary on file -- this endpoint only runs
  // because *some* completion item is missing (often just the Ghana Card ID), so don't force
  // submitting another one just to satisfy a count that's already met.
  if (existing._count.beneficiaries === 0 && beneficiaries.length === 0) {
    response.status(400).json({ success: false, message: "Add at least one beneficiary" });
    return;
  }
  if (existing._count.beneficiaries + beneficiaries.length > 10) {
    response
      .status(409)
      .json({ success: false, message: "Up to 10 beneficiaries can be recorded in total." });
    return;
  }

  const duplicateGhanaCard = await prisma.member.findFirst({
    where: { ghanaCardId, id: { not: currentMember.id } },
    select: { id: true },
  });
  if (duplicateGhanaCard) {
    response.status(409).json({
      success: false,
      message: "This Ghana Card ID is already registered to another membership.",
    });
    return;
  }
  if (spouse?.ghanaCardId) {
    const duplicateSpouseCard = await prisma.spouse.findUnique({
      where: { ghanaCardId: spouse.ghanaCardId },
      select: { id: true },
    });
    if (duplicateSpouseCard) {
      response.status(409).json({
        success: false,
        message: "This Ghana Card ID is already registered to another spouse.",
      });
      return;
    }
  }

  const spouseId = await prisma.$transaction(async (transaction) => {
    await transaction.member.update({
      where: { id: currentMember.id },
      data: {
        ghanaCardId,
        // Only touch this when the submission actually changes the spouse picture. A staff
        // enrollment may already have recorded a real spouse (and set this to HAS_SPOUSE) before
        // the member ever reaches this step -- if the member then submits no spouse here (the
        // field is optional), that must NOT be read as "member declared no spouse" and overwrite
        // the correct HAS_SPOUSE status while the actual spouse record is left untouched.
        spouseDeclarationStatus: spouse ? "HAS_SPOUSE" : existing.spouse ? undefined : "NONE",
      },
    });
    const createdSpouse = spouse
      ? await transaction.spouse.create({
          data: {
            memberId: currentMember.id,
            fullName: spouse.fullName,
            ghanaCardId: spouse.ghanaCardId ?? null,
          },
        })
      : null;
    await transaction.beneficiary.createMany({
      data: beneficiaries.map((item) => ({
        memberId: currentMember.id,
        fullName: item.fullName,
        relationship: item.relationship,
        dateOfBirth: item.dateOfBirth ?? null,
        trusteeName: item.trusteeName ?? null,
        trusteeGhanaCardId: item.trusteeGhanaCardId ?? null,
      })),
    });
    return createdSpouse?.id ?? null;
  });

  await recordAudit({
    request,
    action: "MEMBER_ONBOARDING_DETAILS_SUBMITTED",
    entityType: "MEMBER",
    entityId: currentMember.id,
    description: `Member ${currentMember.controllerId} recorded their Ghana Card and policy details during account setup`,
    afterData: { ghanaCardId, hasSpouse: Boolean(spouse), beneficiaryCount: beneficiaries.length },
  });
  response.status(201).json({ success: true, data: { spouseId } });
});

function receiveMarriageCertificate(request: Request, response: Response, next: NextFunction) {
  memberFileUpload.single("file")(request, response, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      response
        .status(413)
        .json({ success: false, message: "File exceeds the configured upload limit" });
      return;
    }
    response.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : "File upload failed",
    });
  });
}

memberPortalRouter.post(
  "/spouse/marriage-certificate",
  receiveMarriageCertificate,
  async (request, response) => {
    if (!request.file) {
      response
        .status(400)
        .json({ success: false, message: "Attach one file using the 'file' field" });
      return;
    }
    if (!(await hasValidFileSignature(request.file.path, request.file.mimetype))) {
      await unlink(request.file.path).catch(() => undefined);
      response
        .status(400)
        .json({ success: false, message: "File content does not match its declared type" });
      return;
    }

    const currentMember = member(response);
    const spouse = await prisma.spouse.findUnique({
      where: { memberId: currentMember.id },
      select: { id: true },
    });
    if (!spouse) {
      await unlink(request.file.path).catch(() => undefined);
      response.status(409).json({
        success: false,
        message: "Add your spouse's details before uploading a marriage certificate",
      });
      return;
    }

    const storagePath = path.posix.join("member-files", request.file.filename);
    const downloadPath = `/api/files/${request.file.filename}`;
    const file = await prisma.storedFile.create({
      data: {
        category: "MARRIAGE_CERTIFICATE",
        originalName: path.basename(request.file.originalname),
        storedName: request.file.filename,
        mimeType: request.file.mimetype,
        sizeBytes: request.file.size,
        storagePath,
        downloadPath,
        memberId: currentMember.id,
        spouseId: spouse.id,
        uploadedByMemberId: currentMember.id,
      },
      select: {
        id: true,
        category: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
      },
    });
    await recordAudit({
      request,
      action: "MEMBER_FILE_UPLOADED",
      entityType: "STORED_FILE",
      entityId: file.id,
      description: `Member ${currentMember.controllerId} uploaded a marriage certificate`,
      afterData: {
        category: file.category,
        originalName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
      },
    });
    response.status(201).json({ success: true, data: file });
  },
);

// A member can never be the one logging in to claim their own death or permanent disability --
// the UI already hides the "For me" option for these two claim types (MemberClaimNew.tsx locks
// the claimant choice to spouse-only), but that's a client-side convenience only. This
// superRefine is the actual enforcement boundary: it rejects claimantType "MEMBER" for
// DEATH/TOTAL_PERMANENT_DISABILITY regardless of what the request body says, so the rule holds
// even against a direct API call that bypasses the wizard entirely. Staff filing the equivalent
// claim (claims.routes.ts, a legitimate "filing on behalf of a deceased member" scenario) uses
// its own submissionSchema built from the same claimSubmissionUnion base and is intentionally not
// subject to this restriction.

const claimSelect = {
  id: true,
  provider: true,
  deliveryState: true,
  externalStatus: true,
  reviewedAt: true,
  externalClaimId: true,
  formUrl: true,
  status: true,
  source: true,
  claimType: true,
  claimantType: true,
  claimDetails: true,
  estimatedAmount: true,
  reviewNote: true,
  errorMessage: true,
  submittedAt: true,
  lastSyncedAt: true,
  createdAt: true,
} as const;

memberPortalRouter.get("/claims", async (_request, response) => {
  const claims = await prisma.externalClaimSubmission.findMany({
    where: { memberId: member(response).id },
    select: claimSelect,
    orderBy: { createdAt: "desc" },
  });
  response.json({ success: true, data: claims });
});

memberPortalRouter.get("/claims/:id", async (request, response) => {
  const params = z.object({ id: z.coerce.number().int().positive() }).safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ success: false, message: "Invalid claim ID" });
    return;
  }
  const currentMember = member(response);
  const claim = await prisma.externalClaimSubmission.findFirst({
    where: { id: params.data.id, memberId: currentMember.id },
    select: {
      ...claimSelect,
      claimantIdType: true,
      claimantIdNumber: true,
      claimantContact: true,
      paymentMethod: true,
      paymentDetails: true,
      documentIds: true,
      notes: true,
    },
  });
  if (!claim) {
    response.status(404).json({ success: false, message: "Claim not found" });
    return;
  }
  const documents = claim.documentIds.length
    ? await prisma.storedFile.findMany({
        where: { id: { in: claim.documentIds } },
        select: { id: true, slotKey: true, originalName: true },
      })
    : [];
  response.json({ success: true, data: { ...claim, documents } });
});

memberPortalRouter.post("/claims", async (request, response) => {
  const parsed = memberClaimSubmissionSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      success: false,
      message: "Review the claim details",
      errors: parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }
  const currentMember = member(response);
  const token = z.string().uuid().safeParse(request.get("Idempotency-Key"));
  if (!token.success) {
    response
      .status(400)
      .json({ success: false, message: "Provide a UUID Idempotency-Key header." });
    return;
  }
  const idempotencyKey = `member-portal:${currentMember.id}:${token.data}`;
  const record = await prisma.member.findUnique({
    where: { id: currentMember.id },
    select: { fullName: true, spouse: { select: { id: true, fullName: true } } },
  });
  if (!record || (parsed.data.claimantType === "SPOUSE" && !record.spouse)) {
    response.status(404).json({ success: false, message: "Covered person not found" });
    return;
  }

  // Payee name and claimant phone are optional at submission -- they can be filled in later,
  // before the claim is paid -- so nothing here blocks a claim that omits them.

  if (parsed.data.claimType === "HOSPITALIZATION") {
    const nights = nightsBetween(
      parsed.data.claimDetails.admissionDate,
      parsed.data.claimDetails.dischargeDate,
    );
    if (nights < HOSPITALIZATION_MINIMUM_NIGHTS) {
      response.status(400).json({
        success: false,
        message:
          "This admission does not meet the minimum 10-night eligibility requirement for the hospitalization benefit.",
      });
      return;
    }
  }

  const uniqueDocumentIds = [...new Set(parsed.data.documentIds)];
  const slotKeys = await uploadedSlotKeys(uniqueDocumentIds, currentMember.id, "MEMBER_PORTAL");
  if (slotKeys === null) {
    response
      .status(400)
      .json({ success: false, message: "One or more claim documents are invalid" });
    return;
  }
  if (!hasRequiredDocuments(parsed.data.claimType, slotKeys)) {
    response.status(400).json({
      success: false,
      message: "Attach the required documents for this claim type before submitting.",
    });
    return;
  }

  try {
    await loadClaimDocuments(
      parsed.data.claimType,
      uniqueDocumentIds,
      currentMember.id,
      currentMember.id,
    );
  } catch (error) {
    if (!(error instanceof ClaimDocumentError)) throw error;
    response.status(400).json({ success: false, message: error.message });
    return;
  }
  const amount =
    (await activeBenefit(parsed.data.claimType, parsed.data.claimantType)).amount ?? null;
  const claimDetails =
    parsed.data.claimType === "HOSPITALIZATION"
      ? {
          ...parsed.data.claimDetails,
          nights: nightsBetween(
            parsed.data.claimDetails.admissionDate,
            parsed.data.claimDetails.dischargeDate,
          ),
        }
      : parsed.data.claimDetails;

  const claim = await prisma.externalClaimSubmission.upsert({
    where: { idempotencyKey },
    update: {},
    create: {
      memberId: currentMember.id,
      submittedByMemberId: currentMember.id,
      source: "MEMBER_PORTAL",
      status: "PENDING",
      provider: "MANKRADO",
      idempotencyKey,
      claimType: parsed.data.claimType,
      claimantType: parsed.data.claimantType,
      claimantName:
        parsed.data.claimantType === "SPOUSE" ? record.spouse?.fullName : record.fullName,
      claimantIdType: parsed.data.claimantIdType,
      claimantIdNumber: parsed.data.claimantIdNumber,
      claimantContact: parsed.data.claimantContact,
      incidentDate: dateOfEventFromClaimDetails(parsed.data.claimType, claimDetails),
      claimDetails,
      estimatedAmount: amount,
      paymentMethod: parsed.data.paymentMethod,
      paymentDetails: parsed.data.paymentDetails,
      documentIds: uniqueDocumentIds,
      notes: parsed.data.notes || null,
    },
    select: claimSelect,
  });
  await recordAudit({
    request,
    action: "MEMBER_CLAIM_SUBMITTED",
    entityType: "EXTERNAL_CLAIM_SUBMISSION",
    entityId: claim.id,
    description: `Member ${currentMember.controllerId} submitted a ${parsed.data.claimType.toLowerCase().replaceAll("_", " ")} claim for review`,
    afterData: { claimType: parsed.data.claimType, claimantType: parsed.data.claimantType },
  });
  await notifyStaffForMember({
    memberId: currentMember.id,
    type: "MEMBER_CLAIM_SUBMITTED",
    title: "New claim submitted",
    message: `${currentMember.fullName} submitted a ${parsed.data.claimType.toLowerCase().replaceAll("_", " ")} claim for review.`,
    idempotencyKey: `claim-submitted:${claim.id}`,
  });
  response.status(201).json({ success: true, data: claim });
});

memberPortalRouter.patch("/claims/:id/resubmit", async (request, response) => {
  const params = z.object({ id: z.coerce.number().int().positive() }).safeParse(request.params);
  const parsed = memberClaimSubmissionSchema.safeParse(request.body);
  if (!params.success || !parsed.success) {
    response.status(400).json({
      success: false,
      message: "Review the claim details",
      errors: parsed.success
        ? undefined
        : parsed.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
    });
    return;
  }
  const currentMember = member(response);
  const existing = await prisma.externalClaimSubmission.findFirst({
    where: {
      id: params.data.id,
      submittedByMemberId: currentMember.id,
      status: "RETURNED",
      deliveryState: "NOT_SENT",
    },
    select: { id: true },
  });
  if (!existing) {
    response.status(404).json({ success: false, message: "No returned claim matches that ID" });
    return;
  }
  const record = await prisma.member.findUnique({
    where: { id: currentMember.id },
    select: { fullName: true, spouse: { select: { id: true, fullName: true } } },
  });
  if (!record || (parsed.data.claimantType === "SPOUSE" && !record.spouse)) {
    response.status(404).json({ success: false, message: "Covered person not found" });
    return;
  }

  // Payee name and claimant phone are optional at submission -- they can be filled in later,
  // before the claim is paid -- so nothing here blocks a claim that omits them.

  if (parsed.data.claimType === "HOSPITALIZATION") {
    const nights = nightsBetween(
      parsed.data.claimDetails.admissionDate,
      parsed.data.claimDetails.dischargeDate,
    );
    if (nights < HOSPITALIZATION_MINIMUM_NIGHTS) {
      response.status(400).json({
        success: false,
        message:
          "This admission does not meet the minimum 10-night eligibility requirement for the hospitalization benefit.",
      });
      return;
    }
  }

  const uniqueDocumentIds = [...new Set(parsed.data.documentIds)];
  const slotKeys = await uploadedSlotKeys(uniqueDocumentIds, currentMember.id, "MEMBER_PORTAL");
  if (slotKeys === null) {
    response
      .status(400)
      .json({ success: false, message: "One or more claim documents are invalid" });
    return;
  }
  if (!hasRequiredDocuments(parsed.data.claimType, slotKeys)) {
    response.status(400).json({
      success: false,
      message: "Attach the required documents for this claim type before submitting.",
    });
    return;
  }

  try {
    await loadClaimDocuments(
      parsed.data.claimType,
      uniqueDocumentIds,
      currentMember.id,
      currentMember.id,
    );
  } catch (error) {
    if (!(error instanceof ClaimDocumentError)) throw error;
    response.status(400).json({ success: false, message: error.message });
    return;
  }
  const amount =
    (await activeBenefit(parsed.data.claimType, parsed.data.claimantType)).amount ?? null;
  const claimDetails =
    parsed.data.claimType === "HOSPITALIZATION"
      ? {
          ...parsed.data.claimDetails,
          nights: nightsBetween(
            parsed.data.claimDetails.admissionDate,
            parsed.data.claimDetails.dischargeDate,
          ),
        }
      : parsed.data.claimDetails;

  const updated = await prisma.externalClaimSubmission.update({
    where: { id: existing.id, status: "RETURNED", deliveryState: "NOT_SENT" },
    data: {
      status: "PENDING",
      claimType: parsed.data.claimType,
      claimantType: parsed.data.claimantType,
      claimantName:
        parsed.data.claimantType === "SPOUSE" ? record.spouse?.fullName : record.fullName,
      claimantIdType: parsed.data.claimantIdType,
      claimantIdNumber: parsed.data.claimantIdNumber,
      claimantContact: parsed.data.claimantContact,
      incidentDate: dateOfEventFromClaimDetails(parsed.data.claimType, claimDetails),
      claimDetails,
      estimatedAmount: amount,
      paymentMethod: parsed.data.paymentMethod,
      paymentDetails: parsed.data.paymentDetails,
      documentIds: uniqueDocumentIds,
      notes: parsed.data.notes || null,
      reviewedById: null,
      reviewNote: null,
      reviewedAt: null,
    },
    select: claimSelect,
  });
  await recordAudit({
    request,
    action: "MEMBER_CLAIM_RESUBMITTED",
    entityType: "EXTERNAL_CLAIM_SUBMISSION",
    entityId: existing.id,
    description: `Member ${currentMember.controllerId} edited and resubmitted a returned claim`,
    afterData: { claimType: parsed.data.claimType, claimantType: parsed.data.claimantType },
  });
  await notifyStaffForMember({
    memberId: currentMember.id,
    type: "MEMBER_CLAIM_SUBMITTED",
    title: "Claim resubmitted",
    message: `${currentMember.fullName} resubmitted a ${parsed.data.claimType.toLowerCase().replaceAll("_", " ")} claim for review.`,
    idempotencyKey: `claim-resubmitted:${existing.id}:${Date.now()}`,
  });
  response.json({ success: true, data: updated });
});

function receiveClaimDocument(request: Request, response: Response, next: NextFunction) {
  claimFileUpload.single("file")(request, response, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      response
        .status(413)
        .json({ success: false, message: "File exceeds the configured upload limit" });
      return;
    }
    response.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : "File upload failed",
    });
  });
}

memberPortalRouter.post("/claims/documents", receiveClaimDocument, async (request, response) => {
  if (!request.file) {
    response
      .status(400)
      .json({ success: false, message: "Attach one file using the 'file' field" });
    return;
  }
  if (!(await hasValidFileSignature(request.file.path, request.file.mimetype))) {
    await unlink(request.file.path).catch(() => undefined);
    response
      .status(400)
      .json({ success: false, message: "File content does not match its declared type" });
    return;
  }
  const currentMember = member(response);
  try {
    validateClaimFile({
      originalName: request.file.originalname,
      mimeType: request.file.mimetype,
      sizeBytes: request.file.size,
    });
  } catch (error) {
    await unlink(request.file.path).catch(() => undefined);
    response.status(400).json({ success: false, message: (error as Error).message });
    return;
  }
  const slotKey =
    typeof request.body.slotKey === "string" && request.body.slotKey.trim()
      ? request.body.slotKey.trim().slice(0, 80)
      : null;
  const storagePath = path.posix.join("member-files", request.file.filename);
  const downloadPath = `/api/files/${request.file.filename}`;
  const file = await prisma.storedFile.create({
    data: {
      category: "CLAIM_DOCUMENT",
      originalName: path.basename(request.file.originalname),
      storedName: request.file.filename,
      mimeType: request.file.mimetype,
      sizeBytes: request.file.size,
      storagePath,
      downloadPath,
      memberId: currentMember.id,
      uploadedByMemberId: currentMember.id,
      slotKey,
    },
    select: {
      id: true,
      category: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      slotKey: true,
      createdAt: true,
    },
  });
  await recordAudit({
    request,
    action: "MEMBER_FILE_UPLOADED",
    entityType: "STORED_FILE",
    entityId: file.id,
    description: `Member ${currentMember.controllerId} uploaded a claim document`,
    afterData: {
      category: file.category,
      slotKey: file.slotKey,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
    },
  });
  response.status(201).json({ success: true, data: file });
});

memberPortalRouter.delete("/claims/documents/:id", async (request, response) => {
  const params = z.object({ id: z.coerce.number().int().positive() }).safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ success: false, message: "Invalid document ID" });
    return;
  }
  const currentMember = member(response);
  const file = await prisma.storedFile.findFirst({
    where: { id: params.data.id, uploadedByMemberId: currentMember.id, category: "CLAIM_DOCUMENT" },
    select: { id: true, storagePath: true },
  });
  if (!file) {
    response.status(404).json({ success: false, message: "Document not found" });
    return;
  }
  const attached = await prisma.externalClaimSubmission.findFirst({
    where: {
      documentIds: { has: file.id },
      NOT: { status: "RETURNED", deliveryState: "NOT_SENT" },
    },
    select: { id: true },
  });
  if (attached) {
    response.status(409).json({
      success: false,
      message:
        "Documents on a filed claim cannot be deleted. Request a return for correction first.",
    });
    return;
  }
  await prisma.storedFile.delete({ where: { id: file.id } });
  await unlink(path.resolve(uploadRoot, file.storagePath)).catch(() => undefined);
  await recordAudit({
    request,
    action: "MEMBER_FILE_REMOVED",
    entityType: "STORED_FILE",
    entityId: file.id,
    description: `Member ${currentMember.controllerId} removed a claim document`,
  });
  response.json({ success: true, data: { id: file.id } });
});

memberPortalRouter.get("/change-requests", async (_request, response) => {
  const requests = await prisma.memberChangeRequest.findMany({
    where: { memberId: member(response).id },
    select: {
      id: true,
      type: true,
      status: true,
      targetBeneficiaryId: true,
      proposedData: true,
      requestNote: true,
      reviewNote: true,
      requestedAt: true,
      reviewedAt: true,
    },
    orderBy: { requestedAt: "desc" },
  });
  response.json({ success: true, data: requests });
});

memberPortalRouter.post("/change-requests", async (request, response) => {
  const parsed = createChangeRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      success: false,
      message: "Invalid change request",
      errors: parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }
  const currentMember = member(response);
  const targetId = "targetBeneficiaryId" in parsed.data ? parsed.data.targetBeneficiaryId : null;
  if (targetId) {
    const target = await prisma.beneficiary.findFirst({
      where: { id: targetId, memberId: currentMember.id },
      select: { id: true },
    });
    if (!target) {
      response.status(404).json({ success: false, message: "Beneficiary not found" });
      return;
    }
  }
  const duplicate = await prisma.memberChangeRequest.findFirst({
    where: {
      memberId: currentMember.id,
      type: parsed.data.type,
      targetBeneficiaryId: targetId,
      status: "PENDING",
    },
    select: { id: true },
  });
  if (duplicate) {
    response.status(409).json({
      success: false,
      message: "A matching change request is already pending",
      existingRequestId: duplicate.id,
    });
    return;
  }
  const item = await prisma.memberChangeRequest.create({
    data: {
      memberId: currentMember.id,
      type: parsed.data.type,
      targetBeneficiaryId: targetId,
      proposedData: "proposedData" in parsed.data ? asJson(parsed.data.proposedData) : undefined,
      requestNote: parsed.data.requestNote,
    },
  });
  await recordAudit({
    request,
    action: "MEMBER_SELF_SERVICE_CHANGE_REQUESTED",
    entityType: "MEMBER_CHANGE_REQUEST",
    entityId: item.id,
    description: `Member ${currentMember.controllerId} requested a ${item.type} change`,
    afterData: { memberId: currentMember.id, type: item.type },
  });
  await notifyStaffForMember({
    memberId: currentMember.id,
    type: "MEMBER_CHANGE_REQUESTED",
    title: "Member change request",
    message: `${currentMember.fullName} submitted a ${item.type.toLowerCase().replaceAll("_", " ")} request for review.`,
    idempotencyKey: `change-request:${item.id}`,
  });
  response.status(201).json({ success: true, data: item });
});

memberPortalRouter.patch("/change-requests/:id/cancel", async (request, response) => {
  const params = z.object({ id: z.coerce.number().int().positive() }).safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ success: false, message: "Invalid change request ID" });
    return;
  }

  const currentMember = member(response);
  const item = await prisma.memberChangeRequest.findFirst({
    where: { id: params.data.id, memberId: currentMember.id },
    select: { id: true, type: true, status: true },
  });
  if (!item) {
    response.status(404).json({ success: false, message: "Change request not found" });
    return;
  }
  if (item.status !== "PENDING") {
    response
      .status(409)
      .json({ success: false, message: "Only pending requests can be cancelled" });
    return;
  }

  const updated = await prisma.memberChangeRequest.updateMany({
    where: { id: item.id, memberId: currentMember.id, status: "PENDING" },
    data: { status: "CANCELLED", reviewedAt: new Date() },
  });
  if (updated.count === 0) {
    response.status(409).json({ success: false, message: "This request is no longer pending" });
    return;
  }

  await recordAudit({
    request,
    action: "MEMBER_SELF_SERVICE_CHANGE_CANCELLED",
    entityType: "MEMBER_CHANGE_REQUEST",
    entityId: item.id,
    description: `Member ${currentMember.controllerId} cancelled a ${item.type} change request`,
    beforeData: item,
    afterData: { ...item, status: "CANCELLED" },
  });
  response.json({ success: true, data: { id: item.id, status: "CANCELLED" } });
});
