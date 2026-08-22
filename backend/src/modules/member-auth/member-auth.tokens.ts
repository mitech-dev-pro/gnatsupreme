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

// Report 20 imports carry titles ("Mr. ", "Miss ", "Mrs. ", "Ms. ", "Dr. ", "Rev. ") and inconsistent
// double-spacing in fullName, so an exact-match identity check would fail for real members. Strips
// both before comparing.
export function normalizeMemberName(name: string) {
  return name
    .replace(/^(mr|mrs|miss|ms|dr|rev)\.?\s+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Report 20 names sometimes carry an extra/missing middle name or initial next to the record a
// member types from memory, so an exact match is too strict. Equivalent to a two-way SQL
// `... ILIKE '%' || :other || '%'` — either name containing the other (after stripping titles) counts
// as a match, e.g. "George Asamoah" matches stored "Mr. George Asiedu Asamoah".
export function memberNameMatches(storedName: string, enteredName: string) {
  const stored = normalizeMemberName(storedName);
  const entered = normalizeMemberName(enteredName);
  if (!stored || !entered) return false;
  return stored.includes(entered) || entered.includes(stored);
}
