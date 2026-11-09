import { randomBytes } from "node:crypto";

import argon2 from "argon2";
import { Router, type Request, type Response } from "express";

import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { invalidateStaffAuth } from "../../lib/auth-cache.js";
import { uniqueViolationField, uniqueFieldLabel } from "../../lib/prisma-errors.js";
import {
  assertEmailAvailable,
  invalidatePasswordResetTokens,
  isExpired,
} from "../../lib/account-setup.js";
import {
  authenticate,
  authenticateAllowPendingSetup,
  type AuthenticatedUser,
} from "../../middleware/authenticate.js";
import { requireXhrHeader } from "../../middleware/require-xhr-header.js";
import {
  completeSetupIpRateLimiter,
  completeSetupRateLimiter,
  forgotPasswordRateLimiter,
  loginIdentifierRateLimiter,
  loginRateLimiter,
  refreshRateLimiter,
  setEmailRateLimiter,
} from "../../middleware/rate-limit.js";
import { AppError } from "../../middleware/error-handler.js";
import { sendStaffPasswordResetEmail } from "./auth.profile.js";
import { notifyStaffEmailChanged } from "./auth.service.js";
import {
  completeSetupSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  setEmailSchema,
} from "./auth.schemas.js";
import { recordAudit } from "../audit/audit.service.js";
import {
  createAccessToken,
  createPasswordResetToken,
  createRefreshToken,
  hashPassword,
  hashPasswordResetToken,
  hashRefreshToken,
  passwordResetTokenExpiresAt,
  refreshTokenExpiresAt,
} from "./auth.tokens.js";

export const authRouter = Router();

// A hard lockout independent of (and a backstop under) the per-identifier rate limiter below --
// caps total guesses against one account for its whole life in the setupRequired window, where
// a time-window limiter alone only slows them down. See the simplified-onboarding plan.
const SETUP_LOCKOUT_THRESHOLD = 20;

const publicUserSelect = {
  id: true,
  fullName: true,
  email: true,
  setupRequired: true,
  role: true,
  regionIds: true,
  districtIds: true,
} as const;

const refreshCookieOptions = {
  httpOnly: true,
  // SameSite=None requires Secure regardless of environment -- always true, since a cookie
  // that needs cross-site delivery only makes sense over HTTPS anyway (Chrome exempts
  // http://localhost from the Secure requirement, so local dev is unaffected).
  secure: true,
  // "None", not "Lax" -- the frontend and API are commonly deployed on different registrable
  // domains, and Chrome blocks a Lax Set-Cookie outright when the response is cross-site and
  // isn't a top-level navigation, so Lax silently dropped this cookie in that topology.
  sameSite: "none" as const,
  // Not scoped to "/api/auth" -- that couples the cookie to wherever a given deployment's
  // reverse proxy happens to mount the API, which broke refresh entirely on a deployment whose
  // proxy used a different prefix even though every other (Bearer-token) request worked fine.
  path: "/",
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

// A placeholder hash, verified against on every lookup miss so a nonexistent email/phone still
// pays argon2's cost — without this, response latency alone reveals which staff accounts exist
// (the lookup-miss branch below would otherwise skip argon2.verify entirely).
const DECOY_PASSWORD_HASH = await argon2.hash(randomBytes(32).toString("hex"), {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
});

authRouter.post(
  "/login",
  loginIdentifierRateLimiter,
  loginRateLimiter,
  async (request, response) => {
    const startedAt = Date.now();
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

    // Floors every response (success or failure) to the same minimum latency, so timing alone
    // can't distinguish "no such account" from "wrong password" from "locked" from "signed in"
    // — see DECOY_PASSWORD_HASH above for the matching argon2-cost equalization. One shared path
    // for both identifiers and every account state below.
    const pad = async () => {
      const remaining = 300 - (Date.now() - startedAt);
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
    };

    try {
      let user = parsed.data.email
        ? await prisma.user.findUnique({
            where: { email: parsed.data.email },
            omit: { passwordHash: false },
          })
        : await prisma.user.findFirst({
            where: { phone: parsed.data.phone ?? "__invalid__" },
            omit: { passwordHash: false },
          });

      // A still-temp password (setupRequired) expires after TEMP_PASSWORD_TTL_DAYS unclaimed --
      // closes the account to login exactly like a lookup miss. The decoy-hash verify below
      // still runs regardless, so expiry state is never observable via timing.
      if (user?.setupRequired && isExpired(user.tempPasswordExpiresAt)) user = null;

      // Hard lockout: once a setupRequired account has racked up SETUP_LOCKOUT_THRESHOLD failed
      // attempts, login is rejected outright regardless of the password supplied -- still runs
      // argon2.verify below for timing safety, just never lets the result count as a match.
      const locked = Boolean(
        user?.setupRequired && user.setupFailedAttempts >= SETUP_LOCKOUT_THRESHOLD,
      );

      const identifier = parsed.data.email ?? parsed.data.phone ?? "";
      const verified = await argon2.verify(
        user?.passwordHash ?? DECOY_PASSWORD_HASH,
        parsed.data.password,
      );
      const passwordMatches = verified && !locked;

      if (!user || !user.isActive || !passwordMatches) {
        if (user?.setupRequired) {
          await prisma.user.update({
            where: { id: user.id },
            data: { setupFailedAttempts: { increment: 1 } },
          });
        }
        await recordAudit({
          request,
          actorEmail: parsed.data.email ?? null,
          action: "LOGIN_FAILED",
          entityType: "AUTH",
          description: `Failed login attempt for ${identifier}`,
        });
        await pad();
        response.status(401).json({ success: false, message: "Invalid credentials" });
        return;
      }

      if (user.setupFailedAttempts > 0) {
        await prisma.user.update({ where: { id: user.id }, data: { setupFailedAttempts: 0 } });
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
      await recordAudit({
        request,
        actor: user,
        action: "LOGIN_SUCCEEDED",
        entityType: "USER",
        entityId: user.id,
        description: `${user.fullName} signed in`,
      });
      await pad();
      response.status(200).json({
        success: true,
        accessToken: await createAccessToken(user.id),
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          setupRequired: user.setupRequired,
          role: user.role,
          regionIds: user.regionIds,
          districtIds: user.districtIds,
        },
      });
    } catch (error) {
      logger.error({ err: error }, "Staff login failed");
      response.status(500).json({ success: false, message: "Unable to sign in" });
    }
  },
);

authRouter.post("/forgot-password", forgotPasswordRateLimiter, async (request, response) => {
  const startedAt = Date.now();
  const parsed = forgotPasswordSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ success: false, message: "Enter a valid email address" });
    return;
  }
  const user = await prisma.user.findFirst({
    where: { email: parsed.data.email, isActive: true },
    select: { id: true, email: true },
  });
  // Always the same response regardless of whether the account exists or is active --
  // otherwise this endpoint could be used to enumerate valid staff emails. Padded to a floor
  // below, and the email itself is never awaited (an SMTP round trip is both much slower than
  // that floor and would turn a provider rejection into a request failure here). A phone-only
  // account with no email has email: null, so it can never match the where clause above and
  // this path is already safe for it without any extra guard.
  if (user?.email) {
    const token = createPasswordResetToken();
    await prisma.userPasswordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashPasswordResetToken(token),
        expiresAt: passwordResetTokenExpiresAt(),
        ipAddress: request.ip?.slice(0, 64),
      },
    });
    // The shared /reset-password page also serves member reset links (same token shape,
    // same URL path) -- audience=staff is how it knows which backend endpoint to call.
    const resetUrl = `${env.FRONTEND_ORIGIN}/reset-password?token=${token}&audience=staff`;
    sendStaffPasswordResetEmail(user.email, resetUrl).catch((error: unknown) => {
      logger.error({ err: error, userId: user.id }, "Failed to send staff password reset email");
    });
  }
  const remaining = 200 - (Date.now() - startedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  response.json({
    success: true,
    message:
      "If an account exists for that email, password reset instructions have been sent to it.",
  });
});

authRouter.post("/reset-password", async (request, response) => {
  const parsed = resetPasswordSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ success: false, message: "Enter a valid password" });
    return;
  }
  const invalidToken = () =>
    response
      .status(401)
      .json({ success: false, message: "This reset link is invalid or has expired" });

  const resetToken = await prisma.userPasswordResetToken.findUnique({
    where: { tokenHash: hashPasswordResetToken(parsed.data.token) },
    include: { user: { select: { id: true, fullName: true, isActive: true } } },
  });
  if (
    !resetToken ||
    resetToken.consumedAt ||
    resetToken.expiresAt <= new Date() ||
    !resetToken.user.isActive
  ) {
    invalidToken();
    return;
  }

  const consumed = await prisma.$transaction(async (transaction) => {
    const result = await transaction.userPasswordResetToken.updateMany({
      where: { id: resetToken.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (result.count !== 1) return false;
    await transaction.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash: await hashPassword(parsed.data.password) },
    });
    // Same rationale as member-auth's /reset-password -- a password reset invalidates every
    // existing session, on any device, since the previous password may be what got compromised.
    await transaction.refreshToken.updateMany({
      where: { userId: resetToken.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return true;
  });
  if (!consumed) {
    invalidToken();
    return;
  }

  await invalidateStaffAuth(resetToken.userId);
  await recordAudit({
    request,
    action: "USER_PASSWORD_RESET_SELF_SERVICE",
    entityType: "USER",
    entityId: resetToken.user.id,
    description: `${resetToken.user.fullName} reset their password via email link`,
  });
  response.json({ success: true, message: "Password updated. You can now sign in." });
});

authRouter.post("/refresh", refreshRateLimiter, requireXhrHeader, async (request, response) => {
  const currentToken = request.cookies[env.REFRESH_COOKIE_NAME] as string | undefined;

  if (!currentToken) {
    response.status(401).json({ success: false, message: "Refresh session required" });
    return;
  }

  const currentTokenHash = hashRefreshToken(currentToken);

  try {
    const session = await prisma.refreshToken.findUnique({
      where: { tokenHash: currentTokenHash },
      include: {
        user: { select: { ...publicUserSelect, isActive: true, tempPasswordExpiresAt: true } },
      },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !session.user.isActive
    ) {
      response.clearCookie(env.REFRESH_COOKIE_NAME, refreshCookieOptions);
      response.status(401).json({ success: false, message: "Refresh session is invalid" });
      return;
    }

    // /refresh is a second path into a live session, not just login -- refresh tokens rotate to
    // a brand-new full TTL on every call (see refreshTokenExpiresAt), so without this check a
    // session could slide forever past an account's own expiry. This is a backstop, not the
    // primary defense -- the primary defense is that every write extending an expiry window also
    // revokes every refresh token for that user. Revoking the one token presented here still
    // matters: it kills the specific token that gets caught actively trying to refresh past
    // expiry, immediately, rather than leaving it live until some later write happens to sweep it
    // up.
    if (session.user.setupRequired && isExpired(session.user.tempPasswordExpiresAt)) {
      await prisma.refreshToken.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
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
    await recordAudit({
      request,
      actor: session.user,
      action: "SESSION_REFRESHED",
      entityType: "USER",
      entityId: session.user.id,
      description: `${session.user.fullName} refreshed a session`,
    });
    response.status(200).json({
      success: true,
      accessToken: await createAccessToken(session.user.id),
      user: {
        id: session.user.id,
        fullName: session.user.fullName,
        email: session.user.email,
        setupRequired: session.user.setupRequired,
        role: session.user.role,
        regionIds: session.user.regionIds,
        districtIds: session.user.districtIds,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Staff token refresh failed");
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
    await recordAudit({
      request,
      action: "LOGOUT",
      entityType: "AUTH",
      description: "A refresh session was signed out",
    });
    response.status(200).json({ success: true, message: "Signed out successfully" });
  } catch (error) {
    logger.error({ err: error }, "Staff logout failed");
    response.status(500).json({ success: false, message: "Unable to sign out" });
  }
});

authRouter.get("/me", authenticateAllowPendingSetup, (_request, response) => {
  response.status(200).json({ success: true, user: response.locals.user });
});

// Reachable only while setupRequired is true -- password-only, no email field at all. See the
// simplified-onboarding plan (this replaces the old S0/S0p/S1/S2a/S2 model entirely).
authRouter.post(
  "/complete-setup",
  authenticateAllowPendingSetup,
  completeSetupRateLimiter,
  completeSetupIpRateLimiter,
  async (request, response) => {
    const actor = response.locals.user as AuthenticatedUser;

    if (!actor.setupRequired) {
      response.status(403).json({ success: false, message: "Your account is already set up." });
      return;
    }

    const parsed = completeSetupSchema.safeParse(request.body);
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

    const dbUser = await prisma.user.findUnique({
      where: { id: actor.id },
      omit: { passwordHash: false },
    });
    if (!dbUser || !dbUser.isActive) {
      response.status(401).json({ success: false, message: "Authentication required" });
      return;
    }
    const currentMatches = await argon2.verify(dbUser.passwordHash, parsed.data.currentPassword);
    if (!currentMatches) {
      response.status(401).json({ success: false, message: "Current password is incorrect" });
      return;
    }

    const newRefreshToken = createRefreshToken();
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: actor.id },
        data: {
          passwordHash: await hashPassword(parsed.data.newPassword),
          setupRequired: false,
          tempPasswordExpiresAt: null,
          setupFailedAttempts: 0,
        },
      });
      await tx.refreshToken.updateMany({
        where: { userId: actor.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.refreshToken.create({
        data: {
          tokenHash: hashRefreshToken(newRefreshToken),
          userId: actor.id,
          expiresAt: refreshTokenExpiresAt(),
          ...clientMetadata(request),
        },
      });
    });

    await invalidateStaffAuth(actor.id);
    await recordAudit({
      request,
      actor,
      action: "USER_SETUP_COMPLETED",
      entityType: "USER",
      entityId: actor.id,
      description: `${actor.fullName} completed account setup`,
    });

    setRefreshCookie(response, newRefreshToken);
    const updated = await prisma.user.findUniqueOrThrow({
      where: { id: actor.id },
      select: publicUserSelect,
    });
    response.json({
      success: true,
      accessToken: await createAccessToken(actor.id),
      user: updated,
    });
  },
);

// Self-service, re-usable (not one-shot-while-null) -- fills a missing email or changes an
// already-set one, immediately and without a confirmation step. See the simplified-onboarding
// plan: there is no "pending" concept anymore. Reachable via the normal authenticate (not the
// pending-setup bypass) -- by the time anyone uses this, setupRequired is already false.
authRouter.post("/set-email", authenticate, setEmailRateLimiter, async (request, response) => {
  const actor = response.locals.user as AuthenticatedUser;

  const parsed = setEmailSchema.safeParse(request.body);
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

  const dbUser = await prisma.user.findUnique({
    where: { id: actor.id },
    omit: { passwordHash: false },
  });
  if (!dbUser || !dbUser.isActive) {
    response.status(401).json({ success: false, message: "Authentication required" });
    return;
  }
  const currentMatches = await argon2.verify(dbUser.passwordHash, parsed.data.currentPassword);
  if (!currentMatches) {
    response.status(401).json({ success: false, message: "Current password is incorrect" });
    return;
  }

  const previousEmail = dbUser.email;

  try {
    await prisma.$transaction(async (tx) => {
      await assertEmailAvailable(tx, parsed.data.email, { excludeUserId: actor.id });
      await tx.user.update({ where: { id: actor.id }, data: { email: parsed.data.email } });
      // An unconsumed reset link already sent to the OLD address must stop working the
      // instant the email changes, or whoever controls that old address can reset the
      // password straight back. No-op (and harmless) on a first-set, since there's nothing
      // to invalidate yet.
      if (previousEmail) await invalidatePasswordResetTokens(tx, actor.id);
    });
  } catch (error) {
    if (error instanceof AppError) {
      response
        .status(error.statusCode)
        .json({ success: false, message: error.message, code: error.code });
      return;
    }
    const field = uniqueViolationField(error);
    if (field) {
      response
        .status(409)
        .json({ success: false, message: `${uniqueFieldLabel(field)} is already in use` });
      return;
    }
    throw error;
  }

  await invalidateStaffAuth(actor.id);
  if (previousEmail) notifyStaffEmailChanged(actor.id, previousEmail, parsed.data.email);
  await recordAudit({
    request,
    actor,
    action: "USER_EMAIL_SET",
    entityType: "USER",
    entityId: actor.id,
    description: `${actor.fullName} ${previousEmail ? "changed" : "set"} their login email`,
    beforeData: { email: previousEmail },
    afterData: { email: parsed.data.email },
  });

  const updated = await prisma.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: publicUserSelect,
  });
  response.json({ success: true, user: updated });
});
