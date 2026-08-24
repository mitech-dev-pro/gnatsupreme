import { Router, type Request, type Response } from "express";

import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { authenticateMember } from "../../middleware/authenticate-member.js";
import {
  memberForgotPasswordRateLimiter,
  memberLoginIpRateLimiter,
  memberLoginRateLimiter,
  memberLookupIpRateLimiter,
  memberLookupRateLimiter,
  memberSetupRateLimiter,
  refreshRateLimiter,
} from "../../middleware/rate-limit.js";
import { recordAudit } from "../audit/audit.service.js";
import {
  forgotPasswordSchema,
  loginSchema,
  memberLookupSchema,
  resetPasswordSchema,
  setupAccountSchema,
} from "./member-auth.schemas.js";
import {
  createMemberAccessToken,
  createMemberRefreshToken,
  createPasswordResetToken,
  hashMemberPassword,
  hashMemberRefreshToken,
  hashPasswordResetToken,
  memberNameMatches,
  memberSessionExpiresAt,
  passwordResetTokenExpiresAt,
  verifyMemberPassword,
} from "./member-auth.tokens.js";

export const memberAuthRouter = Router();

const memberCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/member-auth",
};

function setMemberCookie(response: Response, token: string) {
  response.cookie(env.MEMBER_REFRESH_COOKIE_NAME, token, {
    ...memberCookieOptions,
    maxAge: env.MEMBER_SESSION_TTL_DAYS * 24 * 60 * 60 * 1_000,
  });
}

function metadata(request: Request) {
  return {
    userAgent: request.get("user-agent")?.slice(0, 500),
    ipAddress: request.ip?.slice(0, 64),
  };
}

function publicMember(member: {
  id: number;
  controllerId: string;
  fullName: string;
  status: string;
}) {
  return {
    id: member.id,
    controllerId: member.controllerId,
    fullName: member.fullName,
    status: member.status,
  };
}

// No email-sending provider is wired up yet — this stands in for it so the reset flow is fully
// built and testable end-to-end (the token, expiry, and consumption logic below don't change once
// a real provider is added), without blocking on picking/configuring one now. Swap the body for a
// real send when that's ready; nothing else in this route needs to change.
async function sendPasswordResetEmail(email: string, resetUrl: string) {
  logger.info({ email, resetUrl }, "[stub] Would send member password reset email");
}

async function createSession(request: Request, memberId: number) {
  const refreshToken = createMemberRefreshToken();
  await prisma.memberSession.create({
    data: {
      tokenHash: hashMemberRefreshToken(refreshToken),
      memberId,
      expiresAt: memberSessionExpiresAt(),
      ...metadata(request),
    },
  });
  return refreshToken;
}

memberAuthRouter.get("/districts", async (_request, response) => {
  const districts = await prisma.district.findMany({
    select: { id: true, name: true, region: { select: { name: true } } },
    orderBy: [{ region: { name: "asc" } }, { name: "asc" }],
  });
  response.json({ success: true, data: districts });
});

memberAuthRouter.post(
  "/login",
  memberLoginIpRateLimiter,
  memberLoginRateLimiter,
  async (request, response) => {
    const startedAt = Date.now();
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      response
        .status(400)
        .json({ success: false, message: "Enter a Controller ID and password" });
      return;
    }
    const pad = async () => {
      const remaining = 300 - (Date.now() - startedAt);
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
    };
    const invalidCredentials = async () => {
      await pad();
      response.status(401).json({
        success: false,
        message: "Incorrect Controller ID or password",
      });
    };

    // Looked up unconditionally (no status filter) so a genuine member in a bad state gets a
    // specific, actionable message below — only "wrong Controller ID or password" stays ambiguous,
    // to avoid letting the endpoint enumerate valid Controller IDs.
    const member = await prisma.member.findFirst({
      where: { controllerId: parsed.data.controllerId },
      select: {
        id: true,
        controllerId: true,
        fullName: true,
        status: true,
        passwordHash: true,
      },
    });
    if (!member) {
      await invalidCredentials();
      return;
    }
    if (!["ACTIVE", "FLAGGED"].includes(member.status)) {
      await pad();
      response.status(403).json({
        success: false,
        message:
          member.status === "INACTIVE"
            ? "This membership is currently inactive because it wasn't found in the latest payroll file. Please contact your local district office if this is incorrect."
            : "This membership is not active yet. Please contact your local district office for help.",
      });
      return;
    }
    if (!member.passwordHash) {
      await pad();
      response.status(403).json({
        success: false,
        code: "SETUP_REQUIRED",
        message: "Set up your account to continue.",
      });
      return;
    }
    if (!(await verifyMemberPassword(member.passwordHash, parsed.data.password))) {
      await invalidCredentials();
      return;
    }

    const refreshToken = await createSession(request, member.id);
    setMemberCookie(response, refreshToken);
    await recordAudit({
      request,
      action: "MEMBER_LOGIN_SUCCEEDED",
      entityType: "MEMBER",
      entityId: member.id,
      description: `Member ${member.controllerId} signed in`,
    });
    await pad();
    response.json({
      success: true,
      accessToken: await createMemberAccessToken(member.id),
      member: publicMember(member),
    });
  },
);

memberAuthRouter.post(
  "/lookup",
  memberLookupIpRateLimiter,
  memberLookupRateLimiter,
  async (request, response) => {
    const parsed = memberLookupSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ success: false, message: "Enter a valid Controller ID" });
      return;
    }
    const genericFailure = () =>
      response.status(404).json({
        success: false,
        message:
          "We couldn't find a membership with that Controller ID to set up. Please check the number, or contact your local district office for help.",
      });

    const member = await prisma.member.findFirst({
      where: { controllerId: parsed.data.controllerId },
      select: { id: true, controllerId: true, fullName: true, status: true, passwordHash: true },
    });
    if (!member || !["ACTIVE", "FLAGGED"].includes(member.status)) {
      genericFailure();
      return;
    }
    if (member.passwordHash) {
      response.status(409).json({
        success: false,
        message: "This membership already has a password set. Sign in, or use \"Forgot password?\" instead.",
      });
      return;
    }

    await recordAudit({
      request,
      action: "MEMBER_SETUP_LOOKUP",
      entityType: "MEMBER",
      entityId: member.id,
      description: `Controller ID ${member.controllerId} was resolved for first-time account setup`,
    });
    response.json({ success: true, data: { fullName: member.fullName } });
  },
);

memberAuthRouter.post(
  "/setup-account",
  memberSetupRateLimiter,
  async (request, response) => {
    const parsed = setupAccountSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ success: false, message: "Enter valid details to continue" });
      return;
    }
    const genericFailure = () =>
      response.status(401).json({
        success: false,
        message:
          "We couldn't verify those details. Please check your Controller ID and name, or contact your local district office for help.",
      });

    const member = await prisma.member.findFirst({
      where: { controllerId: parsed.data.controllerId },
      select: {
        id: true,
        controllerId: true,
        fullName: true,
        status: true,
        districtId: true,
        passwordHash: true,
      },
    });
    if (!member || !["ACTIVE", "FLAGGED"].includes(member.status)) {
      genericFailure();
      return;
    }
    if (member.passwordHash) {
      response.status(409).json({
        success: false,
        message: "This membership already has a password set. Sign in, or use \"Forgot password?\" instead.",
      });
      return;
    }
    if (!memberNameMatches(member.fullName, parsed.data.fullName)) {
      genericFailure();
      return;
    }

    const duplicateEmail = await prisma.member.findUnique({ where: { email: parsed.data.email } });
    if (duplicateEmail) {
      response.status(409).json({
        success: false,
        message: "This email is already registered to another membership.",
      });
      return;
    }

    await prisma.member.update({
      where: { id: member.id },
      data: {
        email: parsed.data.email,
        passwordHash: await hashMemberPassword(parsed.data.password),
        ...(!member.districtId && parsed.data.districtId ? { districtId: parsed.data.districtId } : {}),
      },
    });
    await recordAudit({
      request,
      action: "MEMBER_ACCOUNT_SETUP",
      entityType: "MEMBER",
      entityId: member.id,
      description: `Member ${member.controllerId} completed first-login account setup`,
      districtId: member.districtId,
    });

    const refreshToken = await createSession(request, member.id);
    setMemberCookie(response, refreshToken);
    response.json({
      success: true,
      accessToken: await createMemberAccessToken(member.id),
      member: publicMember(member),
    });
  },
);

memberAuthRouter.post(
  "/forgot-password",
  memberForgotPasswordRateLimiter,
  async (request, response) => {
    const parsed = forgotPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ success: false, message: "Enter a valid Controller ID" });
      return;
    }
    const member = await prisma.member.findFirst({
      where: { controllerId: parsed.data.controllerId, status: { in: ["ACTIVE", "FLAGGED"] } },
      select: { id: true, email: true },
    });
    // Always the same response regardless of whether the membership exists, is active, or has an
    // email on file — otherwise this endpoint could be used to enumerate valid Controller IDs or
    // find out who has an email registered.
    if (member?.email) {
      const token = createPasswordResetToken();
      await prisma.memberPasswordResetToken.create({
        data: {
          memberId: member.id,
          tokenHash: hashPasswordResetToken(token),
          expiresAt: passwordResetTokenExpiresAt(),
          ipAddress: request.ip?.slice(0, 64),
        },
      });
      const resetUrl = `${env.FRONTEND_ORIGIN}/reset-password?token=${token}`;
      await sendPasswordResetEmail(member.email, resetUrl);
    }
    response.json({
      success: true,
      message:
        "If this membership has an email on file, password reset instructions have been sent to it. Otherwise, contact your local district office for help.",
    });
  },
);

memberAuthRouter.post("/reset-password", async (request, response) => {
  const parsed = resetPasswordSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ success: false, message: "Enter a valid password" });
    return;
  }
  const invalidToken = () =>
    response
      .status(401)
      .json({ success: false, message: "This reset link is invalid or has expired" });

  const resetToken = await prisma.memberPasswordResetToken.findUnique({
    where: { tokenHash: hashPasswordResetToken(parsed.data.token) },
    include: { member: { select: { id: true, controllerId: true, status: true } } },
  });
  if (
    !resetToken ||
    resetToken.consumedAt ||
    resetToken.expiresAt <= new Date() ||
    !["ACTIVE", "FLAGGED"].includes(resetToken.member.status)
  ) {
    invalidToken();
    return;
  }

  const consumed = await prisma.$transaction(async (transaction) => {
    const result = await transaction.memberPasswordResetToken.updateMany({
      where: { id: resetToken.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (result.count !== 1) return false;
    await transaction.member.update({
      where: { id: resetToken.memberId },
      data: { passwordHash: await hashMemberPassword(parsed.data.password) },
    });
    // A password reset invalidates every existing session, on any device — standard practice, and
    // important here specifically because the previous password may be what got compromised.
    await transaction.memberSession.updateMany({
      where: { memberId: resetToken.memberId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return true;
  });
  if (!consumed) {
    invalidToken();
    return;
  }

  await recordAudit({
    request,
    action: "MEMBER_PASSWORD_RESET_SELF_SERVICE",
    entityType: "MEMBER",
    entityId: resetToken.member.id,
    description: `Member ${resetToken.member.controllerId} reset their password via email link`,
  });
  response.json({ success: true, message: "Password updated. You can now sign in." });
});

memberAuthRouter.post(
  "/refresh",
  refreshRateLimiter,
  async (request, response) => {
    const token = request.cookies[env.MEMBER_REFRESH_COOKIE_NAME] as
      | string
      | undefined;
    if (!token) {
      response
        .status(401)
        .json({ success: false, message: "Member refresh session required" });
      return;
    }
    const session = await prisma.memberSession.findUnique({
      where: { tokenHash: hashMemberRefreshToken(token) },
      include: {
        member: {
          select: {
            id: true,
            controllerId: true,
            fullName: true,
            status: true,
          },
        },
      },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !["ACTIVE", "FLAGGED"].includes(session.member.status)
    ) {
      response.clearCookie(env.MEMBER_REFRESH_COOKIE_NAME, memberCookieOptions);
      response
        .status(401)
        .json({ success: false, message: "Member refresh session is invalid" });
      return;
    }
    const nextToken = createMemberRefreshToken();
    const rotated = await prisma.$transaction(async (transaction) => {
      const result = await transaction.memberSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (result.count !== 1) return false;
      await transaction.memberSession.create({
        data: {
          tokenHash: hashMemberRefreshToken(nextToken),
          memberId: session.memberId,
          expiresAt: memberSessionExpiresAt(),
          ...metadata(request),
        },
      });
      return true;
    });
    if (!rotated) {
      response.clearCookie(env.MEMBER_REFRESH_COOKIE_NAME, memberCookieOptions);
      response
        .status(401)
        .json({ success: false, message: "Member refresh session is invalid" });
      return;
    }
    setMemberCookie(response, nextToken);
    response.json({
      success: true,
      accessToken: await createMemberAccessToken(session.member.id),
      member: publicMember(session.member),
    });
  },
);

memberAuthRouter.post("/logout", async (request, response) => {
  const token = request.cookies[env.MEMBER_REFRESH_COOKIE_NAME] as
    | string
    | undefined;
  if (token)
    await prisma.memberSession.updateMany({
      where: { tokenHash: hashMemberRefreshToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  response.clearCookie(env.MEMBER_REFRESH_COOKIE_NAME, memberCookieOptions);
  response.json({ success: true, message: "Signed out successfully" });
});

memberAuthRouter.get("/me", authenticateMember, (_request, response) => {
  response.json({ success: true, member: response.locals.member });
});
