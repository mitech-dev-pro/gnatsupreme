import { Prisma } from "../generated/prisma/client.js";

// Shared by every write path that pre-checks a unique field then writes separately (member
// create/update, member-import.commit.ts) -- the pre-check closes the common case, but two
// concurrent requests with the same new value can both pass it and race on the DB's unique
// index. This turns that race's P2002 into the same clean, user-facing message the pre-check
// would have given, instead of an uncaught 500.
export function uniqueViolationField(error: unknown): string | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return null;
  }
  const target = error.meta?.target;
  if (Array.isArray(target)) return String(target[0] ?? "");
  if (typeof target === "string") return target;
  return "";
}

export function uniqueFieldLabel(field: string) {
  field = field.replaceAll("_", "").toLowerCase();
  if (field.includes("ghanacardid")) return "Ghana Card ID";
  if (field.includes("controllerid")) return "Controller ID";
  if (field.includes("phone")) return "Phone number";
  if (field.includes("email")) return "Email";
  return "A unique field";
}
