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
  FRONTEND_ORIGIN: z.string().url(),
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

export const env = result.data;
