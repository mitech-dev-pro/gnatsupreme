import assert from "node:assert/strict";
import test from "node:test";

import { stub, postHandler, routeHandler } from "../../test/fixtures.js";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { memberRouter } from "./member.routes.js";

function response() {
  return {
    locals: {
      user: { id: 1, role: "SUPER_ADMIN", districtId: null, regionId: null },
    },
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

const payload = {
  controllerId: "GNATNT2020001",
  fullName: "Test NonTeaching",
  school: "Test School",
  gender: "MALE",
  employmentCategory: "NON_TEACHING",
  placeOfWork: "Head Office",
  regionId: 1,
  beneficiaries: [],
};

test("a concurrent enrollment racing on the same unique field gets a clean 409, not a 500", async (t) => {
  stub(t, prisma.member, "findUnique", async () => null);
  stub(t, prisma, "$transaction", async (callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma),
  );
  stub(t, prisma.member, "create", async () => {
    throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["controller_id"] },
    });
  });
  const res = response();
  await postHandler(memberRouter, "/")({ body: payload }, res);
  assert.equal(res.code, 409);
  assert.match((res.body as { message: string }).message, /Controller ID/i);
});

test("switching a member to TEACHING via PATCH requires an existing beneficiary", async (t) => {
  stub(t, prisma.member, "findFirst", async () => ({
    id: 5,
    controllerId: "GNATNT2020002",
    employmentCategory: "NON_TEACHING",
    // Already has a district on file, so the pre-existing "Select a district" check passes
    // without this PATCH needing to also supply one -- isolates this test to the beneficiary
    // rule specifically.
    districtId: 4,
    district: { regionId: 2 },
    beneficiaries: [],
  }));
  const res = response();
  await routeHandler(
    memberRouter,
    "/:id",
    "patch",
  )({ params: { id: "5" }, body: { employmentCategory: "TEACHING" } }, res);
  assert.equal(res.code, 400);
  assert.match((res.body as { message: string }).message, /beneficiary/i);
});
