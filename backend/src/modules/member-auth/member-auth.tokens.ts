import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

import { jwtVerify, SignJWT } from "jose";

import { env } from "../../config/env.js";

const memberAccessSecret = createHash("sha256")
  .update(`${env.JWT_ACCESS_SECRET}:gnat-member-access:v1`)
  .digest();

export function createOtp() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function createChallengeToken() {
  return randomBytes(32).toString("hex");
}

export function hashOtp(challengeToken: string, otp: string) {
  return createHmac("sha256", memberAccessSecret).update(`${challengeToken}:${otp}`).digest("hex");
}

export function otpMatches(challengeToken: string, otp: string, expectedHash: string) {
  const actual = Buffer.from(hashOtp(challengeToken, otp), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function createMemberAccessToken(memberId: number) {
  return new SignJWT({ kind: "member" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(String(memberId))
    .setAudience("gnat-member")
    .setIssuedAt()
    .setExpirationTime(`${env.MEMBER_ACCESS_TTL_MINUTES}m`)
    .sign(memberAccessSecret);
}

export async function verifyMemberAccessToken(token: string) {
  const { payload } = await jwtVerify(token, memberAccessSecret, {
    algorithms: ["HS256"],
    audience: "gnat-member",
  });
  const memberId = Number(payload.sub);
  if (payload.kind !== "member" || !Number.isSafeInteger(memberId) || memberId < 1) {
    throw new Error("Invalid member access token");
  }
  return memberId;
}

export function createMemberRefreshToken() {
  return randomBytes(64).toString("base64url");
}

export function hashMemberRefreshToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function memberSessionExpiresAt() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + env.MEMBER_SESSION_TTL_DAYS);
  return date;
}
