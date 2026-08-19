import { Router, type Response } from "express";

import { prisma } from "../../lib/prisma.js";
import { authenticate, type AuthenticatedUser } from "../../middleware/authenticate.js";
import { authorizeRoles } from "../../middleware/authorize.js";
import { recordAudit } from "../audit/audit.service.js";
import {
  benefitHistoryQuerySchema,
  benefitPlanIdSchema,
  createBenefitPlanSchema,
} from "./benefit.schemas.js";

export const benefitRouter = Router();

const planInclude = {
  benefits: { orderBy: { type: "asc" as const } },
  createdBy: { select: { id: true, fullName: true, email: true } },
} as const;

const benefitTypes = {
  death: "DEATH",
  totalPermanentDisability: "TOTAL_PERMANENT_DISABILITY",
  criticalIllness: "CRITICAL_ILLNESS",
  hospitalization: "HOSPITALIZATION",
} as const;

function currentUser(response: Response) {
  return response.locals.user as AuthenticatedUser;
}

benefitRouter.use(authenticate);

benefitRouter.get("/current", async (_request, response) => {
  const plan = await prisma.benefitPlanVersion.findFirst({
    where: { effectiveFrom: { lte: new Date() } },
    include: planInclude,
    orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
  });
  response.json({ success: true, data: plan });
});

benefitRouter.get("/history", async (request, response) => {
  const query = benefitHistoryQuerySchema.safeParse(request.query);
  if (!query.success) {
    response.status(400).json({ success: false, message: "Invalid query" });
    return;
  }
  const { page, limit } = query.data;
  const [plans, total] = await prisma.$transaction([
    prisma.benefitPlanVersion.findMany({
      include: planInclude,
      orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.benefitPlanVersion.count(),
  ]);
  response.json({
    success: true,
    data: plans,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

benefitRouter.get("/:id", async (request, response) => {
  const params = benefitPlanIdSchema.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ success: false, message: "Invalid benefit plan ID" });
    return;
  }
  const plan = await prisma.benefitPlanVersion.findUnique({
    where: { id: params.data.id },
    include: planInclude,
  });
  if (!plan) {
    response.status(404).json({ success: false, message: "Benefit plan not found" });
    return;
  }
  response.json({ success: true, data: plan });
});

benefitRouter.post(
  "/",
  authorizeRoles("SUPER_ADMIN", "NATIONAL_ADMIN"),
  async (request, response) => {
    const parsed = createBenefitPlanSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        success: false,
        message: "Invalid request",
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
      return;
    }
    const existing = await prisma.benefitPlanVersion.findUnique({
      where: { effectiveFrom: parsed.data.effectiveFrom },
      select: { id: true },
    });
    if (existing) {
      response.status(409).json({
        success: false,
        message: "A benefit plan already exists for this effective date",
        existingPlanId: existing.id,
      });
      return;
    }

    const actor = currentUser(response);
    const plan = await prisma.benefitPlanVersion.create({
      data: {
        effectiveFrom: parsed.data.effectiveFrom,
        monthlyPremium: parsed.data.monthlyPremium,
        collectionMethod: parsed.data.collectionMethod,
        note: parsed.data.note,
        createdById: actor.id,
        benefits: {
          create: Object.entries(parsed.data.benefits).map(([key, benefit]) => ({
            type: benefitTypes[key as keyof typeof benefitTypes],
            enabled: benefit.enabled,
            memberAmount: benefit.memberAmount,
            spouseAmount: benefit.spouseAmount,
          })),
        },
      },
      include: planInclude,
    });
    await recordAudit({
      request,
      actor,
      action: "BENEFIT_PLAN_PUBLISHED",
      entityType: "BENEFIT_PLAN_VERSION",
      entityId: plan.id,
      description: `Published benefit plan effective ${plan.effectiveFrom.toISOString().slice(0, 10)}`,
      afterData: plan,
    });
    response.status(201).json({ success: true, data: plan });
  },
);
