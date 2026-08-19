import { randomUUID } from "node:crypto";

import pino from "pino";
import { pinoHttp } from "pino-http";

import { env } from "../config/env.js";

export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers.set-cookie",
      "password",
      "otp",
      "accessToken",
      "refreshToken",
      "err.body",
    ],
    censor: "[REDACTED]",
  },
  base: { service: "gnatsupreme-backend", environment: env.NODE_ENV },
});

export const requestLogger = pinoHttp({
  logger,
  genReqId(request, response) {
    const supplied = request.headers["x-request-id"];
    const requestId = typeof supplied === "string" && /^[A-Za-z0-9._-]{1,100}$/.test(supplied)
      ? supplied
      : randomUUID();
    response.setHeader("X-Request-ID", requestId);
    return requestId;
  },
  customLogLevel(_request, response, error) {
    if (error || response.statusCode >= 500) return "error";
    if (response.statusCode >= 400) return "warn";
    return "info";
  },
  serializers: {
    req(request) {
      return { id: request.id, method: request.method, url: request.url, remoteAddress: request.remoteAddress };
    },
    res(response) {
      return { statusCode: response.statusCode };
    },
  },
});
