import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "@playwright/test";
import { preview } from "vite";

const server = await preview({ preview: { host: "127.0.0.1", port: 4189, strictPort: true } });
const browser = await chromium.launch({
  channel: process.platform === "win32" ? "msedge" : undefined,
  headless: true,
});
await fs.mkdir("test-results/member-navigation", { recursive: true });
const origin = "http://127.0.0.1:4189";
const listPath = "/members?search=Member&status=FLAGGED&districtId=9&page=2&limit=10";
const fixture = (id) => ({
  id,
  fullName: `Test Member ${id}`,
  controllerId: `TEST${id}`,
  school: "Test School",
  phone: id === 17 ? "+233 24 400 0017" : `02440000${String(id).padStart(2, "0")}`,
  phoneVerifiedAt: null,
  email: null,
  ghanaCardId: null,
  employmentCategory: "TEACHING",
  gender: "FEMALE",
  placeOfWork: null,
  status: "FLAGGED",
  report20Matched: true,
  missingFromReport20At: null,
  createdAt: "2026-10-29T12:00:00.000Z",
  district: { id: 9, name: "Test District", region: { id: 3, name: "Test Region" } },
  region: { id: 3, name: "Test Region" },
  spouse: null,
  beneficiaries: [],
  _count: { beneficiaries: 0 },
  createdBy: null,
});
const results = [];
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const members = Array.from({ length: 30 }, (_, index) => fixture(index + 1));
    let edits = 0;
    const canonical = (value) =>
      value.replace(/\D/g, "").replace(/^00/, "").replace(/^233/, "").replace(/^0/, "");
    await context.route("**/api/**", async (route) => {
      const url = new URL(route.request().url()),
        path = url.pathname;
      let body = { success: true, data: [] };
      if (path.endsWith("/auth/refresh"))
        body = {
          accessToken: "mock",
          user: { id: 1, role: "SUPER_ADMIN", fullName: "Test Administrator" },
        };
      else if (path.endsWith("/member-auth/refresh"))
        return route.fulfill({ status: 401, json: {} });
      else if (path.endsWith("/public/settings/branding"))
        return route.fulfill({ status: 503, json: {} });
      else if (path.endsWith("/notifications/unread-count")) body.data = { count: 0 };
      else if (path.endsWith("/districts")) body.data = [members[0].district];
      else if (path.endsWith("/members/stats"))
        body.data = {
          totalMembers: 30,
          newThisMonth: 0,
          activeCoverage: 30,
          activeCoveragePct: 100,
          registeredMembers: 20,
          report20Mismatch: 0,
          removedThisMonth: 0,
          removedBreakdownNote: "None",
        };
      else if (path.endsWith("/members/schools")) body.data = ["Test School"];
      else if (path.endsWith("/members")) {
        const search = url.searchParams.get("search")?.toLowerCase() || "",
          status = url.searchParams.get("status"),
          district = url.searchParams.get("districtId"),
          current = Number(url.searchParams.get("page") || 1),
          limit = Number(url.searchParams.get("limit") || 10);
        const matched = members.filter(
          (member) =>
            (!status || member.status === status) &&
            (!district || member.district.id === Number(district)) &&
            (!search ||
              member.fullName.toLowerCase().includes(search) ||
              member.controllerId.toLowerCase().includes(search) ||
              (canonical(search).length >= 3 &&
                canonical(member.phone).includes(canonical(search)))),
        );
        body = {
          success: true,
          data: matched.slice((current - 1) * limit, current * limit),
          pagination: { total: matched.length, totalPages: Math.ceil(matched.length / limit) },
        };
      } else if (/\/members\/\d+\/workflow$/.test(path)) body.data = [];
      else if (/\/members\/\d+$/.test(path)) {
        const member = members.find((member) => member.id === Number(path.split("/").at(-1)));
        if (route.request().method() === "PATCH") {
          edits++;
          Object.assign(member, route.request().postDataJSON());
        }
        body.data = member;
      }
      await route.fulfill({ json: body });
    });
    const row = () => page.locator('[data-member-row="17"]:visible');
    const settle = () =>
      page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
    const place = async () => {
      await row().waitFor();
      await page.evaluate(() => document.fonts.ready);
      await row().getByRole("link").first().scrollIntoViewIfNeeded();
      await settle();
      await row().evaluate((node) => {
        const host = node.closest("main");
        host.scrollTop += node.getBoundingClientRect().top - 180;
      });
      await settle();
      return (await row().boundingBox()).y;
    };
    const restored = async (top) => {
      await page.waitForFunction(
        () => document.activeElement?.getAttribute("data-member-row") === "17",
      );
      assert.ok(
        Math.abs((await row().boundingBox()).y - top) < 5,
        `row offset not restored at ${width}`,
      );
      assert.equal(await page.getByLabel("Search members").inputValue(), "Member");
      await row().getByText("Last viewed", { exact: true }).waitFor();
      const url = new URL(page.url());
      assert.equal(url.searchParams.get("page"), "2");
      assert.equal(url.searchParams.get("status"), "FLAGGED");
      assert.equal(url.searchParams.get("districtId"), "9");
    };
    const check = async (name) => {
      for (const zoom of [1, 2]) {
        await page.evaluate((value) => {
          document.documentElement.style.zoom = String(value);
        }, zoom);
        await settle();
        if (
          await page
            .locator("main")
            .first()
            .evaluate((main) => main.scrollWidth > main.clientWidth + 1)
        ) {
          console.log(
            JSON.stringify(
              await page
                .locator("main")
                .first()
                .evaluate((main) => ({
                  client: main.clientWidth,
                  scroll: main.scrollWidth,
                  nodes: [...main.querySelectorAll("*")]
                    .filter(
                      (node) =>
                        node.getClientRects().length &&
                        node.getBoundingClientRect().right > main.getBoundingClientRect().right + 2,
                    )
                    .slice(0, 16)
                    .map((node) => ({
                      tag: node.tagName,
                      class: node.className,
                      width: node.getBoundingClientRect().width,
                      text: node.textContent.slice(0, 60),
                    })),
                })),
              null,
              2,
            ),
          );
          await page.screenshot({
            path: `test-results/member-navigation/overflow-${width}-${zoom}.png`,
          });
        }
        assert.equal(
          await page
            .locator("main")
            .first()
            .evaluate((main) => main.scrollWidth > main.clientWidth + 1),
          false,
          `${name} content overflow ${width}/${zoom}`,
        );
      }
      await page.evaluate(() => {
        document.documentElement.style.zoom = "1";
      });
      await settle();
      await page.screenshot({ path: `test-results/member-navigation/${name}-${width}.png` });
    };
    await page.goto(origin + listPath);
    await page.getByText("Page 2 of 3 · 30 members").waitFor();
    let top = await place();
    const href = await row().getByRole("link").first().getAttribute("href");
    await row().getByRole("link").first().click();
    await page.getByRole("heading", { name: "Test Member 17", exact: true }).waitFor();
    assert.equal(
      await page.getByRole("link", { name: "Back to members", exact: true }).getAttribute("href"),
      `${listPath}#member-17`,
    );
    await page.getByRole("link", { name: "Back to members", exact: true }).click();
    await restored(top);
    await check("return-to-filtered-row");
    await page.goto(origin + listPath);
    top = await place();
    await row().getByRole("link").first().click();
    await page.getByRole("heading", { name: "Test Member 17", exact: true }).waitFor();
    await page.goBack();
    await restored(top);
    assert.equal(new URL(page.url()).hash, "");
    const fresh = await context.newPage();
    await fresh.goto(origin + href);
    await fresh.getByRole("heading", { name: "Test Member 17", exact: true }).waitFor();
    await fresh.reload();
    await fresh.getByRole("link", { name: "Back to members", exact: true }).click();
    await fresh.waitForFunction(
      () => document.activeElement?.getAttribute("data-member-row") === "17",
    );
    assert.equal(new URL(fresh.url()).searchParams.get("page"), "2");
    await fresh.close();
    const choose = async (action) => {
      const button = row().getByRole("button", { name: "Actions for Test Member 17", exact: true });
      await button.scrollIntoViewIfNeeded();
      await settle();
      await button.click();
      await page.getByRole("menuitem", { name: action, exact: true }).click();
    };
    await choose("Edit member");
    const nameInput = page.locator(".member-panel--details form input").first();
    await nameInput.waitFor();
    assert.equal(await nameInput.inputValue(), "Test Member 17");
    await nameInput.fill("Test Member 17 Updated");
    await page
      .locator(".member-panel--details form")
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await page.getByRole("heading", { name: "Test Member 17 Updated", exact: true }).waitFor();
    assert.equal(await page.locator(".member-panel--details form").count(), 0);
    await page.getByRole("link", { name: "Back to members", exact: true }).click();
    await row()
      .getByText("Test Member 17 Updated", { exact: width === 1440 })
      .waitFor();
    const menu = row().getByRole("button", {
      name: "Actions for Test Member 17 Updated",
      exact: true,
    });
    await menu.scrollIntoViewIfNeeded();
    await settle();
    await menu.click();
    await page.getByRole("menuitem", { name: "Review workflow", exact: true }).click();
    await page.waitForFunction(() => document.activeElement?.id === "workflow");
    await check("workflow-return-context");
    await page.getByRole("link", { name: "Back to members", exact: true }).click();
    await page.getByLabel("Search members").fill("024 400-0017");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByText("Page 2 of 3 · 30 members").waitFor({ state: "hidden" });
    await row().getByText("+233 24 400 0017", { exact: true }).waitFor();
    assert.equal(new URL(page.url()).searchParams.has("page"), false);
    assert.equal(await page.locator("[data-member-row]:visible").count(), 1);
    await check("phone-number-search");
    assert.equal(edits, 1);
    assert.deepEqual(errors, []);
    results.push({ width, errors, mockedEdits: edits });
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
console.log(JSON.stringify(results, null, 2));
