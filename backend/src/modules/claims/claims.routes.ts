import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../lib/prisma.js";
import { cachedCount } from "../../lib/cached-count.js";
import { authenticate, type AuthenticatedUser } from "../../middleware/authenticate.js";
import { memberScope } from "../members/member.access.js";
import { ClaimDocumentError, loadClaimDocuments } from "./claims.documents.js";
import { deliverClaim, expireStaleDeliveries } from "./claims.delivery.js";
import { ClaimsProviderUnavailableError } from "./claims.provider.js";
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
  paymentMethod: z.literal("CHEQUE"),
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

async function activeBenefit(claimType: z.infer<typeof estimateSchema>["claimType"], claimantType: "MEMBER" | "SPOUSE") {
  const plan = await getCurrentBenefitPlan();
  const benefit = plan?.benefits.find((item) => item.type === claimType && item.enabled);
  const amount = claimantType === "SPOUSE" ? benefit?.spouseAmount : benefit?.memberAmount;
  return { plan, benefit, amount };
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
  deliveryState: true,
  externalStatus: true,
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
      submissionsEnabled: claimsProvider.isConfigured(),
      simulation: false,
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
    select: { id: true, spouse: { select: { id: true } } },
  });
  if (!member || (parsed.data.claimantType === "SPOUSE" && !member.spouse)) {
    response.status(404).json({ success: false, message: "Covered person not found" });
    return;
  }
  const estimate = await activeBenefit(parsed.data.claimType, parsed.data.claimantType);
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
    select: { id: true, controllerId: true, fullName: true, districtId: true, district: { select: { regionId: true } }, spouse: { select: { id: true, fullName: true } } },
  });
  if (!member || (parsed.data.claimantType === "SPOUSE" && !member.spouse)) {
    response.status(404).json({ success: false, message: "Member or covered person was not found" });
    return;
  }
  const requiredPaymentFields: Record<string, string[]> = {
    CHEQUE: ["payeeName"],
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

  const estimate = await activeBenefit(parsed.data.claimType, parsed.data.claimantType);
  if (!claimsProvider.isConfigured()) {
    response.status(503).json({ success: false, message: "Mankrado submissions are not configured." }); return;
  }
  try { await loadClaimDocuments(parsed.data.claimType, uniqueDocumentIds, member.id); }
  catch (error) { if (!(error instanceof ClaimDocumentError)) throw error; response.status(400).json({ success: false, message: error.message }); return; }
  const token = z.string().uuid().safeParse(request.get("Idempotency-Key"));
  if (!token.success) { response.status(400).json({ success: false, message: "Provide a UUID Idempotency-Key header." }); return; }
  const idempotencyKey = `staff:${user.id}:${token.data}`;
  const claimDetails =
    parsed.data.claimType === "HOSPITALIZATION"
      ? { ...parsed.data.claimDetails, nights: nightsBetween(parsed.data.claimDetails.admissionDate, parsed.data.claimDetails.dischargeDate) }
      : parsed.data.claimDetails;
  const claim = await prisma.externalClaimSubmission.upsert({
    where: { idempotencyKey },
    update: {},
    create: {
      memberId: member.id,
      submittedById: user.id,
      source: "STAFF",
      provider: "MANKRADO",
      idempotencyKey,
      status: "PENDING",
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
  if (claim.memberId !== member.id) { response.status(409).json({ success: false, message: "This submission key belongs to another claim." }); return; }
  const delivered = await deliverClaim(claim.id);
  await recordAudit({ request, actor: user, action: "CLAIM_DELIVERY_RECORDED", entityType: "EXTERNAL_CLAIM_SUBMISSION", entityId: claim.id,
    description: "Recorded Mankrado claim delivery outcome", afterData: { deliveryState: delivered.deliveryState }, regionId: member.district?.regionId, districtId: member.districtId });
  response.status(delivered.deliveryState === "ACCEPTED" ? 201 : 202).json({ success: true, data: delivered });
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
  if (action === "APPROVE") {
    const record = await prisma.externalClaimSubmission.findUniqueOrThrow({ where: { id: claim.id } });
    if (record.provider !== "MANKRADO") { response.status(409).json({ success: false, message: "Historical simulated claims cannot be sent to Mankrado. File a new claim." }); return; }
    if (!claimsProvider.isConfigured()) { response.status(503).json({ success: false, message: "Mankrado submissions are not configured." }); return; }
    try { await loadClaimDocuments(record.claimType!, record.documentIds, record.memberId, record.submittedByMemberId ?? undefined); }
    catch (error) { if (!(error instanceof ClaimDocumentError)) throw error; response.status(400).json({ success: false, message: error.message }); return; }
  }
  const changed = await prisma.externalClaimSubmission.updateMany({
    where: { id: claim.id, status: "PENDING", reviewedAt: null, deliveryState: "NOT_SENT" },
    data: { status: action === "RETURN" ? "RETURNED" : action === "REJECT" ? "FAILED" : "PENDING",
      reviewedById: user.id, reviewNote: note ?? null, reviewedAt, errorMessage: action === "REJECT" ? note : null },
  });
  if (!changed.count) { response.status(409).json({ success: false, message: "This claim has already been reviewed. Refresh to see its status." }); return; }
  if (action === "APPROVE") await deliverClaim(claim.id);
  const updated = await prisma.externalClaimSubmission.findUniqueOrThrow({ where: { id: claim.id }, select: submissionSelect });
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

// Recovery only for saved claims for which no external attempt has started.
claimsRouter.post("/submissions/:id/send", async (request, response) => {
  const params = idSchema.safeParse(request.params);
  if (!params.success) { response.status(400).json({ success: false, message: "Invalid claim ID" }); return; }
  const user = response.locals.user as AuthenticatedUser;
  const claim = await prisma.externalClaimSubmission.findFirst({ where: {
    id: params.data.id, provider: "MANKRADO", status: "PENDING", deliveryState: "NOT_SENT",
    member: { is: memberScope(user) }, OR: [{ source: "STAFF" }, { source: "MEMBER_PORTAL", reviewedAt: { not: null } }],
  }, select: { id: true } });
  if (!claim) { response.status(409).json({ success: false, message: "No accessible unsent claim is ready for delivery. Refresh its status." }); return; }
  if (!claimsProvider.isConfigured()) { response.status(503).json({ success: false, message: "Mankrado submissions are not configured." }); return; }
  const delivered = await deliverClaim(claim.id);
  await recordAudit({ request, actor: user, action: "CLAIM_DELIVERY_RECORDED", entityType: "EXTERNAL_CLAIM_SUBMISSION", entityId: claim.id,
    description: "Recorded delivery of a previously unsent claim", afterData: { deliveryState: delivered.deliveryState } });
  response.json({ success: true, data: delivered });
});

claimsRouter.get("/submissions", async (request, response) => {
  await expireStaleDeliveries();
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
  await expireStaleDeliveries();
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

// Proxy reads are scoped to locally accessible members before any external request.
claimsRouter.get("/history/:staffId", async (request, response) => {
  const parsed = lookupSchema.safeParse({ staffId: request.params.staffId });
  if (!parsed.success) { response.status(400).json({ success: false, message: "Invalid Staff ID" }); return; }
  const user = response.locals.user as AuthenticatedUser;
  const member = await prisma.member.findFirst({ where: { controllerId: parsed.data.staffId, ...memberScope(user) }, select: { id: true } });
  if (!member) { response.status(404).json({ success: false, message: "Member not found" }); return; }
  try {
    const history = await claimsProvider.history(parsed.data.staffId);
    if (history.some((item) => item.staffId && item.staffId !== parsed.data.staffId)) throw new Error("History member mismatch");
    response.json({ success: true, data: history });
  } catch (error) { response.status(error instanceof ClaimsProviderUnavailableError ? 503 : 502).json({ success: false, message: "Mankrado history is unavailable. Local claims remain saved." }); }
});

claimsRouter.get("/claimdetails/:externalId", async (request, response) => {
  const externalId = z.string().trim().min(1).max(200).safeParse(request.params.externalId);
  if (!externalId.success) { response.status(400).json({ success: false, message: "Invalid claim reference" }); return; }
  const user = response.locals.user as AuthenticatedUser;
  const claim = await prisma.externalClaimSubmission.findFirst({ where: { externalClaimId: externalId.data, provider: "MANKRADO", member: { is: memberScope(user) } }, select: { id: true, member: { select: { controllerId: true } } } });
  if (!claim) { response.status(404).json({ success: false, message: "Claim not found" }); return; }
  try {
    const details = await claimsProvider.details(externalId.data);
    if (details.id !== externalId.data || (details.staffId && details.staffId !== claim.member.controllerId)) throw new Error("Claim mismatch");
    await prisma.externalClaimSubmission.update({ where: { id: claim.id }, data: { externalStatus: details.status, lastSyncedAt: new Date() } });
    response.json({ success: true, data: details });
  } catch (error) { response.status(error instanceof ClaimsProviderUnavailableError ? 503 : 502).json({ success: false, message: "Mankrado claim details are unavailable. Local details remain saved." }); }
});
