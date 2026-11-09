import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import type { Request, Response } from "express";
import { logger } from "../lib/logger.js";
import { normalizeGhanaPhone } from "../lib/phone.js";

const jsonRateLimitHandler = (limiter: string) => (request: Request, response: Response) => {
  const resetTime = (
    request as Request & { rateLimit?: { resetTime?: Date } }
  ).rateLimit?.resetTime?.getTime();
  const retryAfterSeconds = Math.max(
    1,
    resetTime ? Math.ceil((resetTime - Date.now()) / 1_000) : 60,
  );

  response.set("Retry-After", String(retryAfterSeconds));
  logger.warn(
    {
      limiter,
      ipAddress: request.ip,
      path: request.originalUrl,
      retryAfterSeconds,
    },
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

// A blunt per-IP ceiling, loosened from the original 5 -- Ghanaian mobile carriers commonly
// share a small public-IP pool via carrier-grade NAT, so a tight per-IP number alone risks
// blocking bursts of legitimate people right after a credentials SMS goes out. The real
// per-account protection is loginIdentifierRateLimiter below; this is just the network-wide
// backstop underneath it.
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: jsonRateLimitHandler("staff-login"),
});

// Keyed on the normalized identifier alone (no IP component) -- the point is to stop one
// account being brute-forced from many different IPs, which loginRateLimiter's per-IP keying
// can't do. keyGenerator runs on the raw request body before the zod schema does, so it has to
// apply the exact same normalization the schema would (normalizeGhanaPhone / lowercase) itself,
// or 0244.../+233244... and different email casings would each get their own bucket, silently
// defeating the limit. Also must produce a key regardless of whether the identifier belongs to
// a real account -- skipping that would let a timing/429 difference leak which phone numbers
// have accounts. Falls back to the raw trimmed value if normalization ever throws, rather than
// 500ing the request over a rate-limiter key.
export const loginIdentifierRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (request) => {
    const body = request.body as { email?: unknown; phone?: unknown } | undefined;
    if (typeof body?.email === "string" && body.email.trim()) {
      return `email:${body.email.trim().toLowerCase()}`;
    }
    if (typeof body?.phone === "string" && body.phone.trim()) {
      const raw = body.phone.trim();
      let normalized: string;
      try {
        normalized = normalizeGhanaPhone(raw) ?? raw;
      } catch {
        normalized = raw;
      }
      return `phone:${normalized}`;
    }
    return "unknown";
  },
  handler: jsonRateLimitHandler("staff-login-identifier"),
});

export const forgotPasswordRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (request) => {
    const email =
      String(request.body?.email ?? "invalid")
        .trim()
        .toLowerCase() || "invalid";
    return `${ipKeyGenerator(request.ip ?? "unknown")}:${email}`;
  },
  handler: jsonRateLimitHandler("staff-forgot-password"),
});

// Keyed on the authenticated user's id alone, not combined with IP -- the threat model here is a
// stolen access token used from any IP, and combining the two would give each IP its own bucket
// per user, letting IP rotation reset the limit (the opposite of the point). authenticate /
// authenticateAllowPendingSetup must run before this middleware on the route so
// response.locals.user is already populated -- the reverse order from every other rate-limited
// route in this app.
export const completeSetupRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (_request, response) => String(response.locals.user?.id ?? "unknown"),
  handler: jsonRateLimitHandler("staff-complete-setup"),
});

// A blunt per-IP ceiling underneath the user-keyed limiter above, same shape as
// memberLoginIpRateLimiter.
export const completeSetupIpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonRateLimitHandler("staff-complete-setup-network"),
});

// Same user-keyed reasoning as completeSetupRateLimiter -- a live session on a shared/
// cybercafé computer shouldn't get unlimited password guesses against this endpoint just
// because it isn't the login route (set-email also requires currentPassword).
export const setEmailRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (_request, response) => String(response.locals.user?.id ?? "unknown"),
  handler: jsonRateLimitHandler("staff-set-email"),
});

export const refreshRateLimiter = rateLimit({
  windowMs: 60 * 1_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonRateLimitHandler("session-refresh"),
});

export const memberLoginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (request) => {
    const controllerId =
      String(request.body?.controllerId ?? "invalid")
        .trim()
        .replace(/\D/g, "") || "invalid";
    return `${ipKeyGenerator(request.ip ?? "unknown")}:${controllerId}`;
  },
  handler: jsonRateLimitHandler("member-login-member"),
});

// A higher IP-wide ceiling still stops one network from cycling through many member IDs.
export const memberLoginIpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonRateLimitHandler("member-login-network"),
});

export const memberForgotPasswordRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (request) => {
    const controllerId =
      String(request.body?.controllerId ?? "invalid")
        .trim()
        .replace(/\D/g, "") || "invalid";
    return `${ipKeyGenerator(request.ip ?? "unknown")}:${controllerId}`;
  },
  handler: jsonRateLimitHandler("member-forgot-password"),
});

export const memberLookupRateLimiter = rateLimit({
  windowMs: 60 * 1_000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (request) => {
    const controllerId =
      String(request.body?.controllerId ?? "invalid")
        .trim()
        .replace(/\D/g, "") || "invalid";
    return `${ipKeyGenerator(request.ip ?? "unknown")}:${controllerId}`;
  },
  handler: jsonRateLimitHandler("member-lookup"),
});

export const memberLookupIpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonRateLimitHandler("member-lookup-network"),
});

// IP-keyed since the only caller identity on this route is one shared API key (no per-caller
// login/session to key off of) -- this throttles key-guessing attempts too, since it's mounted
// ahead of the API-key check in external.routes.ts.
export const externalApiKeyRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonRateLimitHandler("external-member-lookup"),
});

export const memberSetupRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (request) => {
    const controllerId =
      String(request.body?.controllerId ?? "invalid")
        .trim()
        .replace(/\D/g, "") || "invalid";
    return `${ipKeyGenerator(request.ip ?? "unknown")}:${controllerId}`;
  },
  handler: jsonRateLimitHandler("member-setup"),
});
