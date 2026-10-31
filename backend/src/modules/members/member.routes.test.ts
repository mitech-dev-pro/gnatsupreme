import assert from "node:assert/strict";
import test from "node:test";

import { stub, postHandler } from "../../test/fixtures.js";
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
