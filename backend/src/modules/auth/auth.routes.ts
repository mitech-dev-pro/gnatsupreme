import argon2 from "argon2";
import { Router, type Request, type Response } from "express";

import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { authenticate } from "../../middleware/authenticate.js";
import { loginSchema } from "./auth.schemas.js";
import {
  createAccessToken,
  createRefreshToken,
  hashRefreshToken,
  refreshTokenExpiresAt,
} from "./auth.tokens.js";

export const authRouter = Router();

const publicUserSelect = {
  id: true,
  fullName: true,
  email: true,
  role: true,
  regionId: true,
  districtId: true,
} as const;

const refreshCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/auth",
};

function setRefreshCookie(response: Response, token: string) {
  response.cookie(env.REFRESH_COOKIE_NAME, token, {
    ...refreshCookieOptions,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1_000,
  });
}

function clientMetadata(request: Request) {
  return {
    userAgent: request.get("user-agent")?.slice(0, 500),
    ipAddress: request.ip?.slice(0, 64),
  };
}

authRouter.post("/login", async (request, response) => {
  const parsed = loginSchema.safeParse(request.body);

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

  try {
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    const passwordMatches = user
      ? await argon2.verify(user.passwordHash, parsed.data.password)
      : false;

    if (!user || !user.isActive || !passwordMatches) {
      response.status(401).json({ success: false, message: "Invalid email or password" });
      return;
    }

    const refreshToken = createRefreshToken();
    await prisma.refreshToken.create({
      data: {
        tokenHash: hashRefreshToken(refreshToken),
        userId: user.id,
        expiresAt: refreshTokenExpiresAt(),
        ...clientMetadata(request),
      },
    });

    setRefreshCookie(response, refreshToken);
    response.status(200).json({
      success: true,
      accessToken: await createAccessToken(user.id),
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        regionId: user.regionId,
        districtId: user.districtId,
      },
    });
  } catch (error) {
    console.error("Login failed:", error);
    response.status(500).json({ success: false, message: "Unable to sign in" });
  }
});

authRouter.post("/refresh", async (request, response) => {
  const currentToken = request.cookies[env.REFRESH_COOKIE_NAME] as string | undefined;

  if (!currentToken) {
    response.status(401).json({ success: false, message: "Refresh session required" });
    return;
  }

  const currentTokenHash = hashRefreshToken(currentToken);

  try {
    const session = await prisma.refreshToken.findUnique({
      where: { tokenHash: currentTokenHash },
      include: { user: { select: { ...publicUserSelect, isActive: true } } },
    });

    if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user.isActive) {
      response.clearCookie(env.REFRESH_COOKIE_NAME, refreshCookieOptions);
      response.status(401).json({ success: false, message: "Refresh session is invalid" });
      return;
    }

    const nextToken = createRefreshToken();
    const rotated = await prisma.$transaction(async (transaction) => {
      const revoked = await transaction.refreshToken.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      if (revoked.count !== 1) return false;

      await transaction.refreshToken.create({
        data: {
          tokenHash: hashRefreshToken(nextToken),
          userId: session.userId,
          expiresAt: refreshTokenExpiresAt(),
          ...clientMetadata(request),
        },
      });
      return true;
    });

    if (!rotated) {
      response.clearCookie(env.REFRESH_COOKIE_NAME, refreshCookieOptions);
      response.status(401).json({ success: false, message: "Refresh session is invalid" });
      return;
    }

    setRefreshCookie(response, nextToken);
    response.status(200).json({
      success: true,
      accessToken: await createAccessToken(session.user.id),
      user: {
        id: session.user.id,
        fullName: session.user.fullName,
        email: session.user.email,
        role: session.user.role,
        regionId: session.user.regionId,
        districtId: session.user.districtId,
      },
    });
  } catch (error) {
    console.error("Token refresh failed:", error);
    response.status(500).json({ success: false, message: "Unable to refresh session" });
  }
});

authRouter.post("/logout", async (request, response) => {
  const token = request.cookies[env.REFRESH_COOKIE_NAME] as string | undefined;

  try {
    if (token) {
      await prisma.refreshToken.updateMany({
        where: { tokenHash: hashRefreshToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    response.clearCookie(env.REFRESH_COOKIE_NAME, refreshCookieOptions);
    response.status(200).json({ success: true, message: "Signed out successfully" });
  } catch (error) {
    console.error("Logout failed:", error);
    response.status(500).json({ success: false, message: "Unable to sign out" });
  }
});

authRouter.get("/me", authenticate, (_request, response) => {
  response.status(200).json({ success: true, user: response.locals.user });
});
