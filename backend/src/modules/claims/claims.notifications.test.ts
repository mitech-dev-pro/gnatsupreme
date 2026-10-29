import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "../../generated/prisma/client.js";
import { stub } from "../../test/fixtures.js";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { notifyClaimReview } from "./claims.notifications.js";

const review = {
  claimId: 42,
  memberId: 7,
  reviewedAt: new Date("2026-10-29T16:00:00Z"),
  note: "Please check the report",
};
for (const action of ["APPROVE", "RETURN", "REJECT"] as const) {
  test(`${action} review creates only an in-app notification for the claim owner`, async (t) => {
    const phoneLookup = stub(t, prisma.member, "findUnique", async () =>
      assert.fail("in-app-only notification must not read SMS contact details"),
    );
    const write = stub(
      t,
      prisma.notification,
      "upsert",
      async (args: Prisma.NotificationUpsertArgs) => {
        assert.equal(args.create.channel, "IN_APP");
        assert.equal(args.create.memberId, 7);
        assert.equal(args.create.userId, undefined);
        assert.ok(args.create.message.includes(review.note));
        assert.equal(
          args.create.actionUrl,
          action === "RETURN" ? "/member/claims/42/resubmit" : "/member/claims#claim-42",
        );
        if (action === "APPROVE") {
          assert.match(args.create.title, /forwarded/);
          assert.match(args.create.message, /not approval of payment/);
        }
        if (action === "REJECT") assert.match(args.create.title, /by GNAT/);
        return {};
      },
    );
    await notifyClaimReview({ ...review, action, deliveryState: "ACCEPTED" });
    assert.equal(write.mock.callCount(), 1);
    assert.equal(phoneLookup.mock.callCount(), 0);
  });
}

test("approval with unconfirmed delivery does not say the claim was forwarded", async (t) => {
  stub(t, prisma.notification, "upsert", async (args: Prisma.NotificationUpsertArgs) => {
    assert.equal(args.create.title, "Claim approved for forwarding");
    assert.match(args.create.message, /receipt by Mankrado is not yet confirmed/);
    return {};
  });
  await notifyClaimReview({ ...review, action: "APPROVE", deliveryState: "UNKNOWN" });
});

test("notification upserts deduplicate a review but allow a later review cycle", async (t) => {
  const records = new Set();
  stub(t, prisma.notification, "upsert", async (args: Prisma.NotificationUpsertArgs) => {
    assert.deepEqual(args.update, {});
    records.add(args.where.idempotencyKey);
    return {};
  });
  await notifyClaimReview({ ...review, action: "RETURN" });
  await notifyClaimReview({ ...review, action: "RETURN" });
  assert.equal(records.size, 1);
  await notifyClaimReview({
    ...review,
    action: "RETURN",
    reviewedAt: new Date("2026-10-30T16:00:00Z"),
  });
  assert.equal(records.size, 2);
});

test("confirmed forwarding is notified only once even after a later delivery retry", async (t) => {
  const keys = new Set();
  stub(t, prisma.notification, "upsert", async (args: Prisma.NotificationUpsertArgs) => {
    keys.add(args.where.idempotencyKey);
    return {};
  });
  await notifyClaimReview({ ...review, action: "APPROVE", deliveryState: "ACCEPTED" });
  await notifyClaimReview({
    ...review,
    action: "APPROVE",
    deliveryState: "ACCEPTED",
    reviewedAt: new Date(),
  });
  assert.equal(keys.size, 1);
});

test("notification failures are logged without failing a completed review", async (t) => {
  stub(t, prisma.notification, "upsert", async () => {
    throw new Error("storage unavailable");
  });
  const logged = t.mock.method(logger, "error", () => undefined);
  await assert.doesNotReject(notifyClaimReview({ ...review, action: "REJECT" }));
  assert.equal(logged.mock.callCount(), 1);
});
