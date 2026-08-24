import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../lib/prisma.js";
import { authenticate, type AuthenticatedUser } from "../../middleware/authenticate.js";
import { memberScope } from "../members/member.access.js";
import { claimsProvider } from "./mankrado.provider.js";

export const claimsRouter = Router();

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z
    .enum(["PENDING", "REDIRECT_READY", "SUBMITTED", "FAILED", "SYNCHRONIZED"])
    .optional(),
});
const idSchema = z.object({ id: z.coerce.number().int().positive() });

claimsRouter.use(authenticate);

claimsRouter.get("/provider", (_request, response) => {
  response.json({
    success: true,
    data: {
      provider: claimsProvider.name,
      mode: claimsProvider.mode,
      configured: claimsProvider.isConfigured(),
      submissionsEnabled: false,
    },
  });
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
  const [submissions, total] = await prisma.$transaction([
    prisma.externalClaimSubmission.findMany({
      where,
      select: {
        id: true,
        externalClaimId: true,
        provider: true,
        status: true,
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
    prisma.externalClaimSubmission.count({ where }),
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
