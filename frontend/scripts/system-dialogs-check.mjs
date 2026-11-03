import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { preview } from "vite";
const server = await preview({ preview: { host: "127.0.0.1", port: 4191, strictPort: true } });
const browser = await chromium.launch({
  channel: process.platform === "win32" ? "msedge" : undefined,
  headless: true,
});
const results = [];
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await context.route("**/api/**", async (route) => {
      const p = new URL(route.request().url()).pathname;
      let body = { success: true, data: [] };
      if (p.endsWith("/member-auth/refresh")) return route.fulfill({ status: 401, json: {} });
      if (p.endsWith("/auth/refresh"))
        body = {
          accessToken: "mock",
          user: { id: 1, role: "SUPER_ADMIN", fullName: "Test Admin" },
        };
      else if (p.endsWith("/users"))
        body = {
          data: [
            {
              id: 7,
              fullName: "Test Staff",
              email: "staff@example.test",
              role: "NATIONAL_ADMIN",
              isActive: true,
              regionId: null,
              districtId: null,
            },
          ],
          pagination: { total: 40, totalPages: 2 },
        };
      else if (p.endsWith("/districts"))
        body.data = [{ id: 1, name: "Test District", region: { id: 1, name: "Test Region" } }];
      else if (p.endsWith("/audit-logs"))
        body = {
          data: [
            {
              id: 19,
              action: "USER_UPDATED",
              description: "Updated staff",
              createdAt: "2026-10-30T12:00:00Z",
              actorEmail: "admin@example.test",
              beforeData: { name: "Old" },
              afterData: { name: "New" },
              entityType: "User",
              entityId: "7",
            },
          ],
          pagination: { total: 1, totalPages: 1 },
        };
      else if (p.endsWith("/notifications/unread-count")) body.data = { count: 0 };
      await route.fulfill({ json: body });
    });
    await page.goto("http://127.0.0.1:4191/system");
    await page.getByRole("button", { name: "Add Staff Account", exact: true }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Full Name", { exact: true }).fill("Unsaved Staff");
    await page.keyboard.press("Escape");
    await dialog.getByRole("button", { name: "Keep editing" }).click();
    assert.equal(
      await dialog.getByLabel("Full Name", { exact: true }).inputValue(),
      "Unsaved Staff",
    );
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await dialog.getByRole("button", { name: "Discard changes" }).click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    dialog = page.getByRole("dialog");
    assert.equal(await dialog.getByLabel("Full Name", { exact: true }).inputValue(), "Test Staff");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Reset password", exact: true }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("New temporary password").fill("TestPassword123!");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Deactivate", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("tab", { name: "Audit Log", exact: true }).click();
    await page.getByRole("button", { name: "View audit entry 19" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByText("User #7", { exact: true }).waitFor();
    const box = await dialog.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width + 1);
    assert.equal(await dialog.evaluate((n) => n.scrollWidth <= n.clientWidth + 1), true);
    await page.keyboard.press("Tab");
    assert.equal(await dialog.evaluate((n) => n.contains(document.activeElement)), true);
    await page.keyboard.press("Escape");
    assert.equal(
      await page
        .getByRole("button", { name: "View audit entry 19" })
        .evaluate((n) => n === document.activeElement),
      true,
    );
    assert.deepEqual(errors, []);
    results.push({ width, errors });
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
console.log(JSON.stringify(results, null, 2));
