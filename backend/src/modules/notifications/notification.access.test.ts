import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { routeHandler, stub } from "../../test/fixtures.js";
import { memberNotificationRouter } from "./member-notification.routes.js";

function response() {
  return {
    locals: { member: { id: 7 } },
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
test("member notification links and unread counts are restricted to their owner", async (t) => {
  stub(t, prisma.notification, "findMany", async (args: Prisma.NotificationFindManyArgs) => {
    assert.equal(args.where?.memberId, 7);
    assert.equal(args.where?.channel, "IN_APP");
    assert.equal(args.select?.actionUrl, true);
    return [{ id: 1, actionUrl: "/member/claims/42/resubmit" }];
  });
  stub(t, prisma.notification, "count", async (args: Prisma.NotificationCountArgs) => {
    assert.deepEqual(args.where, { memberId: 7, channel: "IN_APP", readAt: null });
    return 125;
  });
  const res = response();
  await routeHandler(memberNotificationRouter, "/notifications")({}, res);
  assert.equal((res.body as { unreadCount: number }).unreadCount, 125);
});
test("a member cannot mark another member's notification as read", async (t) => {
  stub(t, prisma.notification, "updateMany", async (args: Prisma.NotificationUpdateManyArgs) => {
    assert.deepEqual(args.where, { id: 42, memberId: 7, channel: "IN_APP" });
    return { count: 0 };
  });
  const res = response();
  await routeHandler(memberNotificationRouter, "/notifications/:id/read")(
    { params: { id: "42" } },
    res,
  );
  assert.equal(res.code, 404);
});
