import "dotenv/config";

import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  DATABASE_URL: z
    .string()
    .url()
    .refine(
      (value) => value.startsWith("postgresql://") || value.startsWith("postgres://"),
      "DATABASE_URL must be a PostgreSQL connection URL",
    ),
  JWT_ACCESS_SECRET: z.string().min(64, "JWT_ACCESS_SECRET must contain at least 64 characters"),
  JWT_ACCESS_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  REFRESH_COOKIE_NAME: z.string().min(1).default("gnat_refresh_token"),
  MEMBER_REFRESH_COOKIE_NAME: z.string().min(1).default("gnat_member_refresh_token"),
  MEMBER_ACCESS_TTL_MINUTES: z.coerce.number().int().min(1).max(30).default(10),
  MEMBER_SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  MEMBER_PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),
  SMS_PROVIDER: z.enum(["CONSOLE"]).default("CONSOLE"),
  API_DOCS_ENABLED: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).optional(),
  LOG_FILE: z.string().trim().min(1).default("logs/app.log"),
  FRONTEND_ORIGIN: z.string().url(),
  UPLOAD_DIR: z.string().trim().min(1).default("uploads"),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().int().min(1).max(25).default(10),
  MANKRADO_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  MANKRADO_MODE: z.enum(["HOSTED_FORM", "API"]).default("API"),
  MANKRADO_BASE_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional(),
  ),
  MANKRADO_API_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(16).optional(),
  ),
});

const result = environmentSchema.safeParse(process.env);

if (!result.success) {
  const problems = result.error.issues.map((issue) => ({
    variable: issue.path.join("."),
    message: issue.message,
  }));

  console.error("Invalid environment configuration:", problems);
  throw new Error("Application environment validation failed");
}

if (result.success && result.data.MANKRADO_ENABLED && !result.data.MANKRADO_BASE_URL) {
  throw new Error("MANKRADO_BASE_URL is required when the Mankrado integration is enabled");
}

export const env = result.data;
