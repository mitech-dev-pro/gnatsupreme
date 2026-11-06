import assert from "node:assert/strict";
import test from "node:test";
import { Redis } from "ioredis";

import { stub, postHandler, routeHandler } from "../../test/fixtures.js";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { memberRouter } from "./member.routes.js";

// Prevents invalidateMemberAuth()'s cache delete from attempting a real connection to Redis --
// same rationale as user.routes.test.ts's stubCache().
function stubCache(t: Parameters<typeof stub>[0]) {
  stub(t, Redis.prototype, "connect", async () => undefined);
  stub(t, Redis.prototype, "del", async () => 1);
}

function response(user: object = { id: 1, role: "SUPER_ADMIN", districtIds: [], regionIds: [] }) {
  return {
    locals: { user },
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

test("creating a member as a multi-district DISTRICT_ADMIN supplying a district outside their own districts is rejected", async () => {
  const res = response({ id: 2, role: "DISTRICT_ADMIN", districtIds: [4, 5], regionIds: [2, 3] });
  await postHandler(memberRouter, "/")(
    { body: { ...payload, employmentCategory: "NON_TEACHING", districtId: 99 } },
    res,
  );
  assert.equal(res.code, 400);
  assert.match((res.body as { message: string }).message, /cannot enroll members in this district/i);
});

test("creating a member as a multi-region REGIONAL_ADMIN with no region picked is rejected", async () => {
  const res = response({ id: 3, role: "REGIONAL_ADMIN", districtIds: [], regionIds: [2, 3] });
  await postHandler(memberRouter, "/")(
    { body: { ...payload, employmentCategory: "NON_TEACHING", regionId: undefined } },
    res,
  );
  assert.equal(res.code, 400);
  assert.match((res.body as { message: string }).message, /select which of your regions/i);
});

test("a single-district DISTRICT_ADMIN creating a member with a districtId that doesn't match their own district still succeeds with their own district forced", async (t) => {
  stub(t, prisma.member, "findUnique", async () => null);
  stub(t, prisma.district, "findUnique", async ({ where }: { where: { id: number } }) =>
    where.id === 4 ? { id: 4, regionId: 2 } : null,
  );
  stub(t, prisma, "$transaction", async (callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma),
  );
  let createdDistrictId: number | null | undefined;
  stub(
    t,
    prisma.member,
    "create",
    async (args: { data: Record<string, unknown> }) => {
      createdDistrictId = args.data.districtId as number | null;
      return {
        id: 10,
        controllerId: payload.controllerId,
        fullName: payload.fullName,
        school: payload.school,
        status: "PENDING",
        districtId: args.data.districtId,
        regionId: args.data.regionId,
        spouse: null,
        beneficiaries: [],
        ghanaCardId: null,
      };
    },
  );
  stub(t, prisma.auditLog, "create", async () => ({}));
  // relinkSpousesForMember runs unconditionally after create, and districtAdminOwnRegionIds
  // (called regardless of how districtId was resolved) looks up the admin's own districts --
  // stub both so this test never opens a real database connection.
  stub(t, prisma.spouse, "findMany", async () => []);
  stub(t, prisma.district, "findMany", async () => [{ regionId: 2 }]);
  const res = response({ id: 2, role: "DISTRICT_ADMIN", districtIds: [4], regionIds: [2] });
  await postHandler(memberRouter, "/")(
    { body: { ...payload, employmentCategory: "NON_TEACHING", districtId: 999 } },
    res,
  );
  assert.equal(res.code, 201);
  assert.equal(createdDistrictId, 4);
});

test("a DISTRICT_ADMIN updating a member with an explicit districtId: null keeps the member's existing district", async (t) => {
  stubCache(t);
  stub(t, prisma.member, "findFirst", async () => ({
    id: 6,
    controllerId: "GNATNT2020003",
    email: null,
    ghanaCardId: null,
    employmentCategory: "TEACHING",
    districtId: 4,
    district: { regionId: 2 },
    regionId: null,
    beneficiaries: [{ id: 1 }],
  }));
  stub(t, prisma, "$transaction", async (callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma),
  );
  let updateData: Record<string, unknown> | undefined;
  stub(t, prisma.member, "update", async (args: { data: Record<string, unknown> }) => {
    updateData = args.data;
    return {
      id: 6,
      controllerId: "GNATNT2020003",
      employmentCategory: "NON_TEACHING",
      districtId: 4,
      spouse: null,
    };
  });
  stub(t, prisma.auditLog, "create", async () => ({}));
  // districtAdminOwnRegionIds is called regardless of how districtId was resolved -- stub it so
  // this test never opens a real database connection.
  stub(t, prisma.district, "findMany", async () => [{ regionId: 2 }]);
  const res = response({ id: 2, role: "DISTRICT_ADMIN", districtIds: [4], regionIds: [2] });
  await routeHandler(
    memberRouter,
    "/:id",
    "patch",
  )(
    {
      params: { id: "6" },
      body: { employmentCategory: "NON_TEACHING", placeOfWork: "Head Office", districtId: null },
    },
    res,
  );
  assert.equal(res.code, 200);
  // Prisma treats an explicit `undefined` value the same as an omitted key -- it never touches
  // the column, so the member's existing district stays as-is. (The substitution sets the key's
  // *value* to undefined, not delete the key -- an `in` check would wrongly fail here.)
  assert.equal(updateData?.districtId, undefined);
});

test("updating a district-less member as a multi-region REGIONAL_ADMIN without touching the region keeps the existing region", async (t) => {
  stubCache(t);
  stub(t, prisma.member, "findFirst", async () => ({
    id: 7,
    controllerId: "GNATNT2020004",
    email: null,
    ghanaCardId: null,
    employmentCategory: "NON_TEACHING",
    districtId: null,
    district: null,
    regionId: 3,
    placeOfWork: "Old place",
    beneficiaries: [],
  }));
  stub(t, prisma, "$transaction", async (callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma),
  );
  let updateData: Record<string, unknown> | undefined;
  stub(t, prisma.member, "update", async (args: { data: Record<string, unknown> }) => {
    updateData = args.data;
    return { id: 7, employmentCategory: "NON_TEACHING", regionId: 3, spouse: null };
  });
  stub(t, prisma.auditLog, "create", async () => ({}));
  const res = response({ id: 3, role: "REGIONAL_ADMIN", districtIds: [], regionIds: [3, 7] });
  await routeHandler(
    memberRouter,
    "/:id",
    "patch",
  )({ params: { id: "7" }, body: { placeOfWork: "New place" } }, res);
  assert.equal(res.code, 200);
  assert.equal(updateData?.regionId, 3);
});

test("updating a member's district as a multi-district DISTRICT_ADMIN to one outside their own districts is rejected", async (t) => {
  stub(t, prisma.member, "findFirst", async () => ({
    id: 8,
    controllerId: "GNATNT2020005",
    districtId: 4,
    district: { regionId: 2 },
  }));
  const res = response({ id: 2, role: "DISTRICT_ADMIN", districtIds: [4, 5], regionIds: [2, 3] });
  await routeHandler(
    memberRouter,
    "/:id",
    "patch",
  )({ params: { id: "8" }, body: { districtId: 99 } }, res);
  assert.equal(res.code, 403);
  assert.match((res.body as { message: string }).message, /cannot move this member/i);
});
