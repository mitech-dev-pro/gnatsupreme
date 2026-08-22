import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import type { Request, Response } from "express";
import { logger } from "../lib/logger.js";

const jsonRateLimitHandler = (limiter: string) => (request: Request, response: Response) => {
  const resetTime = (request as Request & { rateLimit?: { resetTime?: Date } })
    .rateLimit?.resetTime?.getTime();
  const retryAfterSeconds = Math.max(
    1,
    resetTime ? Math.ceil((resetTime - Date.now()) / 1_000) : 60,
  );

  response.set("Retry-After", String(retryAfterSeconds));
  logger.warn(
    { limiter, ipAddress: request.ip, path: request.originalUrl, retryAfterSeconds },
    "Request rate limit exceeded",
  );
  response.status(429).json({
    success: false,
    message: `Too many requests. Please try again in ${Math.ceil(retryAfterSeconds / 60)} minute${retryAfterSeconds > 60 ? "s" : ""}.`,
    retryAfterSeconds,
  });
};

export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 400,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonRateLimitHandler("api"),
});

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: jsonRateLimitHandler("staff-login"),
});

export const refreshRateLimiter = rateLimit({
  windowMs: 60 * 1_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonRateLimitHandler("session-refresh"),
});

// Isolate the small allowance by member ID and client IP. Members sharing a school or
// office network therefore do not consume one another's five requests.
export const memberOtpRequestRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (request) => {
    const controllerId = String(request.body?.controllerId ?? "invalid")
      .trim()
      .replace(/\D/g, "") || "invalid";
    return `${ipKeyGenerator(request.ip ?? "unknown")}:${controllerId}`;
  },
  handler: jsonRateLimitHandler("member-otp-member"),
});

// A higher IP-wide ceiling still stops one network from cycling through many member IDs.
export const memberOtpIpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonRateLimitHandler("member-otp-network"),
});

export const memberOtpVerifyRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonRateLimitHandler("member-otp-verify"),
});
