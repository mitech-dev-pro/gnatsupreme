import type { NextFunction, Request, Response } from "express";

import { prisma } from "../lib/prisma.js";
import { memberAuthCacheKey } from "../lib/auth-cache.js";
import { withCache } from "../lib/cache.js";
import { env } from "../config/env.js";
import { verifyMemberAccessToken } from "../modules/member-auth/member-auth.tokens.js";

export type AuthenticatedMember = {
  id: number;
  controllerId: string;
  fullName: string;
  status: "ACTIVE" | "FLAGGED";
};

export async function authenticateMember(request: Request, response: Response, next: NextFunction) {
  const authorization = request.header("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    response.status(401).json({ success: false, message: "Member authentication required" });
    return;
  }
  try {
    const memberId = await verifyMemberAccessToken(authorization.slice(7));
    const member = await withCache(memberAuthCacheKey(memberId), env.AUTH_CACHE_TTL_SECONDS, () =>
      prisma.member.findFirst({
        where: { id: memberId, status: { in: ["ACTIVE", "FLAGGED"] } },
        select: { id: true, controllerId: true, fullName: true, status: true },
      }),
    );
    if (!member || (member.status !== "ACTIVE" && member.status !== "FLAGGED")) throw new Error("Inactive member");
    response.locals.member = {
      ...member,
      status: member.status as "ACTIVE" | "FLAGGED",
    } satisfies AuthenticatedMember;
    next();
  } catch {
    response.status(401).json({ success: false, message: "Member authentication required" });
  }
}
