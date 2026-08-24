import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client.js";
import { env } from "../config/env.js";

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

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
