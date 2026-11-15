import { Prisma } from "../generated/prisma/client.js";

// Shared by every write path that pre-checks a unique field then writes separately (member
// create/update, member-import.commit.ts) -- the pre-check closes the common case, but two
// concurrent requests with the same new value can both pass it and race on the DB's unique
// index. This turns that race's P2002 into the same clean, user-facing message the pre-check
// would have given, instead of an uncaught 500.
//
// Under @prisma/adapter-pg (confirmed against a real local Postgres), a P2002's meta has no
// `target` at all -- the violated column(s) live at
// meta.driverAdapterError.cause.constraint.fields instead. `target` is kept as a second
// fallback only in case this ever runs against the classic binary query engine, which does
// still use it -- every caller silently fell back to the generic "A unique field" message
// until this was checked against a real driver-adapter error.
export function uniqueViolationField(error: unknown): string | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return null;
  }
  const driverFields = (
    error.meta as { driverAdapterError?: { cause?: { constraint?: { fields?: unknown } } } }
  )?.driverAdapterError?.cause?.constraint?.fields;
  if (Array.isArray(driverFields)) return String(driverFields[0] ?? "");

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
