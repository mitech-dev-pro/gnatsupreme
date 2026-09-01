import type { NextFunction, Request, Response } from "express";

import { prisma } from "../lib/prisma.js";
import { staffAuthCacheKey } from "../lib/auth-cache.js";
import { withCache } from "../lib/cache.js";
import { env } from "../config/env.js";
import { verifyAccessToken } from "../modules/auth/auth.tokens.js";

export type AuthenticatedUser = {
  id: number;
  fullName: string;
  email: string;
  role: "SUPER_ADMIN" | "NATIONAL_ADMIN" | "REGIONAL_ADMIN" | "DISTRICT_ADMIN";
  regionId: number | null;
  districtId: number | null;
};

export async function authenticate(request: Request, response: Response, next: NextFunction) {
  const authorization = request.header("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    response.status(401).json({ success: false, message: "Authentication required" });
    return;
  }

  try {
    const userId = await verifyAccessToken(authorization.slice(7));
    const user = await withCache(staffAuthCacheKey(userId), env.AUTH_CACHE_TTL_SECONDS, () =>
      prisma.user.findFirst({
        where: { id: userId, isActive: true },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          regionId: true,
          districtId: true,
        },
      }),
    );

    if (!user) {
      response.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    response.locals.user = user satisfies AuthenticatedUser;
    next();
  } catch {
    response.status(401).json({ success: false, message: "Authentication required" });
  }
}


//this middleware function checks if the user is authenticated by verifying the access token provided in the "Authorization" header. If the token is valid and corresponds to an active user, it attaches the user information to `response.locals.user` and calls the next middleware function. If the token is invalid or the user is not found, it returns a 401 Unauthorized response.
