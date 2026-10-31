import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "@playwright/test";
import { preview } from "vite";

const server = await preview({ preview: { host: "127.0.0.1", port: 4188, strictPort: true } });
const browser = await chromium.launch({
  channel: process.platform === "win32" ? "msedge" : undefined,
  headless: true,
});
await fs.mkdir("test-results/imports", { recursive: true });
const stamp = "2026-10-29T12:00:00.000Z";
const fixture = (id) => ({
  id,
  status: "COMPLETED",
  totalRows: 5,
  readyRows: 2,
  invalidRows: 1,
  duplicateRows: 1,
  unmatchedRows: 1,
  importedRows: 0,
  processedRows: 5,
  file: { originalName: `members-${id}.csv`, sizeBytes: 200 },
  uploadedBy: { id: 1, fullName: "Test Administrator" },
  createdAt: stamp,
  updatedAt: stamp,
  errorMessage: null,
});
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
    let jobs = Array.from({ length: 11 }, (_, index) => fixture(42 - index)),
      job = jobs[0],
      phase = 0,
      commits = 0,
      uploads = 0,
      downloads = 0,
      failRefresh = false;
    let rows = ["READY", "READY", "INVALID", "DUPLICATE", "EXISTING"].map((status, index) => ({
      id: index + 1,
      rowNumber: index + 2,
      controllerId: `TEST000${index}`,
      fullName: `Test Member ${index + 1}`,
      districtName: "Test District",
      status,
      issues:
        status === "INVALID"
          ? ["School is required"]
          : status === "DUPLICATE"
            ? ["Controller ID appears more than once in this file"]
            : status === "EXISTING"
              ? ["Controller ID is already enrolled"]
              : [],
    }));
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url()),
        path = url.pathname,
        method = route.request().method();
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
      else if (path.endsWith("/imports/members") && method === "POST") {
        uploads++;
        if (route.request().postData().includes("same-file.csv"))
          return route.fulfill({
            status: 409,
            json: {
              message: "This file already has an import. Open it to review progress.",
              duplicateImport: { id: 42 },
            },
          });
        job = {
          ...fixture(43),
          totalRows: 1,
          readyRows: 1,
          invalidRows: 0,
          duplicateRows: 0,
          unmatchedRows: 0,
          file: { originalName: "corrected.csv", sizeBytes: 100 },
        };
        jobs.unshift(job);
        rows = [{ ...rows[2], status: "READY", issues: [] }];
        body.data = job;
      } else if (path.endsWith("/imports/members")) {
        const current = Number(url.searchParams.get("page") || 1),
          limit = Number(url.searchParams.get("limit") || 10);
        body = {
          success: true,
          data: jobs.slice((current - 1) * limit, current * limit),
          pagination: { total: jobs.length, totalPages: Math.ceil(jobs.length / limit) },
        };
      } else if (/\/imports\/members\/\d+\/commit$/.test(path)) {
        commits++;
        job = { ...job, status: "PROCESSING", processedRows: 3 };
        phase = 1;
        body.data = job;
      } else if (/\/imports\/members\/\d+\/recovery-file$/.test(path)) {
        downloads++;
        return route.fulfill({
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          body: Buffer.from(
            "mock workbook; actual workbook contents are verified by backend tests",
          ),
        });
      } else if (/\/imports\/members\/\d+\/rows$/.test(path)) {
        if (failRefresh) return route.fulfill({ status: 503, json: { message: "Offline" } });
        const status = url.searchParams.get("status"),
          matching = rows.filter((row) => !status || row.status === status);
        body = {
          success: true,
          data: matching,
          pagination: { total: matching.length, totalPages: 1 },
        };
      } else if (/\/imports\/members\/\d+$/.test(path)) {
        if (failRefresh) return route.fulfill({ status: 503, json: { message: "Offline" } });
        if (phase && ++phase > 2) {
          job = { ...job, status: "COMPLETED", readyRows: 0, importedRows: 2, processedRows: 5 };
          rows = rows.map((row) => (row.status === "READY" ? { ...row, status: "IMPORTED" } : row));
          phase = 0;
        }
        body.data = job;
      }
      await route.fulfill({ json: body });
    });
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
      }
      await page.evaluate(() => {
        document.documentElement.style.zoom = "1";
      });
      await settle();
      await page.screenshot({ path: `test-results/imports/${name}-${width}.png`, fullPage: true });
    };
    await page.goto("http://127.0.0.1:4188/members/upload");
    await page.getByText("Page 1 of 2 · 11 imports").waitFor();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByText("Page 2 of 2 · 11 imports").waitFor();
    await page.getByRole("cell", { name: "11", exact: true }).waitFor();
    await check("history-page-two");
    await page.getByRole("button", { name: "Previous", exact: true }).click();
    await page.getByRole("button", { name: "Teaching staff", exact: true }).click();
    await page
      .getByLabel("Member import file")
      .setInputFiles({
        name: "same-file.csv",
        mimeType: "text/csv",
        buffer: Buffer.from("Controller ID,Full Name\nTEST1234,Test Member"),
      });
    await page.getByRole("button", { name: "Upload & Validate", exact: true }).click();
    await page.getByRole("link", { name: "Open saved import #42" }).waitFor();
    await check("duplicate-upload-recovery");
    await page.getByRole("link", { name: "Open saved import #42" }).click();
    await page.getByRole("heading", { name: "members-42.csv", exact: true }).waitFor();
    await page.getByText("Ready for enrollment", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Enroll 2 ready members" }).click();
    assert.equal(commits, 0);
    await check("enrollment-confirmation");
    await page.getByRole("dialog").getByRole("button", { name: "Confirm enrollment" }).click();
    await page.getByText("Enrollment finished with skipped rows", { exact: true }).waitFor();
    assert.equal(commits, 1);
    assert.equal(job.totalRows, 5);
    assert.equal(job.importedRows, 2);
    await check("enrollment-outcomes");
    failRefresh = true;
    await page.getByRole("button", { name: "Refresh import" }).click();
    await page.getByText(/Unable to refresh this import/).waitFor();
    assert.equal(await page.getByText("No rows found", { exact: true }).count(), 0);
    await page.getByRole("cell", { name: "Test Member 1", exact: true }).waitFor();
    failRefresh = false;
    await page.getByRole("button", { name: "Refresh import" }).click();
    const downloadReady = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download corrections (.xlsx)" }).click();
    const download = await downloadReady;
    assert.equal(download.suggestedFilename(), "member-import-42-corrections.xlsx");
    await page.getByRole("link", { name: "Upload corrected rows", exact: true }).click();
    await page.getByRole("button", { name: "Teaching staff", exact: true }).click();
    await page
      .getByLabel("Member import file")
      .setInputFiles({
        name: "corrected.csv",
        mimeType: "text/csv",
        buffer: Buffer.from("Controller ID,Full Name\nTEST0002,Corrected Member"),
      });
    await page.getByRole("button", { name: "Upload & Validate", exact: true }).click();
    await page.getByRole("heading", { name: "corrected.csv", exact: true }).waitFor();
    await page.getByText("Ready for enrollment", { exact: true }).waitFor();
    assert.equal(job.readyRows, 1);
    assert.equal(uploads, 2);
    assert.equal(downloads, 1);
    assert.deepEqual(errors, []);
    results.push({ width, errors, mockedUploads: uploads, mockedEnrollments: commits, downloads });
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
console.log(JSON.stringify(results, null, 2));
