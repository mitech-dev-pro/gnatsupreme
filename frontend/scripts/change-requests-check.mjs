import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "@playwright/test";
import { preview } from "vite";

const server = await preview({ preview: { host: "127.0.0.1", port: 4187, strictPort: true } });
const browser = await chromium.launch({
  channel: process.platform === "win32" ? "msedge" : undefined,
  headless: true,
});
const stamp = "2026-10-29T12:00:00.000Z";
const results = [];
await fs.mkdir("test-results/change-requests", { recursive: true });
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const member = {
      id: 7,
      controllerId: "TEST1234",
      fullName: "Test Member",
      school: "Current School",
      phone: null,
      ghanaCardId: "GHA-123456789-0",
      status: "ACTIVE",
      spouse: null,
      beneficiaries: [],
      district: { id: 9, name: "Test District", region: { id: 3, name: "Test Region" } },
    };
    let items = Array.from({ length: 12 }, (_, index) => ({
      id: 100 - index,
      memberId: 7,
      member,
      type: "MEMBER_DETAILS",
      targetBeneficiaryId: null,
      status: index === 11 ? "RETURNED" : "APPROVED",
      proposedData: { school: index === 11 ? "Proposed School" : "Other School" },
      requestNote: null,
      reviewNote: index === 11 ? "Use the full school name." : null,
      reviewedBy: null,
      requestedBy: null,
      requestedAt: stamp,
      reviewedAt: stamp,
      updatedAt: stamp,
    }));
    let failRefresh = false,
      failCorrection = true,
      mutations = 0;
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url()),
        path = url.pathname,
        input = route.request().postDataJSON();
      let body = { success: true, data: [] };
      if (path.endsWith("/auth/refresh"))
        body = {
          accessToken: "mock",
          user: { id: 1, role: "SUPER_ADMIN", fullName: "Test Administrator" },
        };
      else if (path.endsWith("/member-auth/refresh")) body = { accessToken: "mock", member };
      else if (path.endsWith("/public/settings/branding"))
        return route.fulfill({ status: 503, json: {} });
      else if (path.endsWith("/member-portal/profile"))
        body.data = {
          member,
          benefitPlan: null,
          profileCompletion: { complete: true, percentage: 100, missing: [] },
        };
      else if (path.endsWith("/member-portal/notifications"))
        body = {
          success: true,
          unreadCount: 1,
          data: [
            {
              id: 1,
              type: "CHANGE_REQUEST_RETURNED",
              title: "Change request returned for correction",
              message: "Use the full school name.",
              actionUrl: "/member/requests#request-89",
              createdAt: stamp,
              readAt: null,
            },
          ],
        };
      else if (path.includes("/notifications")) body.data = { count: 0 };
      else if (/\/change-requests\/\d+\/resubmit$/.test(path)) {
        if (failCorrection)
          return route.fulfill({
            status: 409,
            json: { message: "This request changed. Refresh it before resubmitting." },
          });
        const id = Number(path.split("/").at(-2));
        assert.equal(id, 89);
        assert.equal(input.expectedUpdatedAt, items.at(-1).updatedAt);
        mutations++;
        items = items.map((item) =>
          item.id === id
            ? {
                ...item,
                ...input,
                status: "PENDING",
                updatedAt: new Date(Date.parse(stamp) + mutations * 1000).toISOString(),
              }
            : item,
        );
        body.data = items.at(-1);
      } else if (/\/change-requests\/\d+\/review$/.test(path)) {
        const id = Number(path.split("/").at(-2));
        assert.equal(input.expectedUpdatedAt, items.find((item) => item.id === id).updatedAt);
        if (input.action !== "APPROVE") assert.ok(input.note?.trim());
        mutations++;
        items = items.map((item) =>
          item.id === id
            ? {
                ...item,
                status:
                  input.action === "RETURN"
                    ? "RETURNED"
                    : input.action === "REJECT"
                      ? "REJECTED"
                      : "APPROVED",
                reviewNote: input.note,
                updatedAt: new Date(Date.parse(stamp) + mutations * 1000).toISOString(),
                reviewedAt: new Date(Date.parse(stamp) + mutations * 1000).toISOString(),
              }
            : item,
        );
        if (input.action === "APPROVE")
          member.school = items.find((item) => item.id === id).proposedData.school;
        body.data = items.find((item) => item.id === id);
      } else if (path.endsWith("/member-portal/change-requests")) {
        if (failRefresh) return route.fulfill({ status: 503, json: { message: "Unavailable" } });
        body.data = items;
      } else if (path.endsWith("/change-requests")) {
        const matching = items.filter(
          (item) =>
            !url.searchParams.get("requestId") ||
            item.id === Number(url.searchParams.get("requestId")),
        );
        body = {
          success: true,
          data: matching,
          pagination: { total: matching.length, totalPages: 1 },
        };
      } else if (/\/members\/\d+$/.test(path)) body.data = member;
      await route.fulfill({ json: body });
    });
    const open = (path) => page.goto(`http://127.0.0.1:4187${path}`);
    const choose = async (action) => {
      const button = page.getByRole("button", { name: "Actions for request 89", exact: true });
      await button.scrollIntoViewIfNeeded();
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      await button.click();
      await page.getByRole("menuitem", { name: action, exact: true }).click();
    };
    const check = async (name) => {
      for (const zoom of [1, 2]) {
        await page.evaluate((value) => {
          document.documentElement.style.zoom = String(value);
        }, zoom);
        await page.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
          false,
          `${name} overflow ${width}/${zoom}`,
        );
      }
      await page.evaluate(() => {
        document.documentElement.style.zoom = "1";
      });
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      await page.screenshot({
        path: `test-results/change-requests/${name}-${width}.png`,
        fullPage: true,
      });
    };
    await open("/member/notifications");
    await page.getByRole("link", { name: "View request", exact: true }).click();
    await page.getByText("Page 2 of 2 · 12 requests").waitFor();
    const row = page.locator("#request-89");
    await row.getByRole("button", { name: "Edit & resubmit" }).waitFor();
    assert.equal(await row.locator("details").getAttribute("open"), "");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "request-89");
    await row.getByRole("button", { name: "Edit & resubmit" }).click();
    const form = page.getByRole("form", { name: "Correct request 89" });
    await form.getByLabel("School", { exact: true }).fill("Corrected Full School Name");
    await form.getByRole("button", { name: "Resubmit for review" }).click();
    await form.getByText("This request changed. Refresh it before resubmitting.").waitFor();
    assert.equal(
      await form.getByLabel("School", { exact: true }).inputValue(),
      "Corrected Full School Name",
    );
    await check("correction-error");
    failCorrection = false;
    await form.getByRole("button", { name: "Resubmit for review" }).click();
    await page.getByText("Request #89 resubmitted for GNAT review.").waitFor();
    await row.getByText("Awaiting GNAT review", { exact: true }).waitFor();
    assert.equal(member.school, "Current School");
    failRefresh = true;
    await page.getByRole("button", { name: "Refresh requests" }).click();
    await page.getByText(/Showing previously loaded requests/).waitFor();
    await row.getByText("Corrected Full School Name", { exact: true }).waitFor();
    await check("saved-history-refresh-error");
    failRefresh = false;
    await open("/change-requests?request=89");
    await page.getByText("Current School", { exact: true }).waitFor();
    await page.getByText("Corrected Full School Name", { exact: true }).waitFor();
    await choose("Return for correction");
    let dialog = page.getByRole("dialog");
    assert.equal(await dialog.getByRole("button", { name: "Confirm return" }).isDisabled(), true);
    await dialog.getByLabel(/Review note/).fill("Add the town to the school name.");
    await check("staff-return-dialog");
    await dialog.getByRole("button", { name: "Confirm return" }).click();
    await page.getByText("Request for Test Member reviewed successfully.").waitFor();
    await open("/member/requests#request-89");
    await row.getByText("Add the town to the school name.", { exact: true }).waitFor();
    await row.getByRole("button", { name: "Edit & resubmit" }).click();
    await form.getByLabel("School", { exact: true }).fill("Corrected Full School Name, Accra");
    await form.getByRole("button", { name: "Resubmit for review" }).click();
    await page.getByText("Request #89 resubmitted for GNAT review.").waitFor();
    await open("/change-requests?request=89");
    await page.getByText("Corrected Full School Name, Accra", { exact: true }).waitFor();
    await choose("Approve");
    dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Confirm approve" }).click();
    await page.getByText("Request for Test Member reviewed successfully.").waitFor();
    await open("/member/requests#request-89");
    await row.getByText("Your member record has been updated.").waitFor();
    assert.equal(await row.getByRole("button", { name: "Edit & resubmit" }).count(), 0);
    assert.equal(member.school, "Corrected Full School Name, Accra");
    await check("approved-member-request");
    assert.equal(mutations, 4);
    assert.deepEqual(errors, []);
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
