import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

// Deliberately minimal today -- a single shared key has exactly one "client". This is the seam
// a future DB-backed per-client key table would populate (e.g. { keyId, clientName, scopes })
// without changing anything downstream that reads response.locals.externalClient.
export type AuthenticatedExternalClient = { keyId: string };

function safeCompare(a: string, b: string) {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export function authenticateExternalApiKey(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  const provided = request.header("x-api-key");
  const expected = env.EXTERNAL_API_KEY;

  if (!provided || !expected || !safeCompare(provided, expected)) {
    // Not audited (recordAudit is reserved for successful lookups, to keep that log free of
    // scan/guess noise) -- but this still needs SOME trace, since the rate limiter only logs
    // once a caller crosses the 429 threshold, which would otherwise leave up to `limit` wrong
    // key attempts per window per IP with zero log output.
    logger.warn(
      { ipAddress: request.ip, path: request.originalUrl },
      "External API: invalid or missing API key",
    );
    response
      .status(401)
      .json({ success: false, code: "EXTERNAL_AUTH_REQUIRED", message: "Valid API key required" });
    return;
  }

  response.locals.externalClient = { keyId: "default" } satisfies AuthenticatedExternalClient;
  next();
}
