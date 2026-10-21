import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { prisma } from "../../lib/prisma.js";
import { cachedCount } from "../../lib/cached-count.js";
import { authenticate, type AuthenticatedUser } from "../../middleware/authenticate.js";
import { memberScope } from "../members/member.access.js";
import { findMemberByGhanaCard } from "../members/member.routes.js";
import { claimsProvider } from "./mankrado.provider.js";
import { recordAudit } from "../audit/audit.service.js";
import { getCurrentBenefitPlan } from "../benefits/benefit.service.js";
import {
  claimSubmissionUnion,
  dateOfEventFromClaimDetails,
  hasRequiredDocuments,
  HOSPITALIZATION_MINIMUM_NIGHTS,
  nightsBetween,
} from "./claims.schemas.js";

export const claimsRouter = Router();

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z
    .enum(["PENDING", "REDIRECT_READY", "SUBMITTED", "RETURNED", "FAILED", "SYNCHRONIZED"])
    .optional(),
  source: z.enum(["STAFF", "MEMBER_PORTAL"]).optional(),
});
const idSchema = z.object({ id: z.coerce.number().int().positive() });
const lookupSchema = z.object({
  staffId: z.string().trim().regex(/^\d{4,7}$/, "Staff ID must contain 4 to 7 digits"),
});
const estimateSchema = z.object({
  memberId: z.coerce.number().int().positive(),
  claimType: z.enum(["DEATH", "TOTAL_PERMANENT_DISABILITY", "CRITICAL_ILLNESS", "HOSPITALIZATION"]),
  claimantType: z.enum(["MEMBER", "SPOUSE"]),
});
const submissionSchema = claimSubmissionUnion({
  memberId: z.coerce.number().int().positive(),
  claimantType: z.enum(["MEMBER", "SPOUSE"]),
  claimantIdType: z.literal("GHANA_CARD"),
  claimantIdNumber: z.string().trim().min(3, "Enter the claimant ID number").max(80),
  claimantContact: z.object({
    fullName: z.string().trim().min(2).max(120),
    primaryPhone: z.string().trim().min(7).max(30),
    additionalPhone: z.string().trim().max(30).optional(),
    email: z.string().trim().email("Enter a valid email address").or(z.literal("")).optional(),
    gpsAddress: z.string().trim().max(120).optional(),
    residentialAddress: z.string().trim().max(240).optional(),
    nationality: z.string().trim().min(2).max(80),
  }),
  paymentMethod: z.enum(["MOBILE_MONEY", "BANK_ACCOUNT", "CHEQUE", "NO_PAYMENT"]),
  paymentDetails: z.record(z.string(), z.string().trim().max(150)).default({}),
  documentIds: z.array(z.number().int().positive()).max(10).default([]),
  notes: z.string().trim().max(1000).optional(),
});
const reviewSchema = z
  .object({
    action: z.enum(["APPROVE", "RETURN", "REJECT"]),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .refine((value) => value.action === "APPROVE" || Boolean(value.note), {
    message: "A review note is required",
    path: ["note"],
  });

const claimMemberInclude = {
  district: { select: { id: true, name: true, region: { select: { id: true, name: true } } } },
  spouse: { select: { id: true, fullName: true, ghanaCardId: true } },
  beneficiaries: { select: { id: true, fullName: true, relationship: true, dateOfBirth: true } },
} as const;

// Resolves a SPOUSE claimant to the independently-enrolled Member they are, if any -- the
// stored link first (fast path, maintained by every member/spouse write elsewhere), falling
// back to a live Ghana Card lookup if the link is unset (e.g. a spouse record that predates
// this feature and hasn't been touched since). Computed once per request and reused by both
// activeBenefit() and the double-payment safeguard below, rather than re-derived twice.
async function resolveSpouseLinkedMemberId(
  spouse: { linkedMemberId: number | null; ghanaCardId: string | null } | null,
): Promise<number | null> {
  if (!spouse) return null;
  if (spouse.linkedMemberId) return spouse.linkedMemberId;
  if (!spouse.ghanaCardId) return null;
  const match = await findMemberByGhanaCard(spouse.ghanaCardId);
  return match?.id ?? null;
}

// KNOWN LIMITATION: this only fixes what THIS APP displays and stores (estimatedAmount below).
// The real Mankrado submission contract (mankrado.contract.ts, on the branch that has it wired
// up) sends claimantType + the claimant's own Ghana Card ID but no amount field at all --
// Mankrado determines the actual payout on its own side, with no concept of a linked spouse.
// This does NOT guarantee Mankrado itself pays the member rate for a linked spouse once that
// integration goes live; a member could see one figure here and be paid another. Needs a
// separate, owned follow-up (confirm with Mankrado how a linked spouse should be submitted)
// before this can be considered complete in a Mankrado-live environment.
async function activeBenefit(
  claimType: z.infer<typeof estimateSchema>["claimType"],
  claimantType: "MEMBER" | "SPOUSE",
  linkedMemberId: number | null,
) {
  const plan = await getCurrentBenefitPlan();
  const benefit = plan?.benefits.find((item) => item.type === claimType && item.enabled);
  const payAsMember = claimantType === "MEMBER" || linkedMemberId !== null;
  const amount = payAsMember ? benefit?.memberAmount : benefit?.spouseAmount;
  return { plan, benefit, amount };
}

// Only DEATH and TOTAL_PERMANENT_DISABILITY genuinely mean "this can only happen once per
// person" -- CRITICAL_ILLNESS and HOSPITALIZATION can legitimately recur, so the
// double-payment safeguard below is scoped to just these two.
const ONE_OFF_CLAIM_TYPES = new Set(["DEATH", "TOTAL_PERMANENT_DISABILITY"]);

// Guards against the same real-world event (e.g. a death) being paid out twice: once as a
// SPOUSE claim at the member rate (because the spouse is independently linked to another
// Member), and again as that linked Member's own claim. Checked in both directions. Known,
// accepted limitation: this reads then creates, so two submissions arriving at the same moment
// could both pass -- not solved with additional locking, since this only applies to two claim
// types and is not a high-frequency path.
async function linkedClaimConflict(
  claimType: z.infer<typeof estimateSchema>["claimType"],
  claimantType: "MEMBER" | "SPOUSE",
  member: { id: number; ghanaCardId?: string | null },
  linkedMemberId: number | null,
): Promise<boolean> {
  if (!ONE_OFF_CLAIM_TYPES.has(claimType)) return false;
  if (claimantType === "SPOUSE") {
    if (linkedMemberId === null) return false;
    const existing = await prisma.externalClaimSubmission.findFirst({
      where: { claimType, claimantType: "MEMBER", memberId: linkedMemberId, status: { not: "FAILED" } },
      select: { id: true },
    });
    return Boolean(existing);
  }
  // claimantType === "MEMBER": is this member independently linked as someone else's spouse,
  // either via a stored link or a card match (matches both an already-linked spouse row and
  // one that would resolve via the live fallback)?
  const existing = await prisma.externalClaimSubmission.findFirst({
    where: {
      claimType,
      claimantType: "SPOUSE",
      status: { not: "FAILED" },
      member: {
        spouse: {
          OR: [{ linkedMemberId: member.id }, ...(member.ghanaCardId ? [{ ghanaCardId: member.ghanaCardId }] : [])],
        },
      },
    },
    select: { id: true },
  });
  return Boolean(existing);
}

async function uploadedSlotKeys(documentIds: number[], memberId: number) {
  if (!documentIds.length) return new Set<string>();
  const files = await prisma.storedFile.findMany({
    where: { id: { in: documentIds }, memberId, category: "CLAIM_DOCUMENT" },
    select: { id: true, slotKey: true },
  });
  if (files.length !== new Set(documentIds).size) return null;
  return new Set(files.map((file) => file.slotKey).filter((key): key is string => Boolean(key)));
}

const submissionSelect = {
  id: true,
  externalClaimId: true,
  provider: true,
  status: true,
  source: true,
  claimType: true,
  claimantName: true,
  estimatedAmount: true,
  errorMessage: true,
  reviewNote: true,
  reviewedAt: true,
  submittedAt: true,
  lastSyncedAt: true,
  createdAt: true,
  member: { select: { id: true, controllerId: true, fullName: true } },
  submittedBy: { select: { id: true, fullName: true } },
  submittedByMember: { select: { id: true, controllerId: true, fullName: true } },
  reviewedBy: { select: { id: true, fullName: true } },
} as const;

claimsRouter.use(authenticate);

claimsRouter.get("/provider", (_request, response) => {
  response.json({
    success: true,
    data: {
      provider: claimsProvider.name,
      mode: claimsProvider.mode,
      configured: claimsProvider.isConfigured(),
      submissionsEnabled: true,
      simulation: true,
    },
  });
});

claimsRouter.get("/illnesses", async (_request, response) => {
  const plan = await getCurrentBenefitPlan();
  const benefit = plan?.benefits.find((item) => item.type === "CRITICAL_ILLNESS" && item.enabled);
  response.json({ success: true, data: { illnesses: benefit?.namedConditions ?? [] } });
});

claimsRouter.get("/member-lookup", async (request, response) => {
  const parsed = lookupSchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ success: false, message: "Enter a valid Staff ID" });
    return;
  }
  const user = response.locals.user as AuthenticatedUser;
  const member = await prisma.member.findFirst({
    // Staff IDs are numeric and normalized by validation, so exact equality can use
    // the existing unique B-tree index instead of an ILIKE scan.
    where: { controllerId: parsed.data.staffId, ...memberScope(user) },
    select: { id: true, controllerId: true, fullName: true, phone: true, email: true, ghanaCardId: true, school: true, status: true, ...claimMemberInclude },
  });
  if (!member) {
    response.status(404).json({ success: false, message: "No accessible member matches that Staff ID" });
    return;
  }
  response.json({ success: true, data: member });
});

claimsRouter.get("/estimate", async (request, response) => {
  const parsed = estimateSchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ success: false, message: "Choose a claim type and covered person" });
    return;
  }
  const user = response.locals.user as AuthenticatedUser;
  const member = await prisma.member.findFirst({
    where: { id: parsed.data.memberId, ...memberScope(user) },
    select: { id: true, spouse: { select: { id: true, ghanaCardId: true, linkedMemberId: true } } },
  });
  if (!member || (parsed.data.claimantType === "SPOUSE" && !member.spouse)) {
    response.status(404).json({ success: false, message: "Covered person not found" });
    return;
  }
  const linkedMemberId =
    parsed.data.claimantType === "SPOUSE" ? await resolveSpouseLinkedMemberId(member.spouse) : null;
  const estimate = await activeBenefit(parsed.data.claimType, parsed.data.claimantType, linkedMemberId);
  response.json({
    success: true,
    data: {
      amount: estimate.amount?.toString() ?? null,
      effectiveFrom: estimate.plan?.effectiveFrom ?? null,
      note: estimate.benefit?.note ?? null,
      available: Boolean(estimate.amount),
    },
  });
});

claimsRouter.post("/submissions", async (request, response) => {
  const parsed = submissionSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ success: false, message: "Review the claim details", errors: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) });
    return;
  }
  const user = response.locals.user as AuthenticatedUser;
  const member = await prisma.member.findFirst({
    where: { id: parsed.data.memberId, ...memberScope(user) },
    select: {
      id: true,
      controllerId: true,
      fullName: true,
      districtId: true,
      ghanaCardId: true,
      district: { select: { regionId: true } },
      spouse: { select: { id: true, fullName: true, ghanaCardId: true, linkedMemberId: true } },
    },
  });
  if (!member || (parsed.data.claimantType === "SPOUSE" && !member.spouse)) {
    response.status(404).json({ success: false, message: "Member or covered person was not found" });
    return;
  }
  const linkedMemberId =
    parsed.data.claimantType === "SPOUSE" ? await resolveSpouseLinkedMemberId(member.spouse) : null;
  if (await linkedClaimConflict(parsed.data.claimType, parsed.data.claimantType, member, linkedMemberId)) {
    response.status(409).json({
      success: false,
      message:
        "A claim already exists for this benefit type under the linked membership. This needs staff reconciliation before a second claim for the same event can be filed.",
    });
    return;
  }
  const requiredPaymentFields: Record<string, string[]> = {
    MOBILE_MONEY: ["network", "mobileNumber", "accountName"],
    BANK_ACCOUNT: ["bankName", "accountNumber", "accountName"],
    CHEQUE: ["payeeName"],
    NO_PAYMENT: [],
  };
  const missing = (requiredPaymentFields[parsed.data.paymentMethod] ?? []).filter(
    (key) => !parsed.data.paymentDetails[key],
  );
  if (missing.length) {
    response.status(400).json({ success: false, message: "Complete the selected payment details" });
    return;
  }

  if (parsed.data.claimType === "HOSPITALIZATION") {
    const nights = nightsBetween(parsed.data.claimDetails.admissionDate, parsed.data.claimDetails.dischargeDate);
    if (nights < HOSPITALIZATION_MINIMUM_NIGHTS) {
      response.status(400).json({ success: false, message: "This admission does not meet the minimum 10-night eligibility requirement for the hospitalization benefit." });
      return;
    }
  }

  const uniqueDocumentIds = [...new Set(parsed.data.documentIds)];
  const slotKeys = await uploadedSlotKeys(uniqueDocumentIds, member.id);
  if (slotKeys === null) {
    response.status(400).json({ success: false, message: "One or more claim documents are invalid" });
    return;
  }
  if (!hasRequiredDocuments(parsed.data.claimType, slotKeys)) {
    response.status(400).json({ success: false, message: "Attach the required documents for this claim type before submitting." });
    return;
  }

  const estimate = await activeBenefit(parsed.data.claimType, parsed.data.claimantType, linkedMemberId);
  const simulationId = `SIM-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  const claimDetails =
    parsed.data.claimType === "HOSPITALIZATION"
      ? { ...parsed.data.claimDetails, nights: nightsBetween(parsed.data.claimDetails.admissionDate, parsed.data.claimDetails.dischargeDate) }
      : parsed.data.claimDetails;
  const claim = await prisma.externalClaimSubmission.create({
    data: {
      memberId: member.id,
      submittedById: user.id,
      source: "STAFF",
      provider: "SIMULATION",
      idempotencyKey: `simulation:${randomUUID()}`,
      externalClaimId: simulationId,
      status: "SUBMITTED",
      submittedAt: new Date(),
      claimType: parsed.data.claimType,
      claimantType: parsed.data.claimantType,
      claimantName: parsed.data.claimantType === "SPOUSE" ? member.spouse?.fullName : member.fullName,
      claimantIdType: parsed.data.claimantIdType,
      claimantIdNumber: parsed.data.claimantIdNumber,
      claimantContact: parsed.data.claimantContact,
      incidentDate: dateOfEventFromClaimDetails(parsed.data.claimType, claimDetails),
      claimDetails,
      estimatedAmount: estimate.amount ?? null,
      paymentMethod: parsed.data.paymentMethod,
      paymentDetails: parsed.data.paymentDetails,
      documentIds: uniqueDocumentIds,
      notes: parsed.data.notes || null,
    },
  });
  await recordAudit({ request, actor: user, action: "CLAIM_SIMULATION_SUBMITTED", entityType: "EXTERNAL_CLAIM_SUBMISSION", entityId: claim.id, description: `Submitted simulated ${parsed.data.claimType.toLowerCase().replaceAll("_", " ")} claim for ${member.fullName}`, afterData: { reference: simulationId, claimType: parsed.data.claimType, claimantType: parsed.data.claimantType, estimatedAmount: estimate.amount?.toString() ?? null }, regionId: member.district?.regionId, districtId: member.districtId });
  response.status(201).json({ success: true, data: claim });
});

claimsRouter.patch("/submissions/:id/review", async (request, response) => {
  const params = idSchema.safeParse(request.params);
  const body = reviewSchema.safeParse(request.body);
  if (!params.success || !body.success) {
    response.status(400).json({ success: false, message: "Invalid review request" });
    return;
  }
  const user = response.locals.user as AuthenticatedUser;
  const claim = await prisma.externalClaimSubmission.findFirst({
    where: { id: params.data.id, source: "MEMBER_PORTAL", status: "PENDING", member: { is: memberScope(user) } },
    select: { id: true, claimType: true, memberId: true, member: { select: { fullName: true, districtId: true, district: { select: { regionId: true } } } } },
  });
  if (!claim) {
    response.status(404).json({ success: false, message: "No pending member claim matches that ID" });
    return;
  }

  const { action, note } = body.data;
  const reviewedAt = new Date();
  const data =
    action === "APPROVE"
      ? {
          status: "SUBMITTED" as const,
          submittedAt: reviewedAt,
          externalClaimId: `SIM-${reviewedAt.getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`,
        }
      : action === "RETURN"
        ? { status: "RETURNED" as const, errorMessage: null }
        : { status: "FAILED" as const, errorMessage: note ?? null };

  const updated = await prisma.externalClaimSubmission.update({
    where: { id: claim.id },
    data: { ...data, reviewedById: user.id, reviewNote: note ?? null, reviewedAt },
    select: submissionSelect,
  });
  await recordAudit({
    request,
    actor: user,
    action: `CLAIM_${action}D`,
    entityType: "EXTERNAL_CLAIM_SUBMISSION",
    entityId: claim.id,
    description: `${action === "APPROVE" ? "Approved" : action === "RETURN" ? "Returned" : "Rejected"} a member-submitted ${claim.claimType?.toLowerCase().replaceAll("_", " ")} claim for ${claim.member.fullName}`,
    afterData: { action, note: note ?? null },
    regionId: claim.member.district?.regionId,
    districtId: claim.member.districtId,
  });
  response.json({ success: true, data: updated });
});

claimsRouter.get("/submissions", async (request, response) => {
  const parsed = querySchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ success: false, message: "Invalid request" });
    return;
  }
  const user = response.locals.user as AuthenticatedUser;
  const { page, limit, status, source } = parsed.data;
  const where = {
    member: { is: memberScope(user) },
    ...(status ? { status } : {}),
    ...(source ? { source } : {}),
  };
  const [submissions, total] = await Promise.all([
    prisma.externalClaimSubmission.findMany({
      where,
      select: submissionSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    cachedCount("claims", { scope: { role: user.role, regionId: user.regionId, districtId: user.districtId }, status: parsed.data.status, source: parsed.data.source }, () => prisma.externalClaimSubmission.count({ where })),
  ]);
  response.json({
    success: true,
    data: submissions,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

claimsRouter.get("/submissions/:id", async (request, response) => {
  const params = idSchema.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ success: false, message: "Invalid submission ID" });
    return;
  }
  const user = response.locals.user as AuthenticatedUser;
  const submission = await prisma.externalClaimSubmission.findFirst({
    where: { id: params.data.id, member: { is: memberScope(user) } },
    select: {
      ...submissionSelect,
      claimantType: true,
      claimantIdType: true,
      claimantIdNumber: true,
      claimantContact: true,
      incidentDate: true,
      claimDetails: true,
      paymentMethod: true,
      paymentDetails: true,
      documentIds: true,
      notes: true,
    },
  });
  if (!submission) {
    response.status(404).json({ success: false, message: "Claim submission not found" });
    return;
  }
  const documents = submission.documentIds.length
    ? await prisma.storedFile.findMany({ where: { id: { in: submission.documentIds } }, select: { id: true, slotKey: true, originalName: true, storedName: true } })
    : [];
  response.json({ success: true, data: { ...submission, documents } });
});
