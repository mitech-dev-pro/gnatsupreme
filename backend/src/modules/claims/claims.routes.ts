import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { prisma } from "../../lib/prisma.js";
import { cachedCount } from "../../lib/cached-count.js";
import { authenticate, type AuthenticatedUser } from "../../middleware/authenticate.js";
import { memberScope } from "../members/member.access.js";
import { claimsProvider } from "./mankrado.provider.js";
import { recordAudit } from "../audit/audit.service.js";
import { getCurrentBenefitPlan } from "../benefits/benefit.service.js";

export const claimsRouter = Router();

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z
    .enum(["PENDING", "REDIRECT_READY", "SUBMITTED", "FAILED", "SYNCHRONIZED"])
    .optional(),
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
const submissionSchema = estimateSchema.extend({
  incidentDate: z.coerce.date().max(new Date(), "Incident date cannot be in the future"),
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

const claimMemberInclude = {
  district: { select: { id: true, name: true, region: { select: { id: true, name: true } } } },
  spouse: { select: { id: true, fullName: true, dateOfBirth: true, ghanaCardId: true } },
  beneficiaries: { select: { id: true, fullName: true, relationship: true, dateOfBirth: true } },
} as const;

async function activeBenefit(claimType: z.infer<typeof estimateSchema>["claimType"], claimantType: "MEMBER" | "SPOUSE") {
  const plan = await getCurrentBenefitPlan();
  const benefit = plan?.benefits.find((item) => item.type === claimType && item.enabled);
  const amount = claimantType === "SPOUSE" ? benefit?.spouseAmount : benefit?.memberAmount;
  return { plan, benefit, amount };
}

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
  if (parsed.data.documentIds.length) {
    const documentCount = await prisma.storedFile.count({ where: { id: { in: parsed.data.documentIds }, memberId: member.id } });
    if (documentCount !== new Set(parsed.data.documentIds).size) {
      response.status(400).json({ success: false, message: "One or more claim documents are invalid" });
      return;
    }
  }
  const estimate = await activeBenefit(parsed.data.claimType, parsed.data.claimantType);
  const simulationId = `SIM-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  const claim = await prisma.externalClaimSubmission.create({
    data: {
      memberId: member.id,
      submittedById: user.id,
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
      incidentDate: parsed.data.incidentDate,
      estimatedAmount: estimate.amount ?? null,
      paymentMethod: parsed.data.paymentMethod,
      paymentDetails: parsed.data.paymentDetails,
      documentIds: [...new Set(parsed.data.documentIds)],
      notes: parsed.data.notes || null,
    },
  });
  await recordAudit({ request, actor: user, action: "CLAIM_SIMULATION_SUBMITTED", entityType: "EXTERNAL_CLAIM_SUBMISSION", entityId: claim.id, description: `Submitted simulated ${parsed.data.claimType.toLowerCase().replaceAll("_", " ")} claim for ${member.fullName}`, afterData: { reference: simulationId, claimType: parsed.data.claimType, claimantType: parsed.data.claimantType, estimatedAmount: estimate.amount?.toString() ?? null }, regionId: member.district?.regionId, districtId: member.districtId });
  response.status(201).json({ success: true, data: claim });
});

claimsRouter.get("/submissions", async (request, response) => {
  const parsed = querySchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ success: false, message: "Invalid request" });
    return;
  }
  const user = response.locals.user as AuthenticatedUser;
  const { page, limit, status } = parsed.data;
  const where = {
    member: { is: memberScope(user) },
    ...(status ? { status } : {}),
  };
  const [submissions, total] = await Promise.all([
    prisma.externalClaimSubmission.findMany({
      where,
      select: {
        id: true,
        externalClaimId: true,
        provider: true,
        status: true,
        claimType: true,
        claimantName: true,
        estimatedAmount: true,
        errorMessage: true,
        submittedAt: true,
        lastSyncedAt: true,
        createdAt: true,
        member: { select: { id: true, controllerId: true, fullName: true } },
        submittedBy: { select: { id: true, fullName: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    cachedCount("claims", { scope: { role: user.role, regionId: user.regionId, districtId: user.districtId }, status: parsed.data.status }, () => prisma.externalClaimSubmission.count({ where })),
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
      id: true,
      externalClaimId: true,
      provider: true,
      status: true,
      claimType: true,
      claimantType: true,
      claimantName: true,
      claimantIdType: true,
      claimantIdNumber: true,
      claimantContact: true,
      incidentDate: true,
      estimatedAmount: true,
      paymentMethod: true,
      paymentDetails: true,
      documentIds: true,
      notes: true,
      errorMessage: true,
      submittedAt: true,
      lastSyncedAt: true,
      createdAt: true,
      member: { select: { id: true, controllerId: true, fullName: true } },
      submittedBy: { select: { id: true, fullName: true } },
    },
  });
  if (!submission) {
    response.status(404).json({ success: false, message: "Claim submission not found" });
    return;
  }
  response.json({ success: true, data: submission });
});
