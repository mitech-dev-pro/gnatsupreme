import assert from "node:assert/strict";
import test from "node:test";

import { prisma } from "./prisma.js";
import { stub } from "../test/fixtures.js";
import { canAccessDistrict, geoScopeWhere } from "./geo-scope.js";

test("an empty region/district array yields a where fragment that matches nothing, not an unfiltered query", () => {
  assert.deepEqual(
    geoScopeWhere({ role: "REGIONAL_ADMIN", regionIds: [], districtIds: [] } as never),
    { regionId: { in: [] } },
  );
  assert.deepEqual(
    geoScopeWhere({ role: "DISTRICT_ADMIN", regionIds: [], districtIds: [] } as never),
    { districtId: { in: [] } },
  );
});

test("an unrecognized role denies by default rather than falling through to an unfiltered query", () => {
  assert.deepEqual(
    geoScopeWhere({ role: "SOMETHING_ELSE", regionIds: [1], districtIds: [1] } as never),
    { districtId: { in: [] } },
  );
});

test("SUPER_ADMIN/NATIONAL_ADMIN see an unfiltered scope", () => {
  assert.deepEqual(geoScopeWhere({ role: "SUPER_ADMIN" } as never), {});
  assert.deepEqual(geoScopeWhere({ role: "NATIONAL_ADMIN" } as never), {});
});

test("geoScopeWhere returns the multi-value array scope, not a single id", () => {
  assert.deepEqual(
    geoScopeWhere({ role: "REGIONAL_ADMIN", regionIds: [3, 7], districtIds: [] } as never),
    { regionId: { in: [3, 7] } },
  );
  assert.deepEqual(
    geoScopeWhere({ role: "DISTRICT_ADMIN", regionIds: [], districtIds: [9, 11] } as never),
    { districtId: { in: [9, 11] } },
  );
});

test("canAccessDistrict is array-aware for DISTRICT_ADMIN", async () => {
  const user = { role: "DISTRICT_ADMIN", districtIds: [9, 11], regionIds: [] } as never;
  assert.equal(await canAccessDistrict(user, 9), true);
  assert.equal(await canAccessDistrict(user, 11), true);
  assert.equal(await canAccessDistrict(user, 12), false);
});

test("canAccessDistrict is array-aware for REGIONAL_ADMIN, checked against the district's region", async (t) => {
  stub(t, prisma.district, "findUnique", async ({ where }: { where: { id: number } }) =>
    where.id === 9 ? { regionId: 3 } : where.id === 20 ? { regionId: 99 } : null,
  );
  const user = { role: "REGIONAL_ADMIN", regionIds: [3, 7], districtIds: [] } as never;
  assert.equal(await canAccessDistrict(user, 9), true);
  assert.equal(await canAccessDistrict(user, 20), false);
});

test("canAccessDistrict denies by default for an unrecognized role", async () => {
  const user = { role: "SOMETHING_ELSE", regionIds: [1], districtIds: [1] } as never;
  assert.equal(await canAccessDistrict(user, 1), false);
});
