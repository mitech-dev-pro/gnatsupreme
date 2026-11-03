import assert from "node:assert/strict";
import test from "node:test";

import { stub, routeHandler } from "../../test/fixtures.js";
import { prisma } from "../../lib/prisma.js";
import { importRouter } from "./import.routes.js";

function response() {
  return {
    locals: { user: { id: 1, fullName: "Test Admin", email: "admin@example.test" } },
    code: 200,
    body: null as unknown,
    status(code: number) {
      this.code = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
}

test("manually resolving a Report 20 row sets regionId from the selected district", async (t) => {
  stub(t, prisma.report20Row, "findFirst", async () => ({
    id: 5,
    importJobId: 9,
    status: "UNMATCHED",
    controllerId: "123456",
    fullName: "Test Member",
    school: "Test School",
    rowNumber: 3,
  }));
  stub(t, prisma.member, "findUnique", async () => null);
  stub(t, prisma.district, "findUnique", async () => ({
    id: 4,
    name: "Test District",
    regionId: 2,
  }));
  stub(t, prisma, "$transaction", async (callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma),
  );
  const create = stub(
    t,
    prisma.member,
    "create",
    async (args: { data: { districtId: number; regionId: number | null } }) => {
      assert.equal(args.data.districtId, 4);
      // The actual bug: this was previously omitted entirely, leaving the member invisible to
      // the correct REGIONAL_ADMIN (who scopes on Member.regionId, not district.regionId).
      assert.equal(args.data.regionId, 2);
      return { id: 10, ...args.data };
    },
  );
  stub(t, prisma.report20Row, "update", async () => ({}));
  stub(t, prisma.importJob, "update", async () => ({}));
  stub(t, prisma.auditLog, "create", async () => ({}));
  const res = response();
  await routeHandler(
    importRouter,
    "/:id/rows/:rowId/resolve",
    "post",
  )({ params: { id: "9", rowId: "5" }, body: { districtId: "4" } }, res);
  assert.equal(res.code, 200);
  assert.equal(create.mock.callCount(), 1);
});
