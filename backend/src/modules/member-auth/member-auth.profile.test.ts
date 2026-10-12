import assert from "node:assert/strict";
import test from "node:test";
import { publicMember } from "./member-auth.profile.js";

test("public member projection excludes credentials and private fields", () => {
  const record = {
    id: 1,
    controllerId: "123456",
    fullName: "Test Member",
    status: "ACTIVE",
    passwordHash: "private",
    phone: "private",
  };
  assert.deepEqual(publicMember(record), {
    id: 1,
    controllerId: "123456",
    fullName: "Test Member",
    status: "ACTIVE",
  });
});
