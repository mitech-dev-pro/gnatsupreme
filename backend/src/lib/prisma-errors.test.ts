import assert from "node:assert/strict";
import test from "node:test";

import { Prisma } from "../generated/prisma/client.js";
import { uniqueFieldLabel, uniqueViolationField } from "./prisma-errors.js";

// The real shape @prisma/adapter-pg actually throws (captured against a live local Postgres) --
// no `target` at all. A test built around the classic engine's `{ target: [...] }` shape alone
// would never have caught this project silently losing its field name on every unique-violation
// message once it moved to driver adapters.
function driverAdapterP2002(fields: string[]) {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: {
      modelName: "Member",
      driverAdapterError: {
        name: "DriverAdapterError",
        cause: {
          originalCode: "23505",
          originalMessage: `duplicate key value violates unique constraint`,
          kind: "UniqueConstraintViolation",
          constraint: { fields },
        },
      },
    },
  });
}

test("uniqueViolationField reads the real driver-adapter P2002 shape, not just the classic engine's target", () => {
  assert.equal(uniqueViolationField(driverAdapterP2002(["phone"])), "phone");
  assert.equal(
    uniqueFieldLabel(uniqueViolationField(driverAdapterP2002(["phone"]))!),
    "Phone number",
  );
  assert.equal(
    uniqueFieldLabel(uniqueViolationField(driverAdapterP2002(["ghana_card_id"]))!),
    "Ghana Card ID",
  );
});

test("uniqueViolationField still falls back to the classic engine's target shape", () => {
  const classic = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { target: ["email"] },
  });
  assert.equal(uniqueFieldLabel(uniqueViolationField(classic)!), "Email");
});

test("uniqueViolationField returns null for a non-P2002 error", () => {
  assert.equal(uniqueViolationField(new Error("boom")), null);
  assert.equal(
    uniqueViolationField(
      new Prisma.PrismaClientKnownRequestError("Not found", {
        code: "P2025",
        clientVersion: "test",
      }),
    ),
    null,
  );
});
