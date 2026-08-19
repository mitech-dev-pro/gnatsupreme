import type { ErrorRequestHandler, RequestHandler } from "express";
import multer from "multer";

import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code = "REQUEST_ERROR",
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFoundHandler: RequestHandler = (request, response) => {
  response.status(404).json({
    success: false,
    code: "ROUTE_NOT_FOUND",
    message: `Route ${request.method} ${request.path} was not found`,
    requestId: request.id,
  });
};

function databaseError(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  if (error.code === "P2002") return new AppError(409, "A record with these unique values already exists", "DUPLICATE_RECORD");
  if (error.code === "P2003") return new AppError(409, "This operation conflicts with related records", "RELATED_RECORD_CONFLICT");
  if (error.code === "P2025") return new AppError(404, "The requested record was not found", "RECORD_NOT_FOUND");
  return null;
}

export const errorHandler: ErrorRequestHandler = (error, request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }
  const mapped =
    error instanceof AppError
      ? error
      : databaseError(error) ??
        (error instanceof multer.MulterError
          ? new AppError(error.code === "LIMIT_FILE_SIZE" ? 413 : 400, error.message, error.code)
          : error instanceof SyntaxError && "body" in error
            ? new AppError(400, "Request body contains invalid JSON", "INVALID_JSON")
            : new AppError(500, "An unexpected error occurred", "INTERNAL_SERVER_ERROR"));

  const log = mapped.statusCode >= 500 ? logger.error.bind(logger) : logger.warn.bind(logger);
  log({ err: error, requestId: request.id, method: request.method, path: request.path, statusCode: mapped.statusCode }, mapped.message);
  response.status(mapped.statusCode).json({
    success: false,
    code: mapped.code,
    message: mapped.message,
    ...(mapped.details === undefined ? {} : { details: mapped.details }),
    requestId: request.id,
    ...(env.NODE_ENV === "development" && mapped.statusCode === 500
      ? { debug: error instanceof Error ? error.message : String(error) }
      : {}),
  });
};
