import type { NextFunction, Request, Response } from "express";

import { prisma } from "../lib/prisma.js";
import { staffAuthCacheKey } from "../lib/auth-cache.js";
import { withCache } from "../lib/cache.js";
import { env } from "../config/env.js";
import { verifyAccessToken } from "../modules/auth/auth.tokens.js";

export type AuthenticatedUser = {
  id: number;
  fullName: string;
  email: string | null;
  setupRequired: boolean;
  role: "SUPER_ADMIN" | "NATIONAL_ADMIN" | "REGIONAL_ADMIN" | "DISTRICT_ADMIN";
  regionIds: number[];
  districtIds: number[];
};

async function loadAuthenticatedUser(authorization: string | undefined) {
  if (!authorization?.startsWith("Bearer ")) return null;
  const userId = await verifyAccessToken(authorization.slice(7));
  return withCache(staffAuthCacheKey(userId), env.AUTH_CACHE_TTL_SECONDS, () =>
    prisma.user.findFirst({
      where: { id: userId, isActive: true },
      select: {
        id: true,
        fullName: true,
        email: true,
        setupRequired: true,
        role: true,
        regionIds: true,
        districtIds: true,
      },
    }),
  );
}

// A phone-only account that hasn't replaced its temp password yet (setupRequired: true) is
// gated off every route except a small allowlist -- GET /auth/me and POST /auth/complete-setup,
// which pass `allowPendingSetup: true` here. This is the actual enforcement; a frontend redirect
// to a setup screen is UX only. No route-path allowlist is needed: every other staff router
// already goes through `authenticate` (the allowPendingSetup: false variant) via its own
// `XRouter.use(authenticate, ...)` call, untouched by this change.
function buildAuthenticate(options: { allowPendingSetup: boolean }) {
  return async function authenticateMiddleware(
    request: Request,
    response: Response,
    next: NextFunction,
  ) {
    try {
      const user = await loadAuthenticatedUser(request.header("authorization"));

      if (!user) {
        response.status(401).json({ success: false, message: "Authentication required" });
        return;
      }

      if (user.setupRequired && !options.allowPendingSetup) {
        response.status(403).json({
          success: false,
          code: "SETUP_REQUIRED",
          message: "Finish setting up your account before continuing.",
        });
        return;
      }

      response.locals.user = user satisfies AuthenticatedUser;
      next();
    } catch {
      response.status(401).json({ success: false, message: "Authentication required" });
    }
  };
}

export const authenticate = buildAuthenticate({ allowPendingSetup: false });
export const authenticateAllowPendingSetup = buildAuthenticate({ allowPendingSetup: true });
