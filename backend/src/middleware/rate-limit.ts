import { rateLimit } from "express-rate-limit";
import type { Request, Response } from "express";

const jsonRateLimitHandler = (_request: Request, response: Response) => {
  response.status(429).json({
    success: false,
    message: "Too many requests. Please try again later.",
  });
};

export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonRateLimitHandler,
});

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: jsonRateLimitHandler,
});

export const refreshRateLimiter = rateLimit({
  windowMs: 60 * 1_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonRateLimitHandler,
});

export const memberOtpRequestRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonRateLimitHandler,
});

export const memberOtpVerifyRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonRateLimitHandler,
});


//this middleware sets up rate limiting for different types of requests. The `apiRateLimiter` allows 300 requests per 15 minutes, the `loginRateLimiter` allows 5 failed login attempts per 15 minutes (skipping successful logins), and the `refreshRateLimiter` allows 30 requests per minute. If a client exceeds the limit, a 429 Too Many Requests response is sent with a JSON message.
