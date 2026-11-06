import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { stub } from "../../test/fixtures.js";
import { memberSearchWhere, phoneSearchTerms } from "./member.search.js";
import { resolveMemberSearchScope } from "./member.access.js";

test("phone queries normalize punctuation and Ghana local and international forms", () => {
  assert.deepEqual(phoneSearchTerms("024 400-0000"), ["0244000000", "233244000000"]);
  assert.deepEqual(phoneSearchTerms("+233 (24) 400 0000"), ["233244000000", "0244000000"]);
  assert.deepEqual(phoneSearchTerms("00233244000000"), [
    "00233244000000",
    "233244000000",
    "0244000000",
  ]);
  assert.deepEqual(phoneSearchTerms("024"), ["024"]);
  assert.deepEqual(phoneSearchTerms("GHA-123456789-0"), []);
  assert.deepEqual(phoneSearchTerms("Ama Member"), []);
});

test("text and staff ID searches stay case insensitive without querying normalized phones", async (t) => {
  stub(t, prisma, "$queryRaw", async () =>
    assert.fail("non-phone search must not scan phone values"),
  );
  const where = await memberSearchWhere("  gnatnt1234  ", { kind: "district", districtIds: [9] });
  assert.deepEqual(where.OR, [
    { fullName: { contains: "gnatnt1234", mode: "insensitive" } },
    { controllerId: { contains: "gnatnt1234", mode: "insensitive" } },
    { ghanaCardId: { contains: "gnatnt1234", mode: "insensitive" } },
    { school: { contains: "gnatnt1234", mode: "insensitive" } },
    { phone: { contains: "gnatnt1234" } },
  ]);
  assert.deepEqual(await memberSearchWhere("  ", { kind: "all" }), {});
});

test("short phone fragments and numeric staff IDs use the ordinary member search", async (t) => {
  stub(t, prisma, "$queryRaw", async () =>
    assert.fail("short searches must not scan normalized phones"),
  );
  const where = await memberSearchWhere("024", { kind: "all" });
  assert.ok(
    Array.isArray(where.OR) &&
      where.OR.some((clause) => JSON.stringify(clause).includes('"phone":{"contains":"024"}')),
  );
  await memberSearchWhere("1547671", { kind: "district", districtIds: [9] });
});

test("formatted-phone lookup is parameterized and retains district scope", async (t) => {
  stub(t, prisma, "$queryRaw", async (query: Prisma.Sql) => {
    assert.match(query.sql, /district_id = ANY/);
    assert.match(query.sql, /regexp_replace\(phone/);
    assert.deepEqual(query.values, [[9], "%0244000000%", "%233244000000%"]);
    assert.equal(query.sql.includes("0244000000"), false);
    return [{ id: 42 }];
  });
  const scope = resolveMemberSearchScope(
    { id: 1, role: "DISTRICT_ADMIN", districtIds: [9], regionIds: [] } as never,
    { districtId: 88 },
  );
  assert.deepEqual(scope, { kind: "district", districtIds: [9] });
  const where = await memberSearchWhere("024 400-0000", scope);
  assert.ok(
    Array.isArray(where.OR) &&
      where.OR.some((clause) => JSON.stringify(clause) === '{"id":{"in":[42]}}'),
  );
});

test("a scoped admin with an empty district array matches nothing through the raw-SQL path", async (t) => {
  stub(t, prisma, "$queryRaw", async (query: Prisma.Sql) => {
    assert.deepEqual(query.values[0], []);
    return [];
  });
  const scope = resolveMemberSearchScope(
    { id: 1, role: "DISTRICT_ADMIN", districtIds: [], regionIds: [] } as never,
    {},
  );
  assert.deepEqual(scope, { kind: "district", districtIds: [] });
  await memberSearchWhere("0244000000", scope);
});

test("regional phone lookup uses the admin's own regions when no explicit district is given", async (t) => {
  stub(t, prisma, "$queryRaw", async (query: Prisma.Sql) => {
    assert.match(query.sql, /region_id = ANY/);
    assert.deepEqual(query.values[0], [3]);
    return [];
  });
  const scope = resolveMemberSearchScope(
    { id: 1, role: "REGIONAL_ADMIN", regionIds: [3], districtIds: [] } as never,
    {},
  );
  assert.deepEqual(scope, { kind: "region", regionIds: [3] });
  await memberSearchWhere("0244000000", scope);
});

test("unexpected search characters never become executable phone SQL", async (t) => {
  stub(t, prisma, "$queryRaw", async () =>
    assert.fail("non-numeric input must remain an ORM value"),
  );
  const where = await memberSearchWhere("' OR 1=1 --", { kind: "district", districtIds: [9] });
  assert.ok(JSON.stringify(where).includes("' OR 1=1 --"));
});
