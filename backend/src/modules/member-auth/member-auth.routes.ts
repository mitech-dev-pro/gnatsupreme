import { Router, type Request, type Response } from "express";

import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { authenticateMember } from "../../middleware/authenticate-member.js";
import {
  memberOtpIpRateLimiter,
  memberOtpRequestRateLimiter,
  memberOtpVerifyRateLimiter,
  memberPhoneRegisterRateLimiter,
  refreshRateLimiter,
} from "../../middleware/rate-limit.js";
import { recordAudit } from "../audit/audit.service.js";
import {
  processNotificationById,
  queueSmsNotification,
} from "../notifications/notification.service.js";
import {
  registerPhoneSchema,
  requestOtpSchema,
  verifyOtpSchema,
} from "./member-auth.schemas.js";
import {
  createChallengeToken,
  createMemberAccessToken,
  createMemberRefreshToken,
  createOtp,
  hashMemberRefreshToken,
  hashOtp,
  memberNameMatches,
  memberSessionExpiresAt,
  otpMatches,
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

// Shared by /request-otp (existing phone on file) and /register-phone (member has just claimed a
// phone number and needs the first OTP sent to it). Reuses a still-live unconsumed challenge within
// the cooldown window instead of spamming a fresh SMS on every retry/resend click.
async function issueOtpChallenge(request: Request, member: { id: number; phone: string }) {
  let challengeToken = createChallengeToken();
  const cooldown = new Date(Date.now() - 60_000);
  const recent = await prisma.memberOtpChallenge.findFirst({
    where: { memberId: member.id, createdAt: { gte: cooldown }, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (recent) {
    challengeToken = recent.publicToken;
    return challengeToken;
  }
  const otp = createOtp();
  const expiresAt = new Date(Date.now() + env.MEMBER_OTP_TTL_MINUTES * 60_000);
  await prisma.$transaction([
    prisma.memberOtpChallenge.updateMany({
      where: { memberId: member.id, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    prisma.memberOtpChallenge.create({
      data: {
        publicToken: challengeToken,
        memberId: member.id,
        otpHash: hashOtp(challengeToken, otp),
        expiresAt,
        ipAddress: request.ip?.slice(0, 64),
      },
    }),
  ]);
  const notification = await queueSmsNotification({
    type: "MEMBER_OTP",
    title: "Member verification code",
    message: `\n\n\n\n Your GNAT Supreme Care verification code is ${otp}. It expires in ${env.MEMBER_OTP_TTL_MINUTES} minutes. Do not share this code. \n\n\n\n`,
    destination: member.phone,
    idempotencyKey: `member-otp:${challengeToken}`,
    memberId: member.id,
  });
  await processNotificationById(notification.id);
  return challengeToken;
}

// Public (unauthenticated) so the first-login phone-registration form on the login page can offer a
// district dropdown instead of free-text entry. District names carry no sensitive information.
memberAuthRouter.get("/districts", async (_request, response) => {
  const districts = await prisma.district.findMany({
    select: { id: true, name: true, region: { select: { name: true } } },
    orderBy: [{ region: { name: "asc" } }, { name: "asc" }],
  });
  response.json({ success: true, data: districts });
});

memberAuthRouter.post(
  "/request-otp",
  memberOtpIpRateLimiter,
  memberOtpRequestRateLimiter,
  async (request, response) => {
    const startedAt = Date.now();
    const parsed = requestOtpSchema.safeParse(request.body);
    if (!parsed.success) {
      response
        .status(400)
        .json({ success: false, message: "Enter a valid Controller ID" });
      return;
    }
    let challengeToken = createChallengeToken();
    // Looked up unconditionally (no status/phone filter) so a genuine member in a bad state gets a
    // specific, actionable message below. Only the "this Controller ID doesn't exist at all" case
    // stays deliberately ambiguous, to avoid letting the endpoint be used to enumerate valid IDs.
    const member = await prisma.member.findFirst({
      where: { controllerId: parsed.data.controllerId },
      select: { id: true, controllerId: true, phone: true, status: true },
    });

    if (member && !["ACTIVE", "FLAGGED"].includes(member.status)) {
      response.status(403).json({
        success: false,
        message:
          "This membership is not active yet. Please contact your local district office for help.",
      });
      return;
    }
    if (member && !member.phone) {
      response.status(403).json({
        success: false,
        code: "PHONE_NOT_ON_FILE",
        message:
          "No phone number is on file for this membership. You can register one now to continue.",
      });
      return;
    }

    // Phone verification is implicit in login now: a member's first successful OTP verification
    // sets phoneVerifiedAt (see /verify-otp), so this no longer gates on it being pre-verified —
    // otherwise no member could ever complete their first login.
    if (member?.phone) {
      challengeToken = await issueOtpChallenge(request, { id: member.id, phone: member.phone });
    }
    const remainingDelay = 300 - (Date.now() - startedAt);
    if (remainingDelay > 0)
      await new Promise((resolve) => setTimeout(resolve, remainingDelay));
    response.json({
      success: true,
      challengeToken,
      message:
        "If the membership is eligible and has a verified phone number, a verification code has been sent.",
    });
  },
);

memberAuthRouter.post(
  "/register-phone",
  memberPhoneRegisterRateLimiter,
  async (request, response) => {
    const parsed = registerPhoneSchema.safeParse(request.body);
    if (!parsed.success) {
      response
        .status(400)
        .json({ success: false, message: "Enter valid details to continue" });
      return;
    }
    const genericFailure = () =>
      response.status(401).json({
        success: false,
        message:
          "We couldn't verify those details. Please check your Controller ID, name and district, or contact your local district office for help.",
      });

    const member = await prisma.member.findFirst({
      where: { controllerId: parsed.data.controllerId },
      select: {
        id: true,
        controllerId: true,
        fullName: true,
        phone: true,
        status: true,
        districtId: true,
      },
    });
    if (!member || !["ACTIVE", "FLAGGED"].includes(member.status)) {
      genericFailure();
      return;
    }
    if (member.phone) {
      response.status(409).json({
        success: false,
        message:
          "A phone number is already on file for this membership. Please contact your local district office if you can no longer access it.",
      });
      return;
    }
    if (
      !memberNameMatches(member.fullName, parsed.data.fullName) ||
      member.districtId !== parsed.data.districtId
    ) {
      genericFailure();
      return;
    }

    try {
      await prisma.member.update({
        where: { id: member.id },
        data: { phone: parsed.data.phone },
      });
    } catch (error) {
      if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
        response.status(409).json({
          success: false,
          message:
            "This phone number is already registered to another membership. Please contact your local district office for help.",
        });
        return;
      }
      throw error;
    }

    await recordAudit({
      request,
      action: "MEMBER_PHONE_SELF_REGISTERED",
      entityType: "MEMBER",
      entityId: member.id,
      description: `Member ${member.controllerId} self-registered a phone number at first login`,
      districtId: member.districtId,
    });

    const challengeToken = await issueOtpChallenge(request, {
      id: member.id,
      phone: parsed.data.phone,
    });
    response.json({
      success: true,
      challengeToken,
      message: "A verification code has been sent to the phone number you provided.",
    });
  },
);

memberAuthRouter.post(
  "/verify-otp",
  memberOtpVerifyRateLimiter,
  async (request, response) => {
    const parsed = verifyOtpSchema.safeParse(request.body);
    if (!parsed.success) {
      response
        .status(400)
        .json({ success: false, message: "Invalid verification request" });
      return;
    }
    const challenge = await prisma.memberOtpChallenge.findUnique({
      where: { publicToken: parsed.data.challengeToken },
      include: {
        member: {
          select: {
            id: true,
            controllerId: true,
            fullName: true,
            status: true,
            phoneVerifiedAt: true,
          },
        },
      },
    });
    const invalid =
      !challenge ||
      challenge.consumedAt ||
      challenge.expiresAt <= new Date() ||
      challenge.attempts >= challenge.maxAttempts ||
      !otpMatches(
        parsed.data.challengeToken,
        parsed.data.otp,
        challenge.otpHash,
      ) ||
      !["ACTIVE", "FLAGGED"].includes(challenge.member.status);
    if (invalid) {
      if (
        challenge &&
        !challenge.consumedAt &&
        challenge.attempts < challenge.maxAttempts
      ) {
        await prisma.memberOtpChallenge.update({
          where: { id: challenge.id },
          data: { attempts: { increment: 1 } },
        });
      }
      response.status(401).json({
        success: false,
        message: "The verification code is invalid or expired",
      });
      return;
    }
    const refreshToken = createMemberRefreshToken();
    const consumed = await prisma.$transaction(async (transaction) => {
      const result = await transaction.memberOtpChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (result.count !== 1) return false;
      await transaction.memberSession.create({
        data: {
          tokenHash: hashMemberRefreshToken(refreshToken),
          memberId: challenge.memberId,
          expiresAt: memberSessionExpiresAt(),
          ...metadata(request),
        },
      });
      // A successful OTP verification is itself proof the phone number is reachable — verify it
      // on first success rather than requiring a separate staff action (see request-otp above).
      if (!challenge.member.phoneVerifiedAt) {
        await transaction.member.update({
          where: { id: challenge.memberId },
          data: { phoneVerifiedAt: new Date() },
        });
      }
      return true;
    });
    if (!consumed) {
      response.status(401).json({
        success: false,
        message: "The verification code is invalid or expired",
      });
      return;
    }
    setMemberCookie(response, refreshToken);
    await recordAudit({
      request,
      action: "MEMBER_LOGIN_SUCCEEDED",
      entityType: "MEMBER",
      entityId: challenge.member.id,
      description: `Member ${challenge.member.controllerId} signed in`,
    });
    response.json({
      success: true,
      accessToken: await createMemberAccessToken(challenge.member.id),
      member: publicMember(challenge.member),
    });
  },
);

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
