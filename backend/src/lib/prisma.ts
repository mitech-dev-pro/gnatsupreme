import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client.js";
import { env } from "../config/env.js";

const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT_MS,
  idleTimeoutMillis: env.DB_IDLE_TIMEOUT_MS,
  application_name: "gnatsupreme",
});

// Global omit, not per-query select/omit — a hash is exactly the kind of field that's easy to
// forget to exclude on some future query (member.routes.ts's memberInclude already returns every
// scalar via `include` rather than `select`, which is how this got missed once already). Route
// handlers that genuinely need the hash (login, password reset) pass an explicit
// `omit: { passwordHash: false }` to opt back in for that one query.
export const prisma = new PrismaClient({
  adapter,
  omit: {
    member: { passwordHash: true },
    user: { passwordHash: true },
  },
});
