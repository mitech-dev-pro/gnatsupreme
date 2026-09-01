import type { NextFunction, Request, Response } from "express";

import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

export function logSlowRequests(request: Request, response: Response, next: NextFunction) {
  const startedAt = process.hrtime.bigint();
  response.once("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    if (durationMs < env.SLOW_REQUEST_THRESHOLD_MS) return;

    const staff = response.locals.user as { role?: string; regionId?: number | null; districtId?: number | null } | undefined;
    const member = response.locals.member as { id?: number } | undefined;
    logger.warn({
      requestId: request.id,
      method: request.method,
      path: request.path,
      statusCode: response.statusCode,
      durationMs: Math.round(durationMs),
      scope: staff ? { role: staff.role, regionId: staff.regionId, districtId: staff.districtId } : member?.id ? { role: "MEMBER" } : undefined,
    }, "Slow API request");
  });
  next();
}
