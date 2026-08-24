import { createHash, randomBytes } from "node:crypto";

import argon2 from "argon2";
import { jwtVerify, SignJWT } from "jose";

import { env } from "../../config/env.js";

const memberAccessSecret = createHash("sha256")
  .update(`${env.JWT_ACCESS_SECRET}:gnat-member-access:v1`)
  .digest();

// Same argon2id parameters used for staff account passwords (user.routes.ts) — kept identical so
// there's one password-hashing policy to reason about across the app, not two.
export async function hashMemberPassword(password: string) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyMemberPassword(hash: string, password: string) {
  return argon2.verify(hash, password);
}

// Unambiguous character set (no 0/O/1/I/l) since this is read aloud or copied off a screen by staff
// distributing it to a member — visual confusion here means a member gets locked out on their first
// try.
const TEMP_PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

export function generateTempPassword(length = 12) {
  const bytes = randomBytes(length);
  let password = "";
  for (let i = 0; i < length; i += 1) {
    password += TEMP_PASSWORD_ALPHABET[bytes[i]! % TEMP_PASSWORD_ALPHABET.length];
  }
  return password;
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

export function createPasswordResetToken() {
  return randomBytes(32).toString("hex");
}

export function hashPasswordResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function passwordResetTokenExpiresAt() {
  return new Date(Date.now() + env.MEMBER_PASSWORD_RESET_TTL_MINUTES * 60_000);
}

export function normalizeMemberName(name: string) {
  return name
    .replace(/^(mr|mrs|miss|ms|dr|rev)\.?\s+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function memberNameMatches(storedName: string, enteredName: string) {
  const stored = normalizeMemberName(storedName);
  const entered = normalizeMemberName(enteredName);
  if (!stored || !entered) return false;
  return stored.includes(entered) || entered.includes(stored);
}
