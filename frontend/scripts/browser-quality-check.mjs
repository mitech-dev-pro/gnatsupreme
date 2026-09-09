import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL || (process.platform === "win32" ? "msedge" : undefined),
  headless: true,
});
const member = {
  id: 1,
  controllerId: "123456",
  fullName: "Test Member",
  status: "ACTIVE",
  phone: "0200000000",
  email: "test@example.test",
  ghanaCardId: "GHA-123456789-0",
  school: "Test School",
  district: { id: 1, name: "Test District", region: { id: 1, name: "Test Region" } },
  spouse: null,
  beneficiaries: [],
  createdBy: null,
  createdAt: "2026-09-01T12:00:00.000Z",
  phoneVerifiedAt: null,
  employmentCategory: "TEACHING",
  report20Matched: true,
  missingFromReport20At: null,
};
const results = [];
await fs.mkdir("test-results/quality", { recursive: true });
try {
  for (const routePath of [
    "/claims/new",
    "/member/claims/new",
    "/login",
    "/members/new",
    "/members/1",
  ]) {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/api/**", async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        if (routePath === "/login" && pathname.endsWith("/refresh"))
          return route.fulfill({ status: 401, json: {} });
        let body = { success: true, data: [] };
        if (pathname.endsWith("/members/1")) body = { success: true, data: member };
        if (pathname.endsWith("/auth/refresh"))
          body = {
            accessToken: "mock",
            user: {
              id: 1,
              fullName: "Test Administrator",
              email: "admin@example.test",
              role: "SUPER_ADMIN",
              regionId: null,
              districtId: null,
            },
          };
        if (pathname.endsWith("/member-auth/refresh")) body = { accessToken: "mock", member };
        if (pathname.endsWith("/member-portal/profile"))
          body = {
            success: true,
            data: {
              member,
              profileCompletion: { complete: true },
              benefitPlan: {
                benefits: [{ type: "HOSPITALIZATION", enabled: true, namedConditions: [] }],
              },
            },
          };
        if (pathname.endsWith("/claims/illnesses"))
          body = { success: true, data: { illnesses: [] } };
        if (pathname.endsWith("/claims/provider"))
          body = {
            success: true,
            data: { configured: true, submissionsEnabled: true, mode: "API", provider: "MANKRADO" },
          };
        if (pathname.endsWith("/public/settings/branding"))
          return route.fulfill({ status: 503, json: {} });
        if (pathname.endsWith("/notifications"))
          body = { success: true, data: { items: [], unreadCount: 0 } };
        await route.fulfill({ json: body });
      });
      await page.goto(`http://localhost:4173${routePath}`);
      await page.locator("h1").first().waitFor();
      assert.equal(new URL(page.url()).pathname, routePath, "Expected authenticated claim route");
      await page.locator("button:visible, input:visible, a[href]:visible").first().waitFor();
      for (let tab = 0; tab < 3; tab++) {
        await page.keyboard.press("Tab");
        if (await page.evaluate(() => document.activeElement?.tagName !== "BODY")) break;
      }
      assert.notEqual(
        await page.evaluate(() => document.activeElement?.tagName),
        "BODY",
        "Keyboard focus must reach a control",
      );
      for (const zoom of [1, 2]) {
        await page.evaluate((value) => {
          document.documentElement.style.zoom = String(value);
        }, zoom);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth + 1,
        );
        const name = `${routePath.slice(1).replaceAll("/", "-")}-${width}-${zoom}x`;
        await page.screenshot({ path: `test-results/quality/${name}.png`, fullPage: true });
        results.push({ screen: name, overflow, errors: [...errors] });
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}
await fs.writeFile("test-results/quality/results.json", JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
assert.ok(
  results.every((result) => result.errors.length === 0),
  "Browser runtime errors",
);
assert.ok(
  results.every((result) => !result.overflow),
  "Page-level horizontal overflow",
);
