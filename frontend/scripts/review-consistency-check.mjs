import { chromium } from "@playwright/test";
import { preview } from "vite";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

// All API requests are intercepted. No member records, notifications or insurer requests are sent.
const server = await preview({ preview: { host: "127.0.0.1", port: 4185, strictPort: true } });
const browser = await chromium.launch({
  channel: process.platform === "win32" ? "msedge" : undefined,
  headless: true,
});
const fixture = (id) => ({
  id,
  fullName: `Test Member ${id}`,
  controllerId: `TEST${id}`,
  status: "PENDING",
  school: "Current School",
  ghanaCardId: "GHA-123456789-0",
  phone: null,
  phoneVerifiedAt: null,
  report20Matched: true,
  employmentCategory: "TEACHING",
  createdAt: "2026-10-29T10:00:00Z",
  spouse: null,
  beneficiaries: [],
  _count: { beneficiaries: 0 },
  district: { id: 1, name: "Test District", region: { id: 1, name: "Test Region" } },
  createdBy: null,
});
const initialRequest = {
  id: 42,
  member: fixture(1),
  type: "MEMBER_DETAILS",
  status: "PENDING",
  proposedData: { school: "New School" },
  requestedAt: "2026-10-29T10:00:00Z",
  requestedBy: null,
  reviewedBy: null,
  reviewedAt: null,
  reviewNote: null,
  requestNote: null,
};
await fs.mkdir("test-results/consistency", { recursive: true });
const results = [];
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let members = Array.from({ length: 11 }, (_, index) => fixture(index + 1));
    let requests = [{ ...initialRequest }];
    let failList = false,
      failDetail = false,
      failReview = true,
      mutations = 0;
    const statusesRequested = [];
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url()),
        path = url.pathname;
      let body = { success: true, data: [] };
      if (path.endsWith("/auth/refresh"))
        body = {
          accessToken: "mock",
          user: {
            id: 1,
            fullName: "Test Administrator",
            email: "test@example.test",
            role: "SUPER_ADMIN",
          },
        };
      else if (path.endsWith("/member-auth/refresh"))
        body = { accessToken: "mock", member: fixture(1) };
      else if (path.endsWith("/public/settings/branding"))
        return route.fulfill({ status: 503, json: {} });
      else if (path.endsWith("/notifications/unread-count")) body.data = { count: 0 };
      else if (path.endsWith("/members/stats"))
        body.data = {
          totalMembers: 11,
          newThisMonth: 11,
          activeCoverage: 0,
          activeCoveragePct: 0,
          registeredMembers: 0,
          report20Mismatch: 0,
          removedThisMonth: 0,
          removedBreakdownNote: "No removals",
        };
      else if (path.endsWith("/members/bulk/approve") || path.endsWith("/members/bulk/return")) {
        if (failReview)
          return route.fulfill({
            status: 503,
            json: { message: "Review service is unavailable. Please try again." },
          });
        mutations++;
        const ids = route.request().postDataJSON().memberIds;
        members = members.filter((member) => !ids.includes(member.id));
        body.data = { requested: ids.length, succeeded: ids.length, failed: 0, results: [] };
      } else if (path.endsWith("/members")) {
        if (failList) return route.fulfill({ status: 503, json: { message: "Unavailable" } });
        const current = Number(url.searchParams.get("page") || 1),
          limit = Number(url.searchParams.get("limit") || 10);
        body = {
          success: true,
          data: members.slice((current - 1) * limit, current * limit),
          pagination: {
            total: members.length,
            totalPages: Math.max(1, Math.ceil(members.length / limit)),
          },
        };
      } else if (/\/change-requests\/\d+\/review$/.test(path)) {
        if (failReview)
          return route.fulfill({
            status: 503,
            json: { message: "Review service is unavailable. Please try again." },
          });
        const input = route.request().postDataJSON();
        mutations++;
        requests = requests.map((item) => ({
          ...item,
          status:
            input.action === "RETURN"
              ? "RETURNED"
              : input.action === "REJECT"
                ? "REJECTED"
                : "APPROVED",
          reviewNote: input.note,
        }));
      } else if (path.endsWith("/change-requests")) {
        if (failList) return route.fulfill({ status: 503, json: { message: "Unavailable" } });
        const status = url.searchParams.get("status");
        statusesRequested.push(status);
        const matching = requests.filter((item) => !status || item.status === status);
        body = {
          success: true,
          data: matching,
          pagination: { total: matching.length, totalPages: 1 },
        };
      } else if (/\/members\/\d+$/.test(path)) {
        if (failDetail) return route.fulfill({ status: 503, json: { message: "Unavailable" } });
        body.data = fixture(Number(path.split("/").at(-1)));
      }
      await route.fulfill({ json: body });
    });
    const open = (path) => page.goto(`http://127.0.0.1:4185${path}`);
    const settle = () =>
      page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
    const check = async (name) => {
      await page.evaluate(() => document.fonts.ready);
      for (const zoom of [1, 2]) {
        await page.evaluate((value) => {
          document.documentElement.style.zoom = String(value);
        }, zoom);
        await settle();
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
          false,
          `${name} page overflow ${width}/${zoom}`,
        );
        const dialog = page.getByRole("dialog");
        if (await dialog.count()) {
          const box = await dialog.boundingBox();
          assert.ok(
            box && box.y >= -1 && box.y + box.height <= 901,
            `${name} dialog must fit viewport`,
          );
        }
      }
      await page.evaluate(() => {
        document.documentElement.style.zoom = "1";
      });
      await settle();
      if (await page.getByRole("dialog").count())
        await page.getByRole("dialog").evaluate((element) => {
          element.scrollTop = 0;
        });
      await page.screenshot({
        path: `test-results/consistency/${name}-${width}.png`,
        fullPage: true,
      });
    };
    const choose = async (label, action) => {
      const trigger = page.getByRole("button", { name: label, exact: true });
      await trigger.scrollIntoViewIfNeeded();
      await settle();
      await trigger.click();
      await page.getByRole("menuitem", { name: action, exact: true }).click();
    };
    await open("/approvals?page=2");
    await page.getByRole("button", { name: "Actions for Test Member 11", exact: true }).waitFor();
    assert.equal(await page.getByRole("table").locator("tbody tr td").nth(1).textContent(), "11");
    await choose("Actions for Test Member 11", "Review");
    await page.getByRole("button", { name: "Approve member", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: "Approve 1 member", exact: true });
    await dialog.getByRole("button", { name: "Approve members", exact: true }).click();
    await dialog.getByRole("alert").waitFor();
    await check("member-approval-error");
    failReview = false;
    await dialog.getByRole("button", { name: "Approve members", exact: true }).click();
    await page.getByRole("button", { name: "Actions for Test Member 1", exact: true }).waitFor();
    assert.equal(await page.getByRole("table").locator("tbody tr td").nth(1).textContent(), "1");
    await check("pending-members-numbered");
    await page.getByRole("checkbox", { name: "Select Test Member 1", exact: true }).check();
    await page.getByRole("button", { name: "Return for correction", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Return 1 member for correction", exact: true });
    assert.ok(
      await dialog.getByRole("button", { name: "Confirm return", exact: true }).isDisabled(),
    );
    await dialog.getByLabel(/Review note/).fill("Please complete the identity details.");
    await check("member-correction-dialog");
    await page.keyboard.press("Escape");
    await open("/members");
    await page.getByRole("button", { name: "Actions for Test Member 1", exact: true }).waitFor();
    const memberActions = page.getByRole("button", {
      name: "Actions for Test Member 1",
      exact: true,
    });
    await memberActions.scrollIntoViewIfNeeded();
    await settle();
    await memberActions.click();
    assert.equal(
      await page
        .getByRole("menuitem", { name: "Review workflow", exact: true })
        .getAttribute("href"),
      `/members/1?returnTo=${encodeURIComponent("/members#member-1")}#workflow`,
    );
    await page.keyboard.press("Escape");
    failDetail = true;
    await open("/change-requests");
    await page.getByText(/The current member details could not be loaded/).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Actions for request 42", exact: true }).count(),
      0,
    );
    failDetail = false;
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await page.getByRole("button", { name: "Actions for request 42", exact: true }).waitFor();
    await page.getByRole("button", { name: "Filter by status", exact: true }).click();
    await page.getByRole("option", { name: "All statuses", exact: true }).click();
    await page.getByRole("button", { name: "Actions for request 42", exact: true }).waitFor();
    assert.equal(statusesRequested.at(-1), null);
    failReview = true;
    await choose("Actions for request 42", "Return for correction");
    dialog = page.getByRole("dialog", {
      name: "Return change request for correction",
      exact: true,
    });
    await dialog.getByLabel(/Review note/).fill("Confirm the proposed school.");
    await dialog.getByRole("button", { name: "Confirm return", exact: true }).click();
    await dialog.getByRole("alert").waitFor();
    await check("change-request-review-error");
    assert.equal(
      await dialog.getByLabel(/Review note/).inputValue(),
      "Confirm the proposed school.",
    );
    failReview = false;
    await dialog.getByRole("button", { name: "Confirm return", exact: true }).click();
    await page
      .getByText("Request for Test Member 1 reviewed successfully.", { exact: true })
      .waitFor();
    await check("reviewed-change-request");
    failList = true;
    await open("/change-requests");
    await page.getByRole("alert").waitFor();
    assert.equal(await page.getByText("No requests found", { exact: true }).count(), 0);
    await check("request-service-error");
    failList = false;
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await page.getByText("No requests found", { exact: true }).waitFor();
    await check("request-empty-results");
    assert.deepEqual(errors, []);
    assert.equal(mutations, 2);
    results.push({ width, errors, mockedMutations: mutations });
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
console.log(JSON.stringify(results, null, 2));
