import { createHash, randomBytes } from "node:crypto";

import argon2 from "argon2";
import { jwtVerify, SignJWT } from "jose";

import { env } from "../../config/env.js";

// Same argon2id parameters used elsewhere for staff passwords (user.routes.ts) -- kept
// identical so there's one password-hashing policy to reason about, not two.
export async function hashPassword(password: string) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
}

const accessTokenSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export async function createAccessToken(userId: number) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_ACCESS_TTL_MINUTES}m`)
    .sign(accessTokenSecret);
}

export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, accessTokenSecret, {
    algorithms: ["HS256"],
  });

  const userId = Number(payload.sub);

  if (!Number.isSafeInteger(userId) || userId < 1) {
    throw new Error("Access token has an invalid subject");
  }

  return userId;
}

export function createRefreshToken() {
  return randomBytes(64).toString("base64url");
}

export function hashRefreshToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function refreshTokenExpiresAt() {
  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + env.REFRESH_TOKEN_TTL_DAYS);
  return expiresAt;
}

export function createPasswordResetToken() {
  return randomBytes(32).toString("hex");
}

export function hashPasswordResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function passwordResetTokenExpiresAt() {
  return new Date(Date.now() + env.STAFF_PASSWORD_RESET_TTL_MINUTES * 60_000);
}
