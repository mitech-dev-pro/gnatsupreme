import { createHash, randomBytes } from "node:crypto";

import { jwtVerify, SignJWT } from "jose";

import { env } from "../../config/env.js";

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
