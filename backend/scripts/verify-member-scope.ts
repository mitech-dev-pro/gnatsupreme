import assert from "node:assert/strict";

import { resolveMemberScope } from "../src/modules/members/member.access.js";
import type { AuthenticatedUser } from "../src/middleware/authenticate.js";

// Pure-function containment checks for resolveMemberScope — no server or DB needed. Run with:
//   npx tsx scripts/verify-member-scope.ts
// This guards the security-relevant boundary that stops a scoped admin from widening their
// access via a crafted regionId/districtId query param on the Members list.

function user(overrides: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    id: 1,
    fullName: "Test User",
    email: "test@example.com",
    role: "DISTRICT_ADMIN",
    regionId: null,
    districtId: null,
    ...overrides,
  };
}

let passed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, name);
  passed += 1;
  console.log(`ok - ${name}`);
}

// REGIONAL_ADMIN + an out-of-region districtId must stay ANDed with their own region, not widen.
check(
  "REGIONAL_ADMIN with out-of-region districtId stays contained to own region",
  resolveMemberScope(user({ role: "REGIONAL_ADMIN", regionId: 5 }), { districtId: 999 }),
  { districtId: 999, district: { regionId: 5 } },
);

// REGIONAL_ADMIN with no filters gets their fixed region scope.
check(
  "REGIONAL_ADMIN with no filters is scoped to own region",
  resolveMemberScope(user({ role: "REGIONAL_ADMIN", regionId: 5 })),
  { district: { regionId: 5 } },
);

// DISTRICT_ADMIN can never override their own fixed district via any query param.
check(
  "DISTRICT_ADMIN districtId override attempt is ignored",
  resolveMemberScope(user({ role: "DISTRICT_ADMIN", districtId: 12 }), { districtId: 999, regionId: 999 }),
  { districtId: 12 },
);
check(
  "DISTRICT_ADMIN with no filters is scoped to own district",
  resolveMemberScope(user({ role: "DISTRICT_ADMIN", districtId: 12 })),
  { districtId: 12 },
);

// SUPER_ADMIN/NATIONAL_ADMIN are unrestricted; districtId wins over regionId when both are set.
check(
  "SUPER_ADMIN with no filters is unrestricted",
  resolveMemberScope(user({ role: "SUPER_ADMIN" })),
  {},
);
check(
  "SUPER_ADMIN with regionId only scopes to that region",
  resolveMemberScope(user({ role: "SUPER_ADMIN" }), { regionId: 7 }),
  { district: { regionId: 7 } },
);
check(
  "SUPER_ADMIN with both districtId and regionId: districtId wins, regionId is inert",
  resolveMemberScope(user({ role: "SUPER_ADMIN" }), { districtId: 3, regionId: 7 }),
  { districtId: 3 },
);
check(
  "NATIONAL_ADMIN with districtId only",
  resolveMemberScope(user({ role: "NATIONAL_ADMIN" }), { districtId: 3 }),
  { districtId: 3 },
);

console.log(`\n${passed} checks passed.`);
