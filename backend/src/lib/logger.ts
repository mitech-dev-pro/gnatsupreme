import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

import pino from "pino";
import { pinoHttp } from "pino-http";

import { env } from "../config/env.js";

const logFilePath = path.resolve(process.cwd(), env.LOG_FILE);
mkdirSync(path.dirname(logFilePath), { recursive: true });

const logStreams = pino.multistream([
  { stream: process.stdout },
  { stream: pino.destination({ dest: logFilePath, sync: false }) },
]);

export const logger = pino({
  level: env.LOG_LEVEL ?? (env.NODE_ENV === "production" ? "info" : "debug"),
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
}, logStreams);

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
