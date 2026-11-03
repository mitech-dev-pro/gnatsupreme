import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { stub } from "../../test/fixtures.js";
import { memberSearchWhere, phoneSearchTerms } from "./member.search.js";
import { resolveMemberScope } from "./member.access.js";

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
  const where = await memberSearchWhere("  gnatnt1234  ", { districtId: 9 });
  assert.deepEqual(where.OR, [
    { fullName: { contains: "gnatnt1234", mode: "insensitive" } },
    { controllerId: { contains: "gnatnt1234", mode: "insensitive" } },
    { ghanaCardId: { contains: "gnatnt1234", mode: "insensitive" } },
    { school: { contains: "gnatnt1234", mode: "insensitive" } },
    { phone: { contains: "gnatnt1234" } },
  ]);
  assert.deepEqual(await memberSearchWhere("  ", {}), {});
});

test("short phone fragments and numeric staff IDs use the ordinary member search", async (t) => {
  stub(t, prisma, "$queryRaw", async () =>
    assert.fail("short searches must not scan normalized phones"),
  );
  const where = await memberSearchWhere("024", {});
  assert.ok(
    Array.isArray(where.OR) &&
      where.OR.some((clause) => JSON.stringify(clause).includes('"phone":{"contains":"024"}')),
  );
  await memberSearchWhere("1547671", { districtId: 9 });
});

test("formatted-phone lookup is parameterized and retains district scope", async (t) => {
  stub(t, prisma, "$queryRaw", async (query: Prisma.Sql) => {
    assert.match(query.sql, /district_id = \?/);
    assert.match(query.sql, /regexp_replace\(phone/);
    assert.deepEqual(query.values, [9, "%0244000000%", "%233244000000%"]);
    assert.equal(query.sql.includes("0244000000"), false);
    return [{ id: 42 }];
  });
  const scope = resolveMemberScope(
    { id: 1, role: "DISTRICT_ADMIN", districtId: 9, regionId: null } as never,
    { districtId: 88 },
  );
  assert.deepEqual(scope, { districtId: 9 });
  const where = await memberSearchWhere("024 400-0000", scope);
  assert.ok(
    Array.isArray(where.OR) &&
      where.OR.some((clause) => JSON.stringify(clause) === '{"id":{"in":[42]}}'),
  );
});

test("regional phone lookup keeps its own region alongside a district filter", async (t) => {
  stub(t, prisma, "$queryRaw", async (query: Prisma.Sql) => {
    assert.deepEqual(query.values.slice(0, 2), [88, 3]);
    return [];
  });
  const scope = resolveMemberScope(
    { id: 1, role: "REGIONAL_ADMIN", regionId: 3, districtId: null } as never,
    { districtId: 88, regionId: 4 },
  );
  await memberSearchWhere("0244000000", scope);
});

test("unexpected search characters never become executable phone SQL", async (t) => {
  stub(t, prisma, "$queryRaw", async () =>
    assert.fail("non-numeric input must remain an ORM value"),
  );
  const where = await memberSearchWhere("' OR 1=1 --", { districtId: 9 });
  assert.ok(JSON.stringify(where).includes("' OR 1=1 --"));
});
