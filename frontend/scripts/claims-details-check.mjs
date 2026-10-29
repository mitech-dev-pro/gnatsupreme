import { chromium } from "@playwright/test";
import { preview } from "vite";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

// All API traffic is intercepted: this check never contacts Mankrado or a real backend.
const server = await preview({ preview: { host: "127.0.0.1", port: 4184, strictPort: true } });
const browser = await chromium.launch({
  channel: process.platform === "win32" ? "msedge" : undefined,
  headless: true,
});
const member = {
  id: 1,
  controllerId: "123456",
  fullName: "Test Member",
  status: "ACTIVE",
  spouse: null,
  beneficiaries: [],
  district: { id: 1, name: "Test District", region: { id: 1, name: "Test Region" } },
};
const assessment = {
  claimNumber: "MC-DISPLAY-42",
  name: "Test Member",
  claimDate: "2026-10-28 10:00:00",
  status: "Awaiting Approval",
  amountPayable: "0.00",
  rejectReason: null,
};
const base = {
  id: 1,
  member,
  provider: "Claims System",
  source: "MEMBER_PORTAL",
  status: "PENDING",
  deliveryState: "NOT_SENT",
  externalClaimId: null,
  externalStatus: null,
  externalAssessment: null,
  reviewedAt: null,
  reviewedBy: null,
  submittedBy: null,
  submittedByMember: member,
  claimType: "CRITICAL_ILLNESS",
  claimantType: "MEMBER",
  claimantName: member.fullName,
  claimantIdType: "GHANA_CARD",
  claimantIdNumber: "GHA-123456789-0",
  claimantContact: { fullName: "Test Contact", nationality: "Ghanaian" },
  claimDetails: {
    diagnosingHospital: "Saved Hospital",
    diagnosingPhysician: "Saved Doctor",
    diagnosisDate: "2026-10-20",
    illness: "Saved diagnosis",
  },
  estimatedAmount: "20000",
  paymentMethod: "CHEQUE",
  paymentDetails: { payeeName: "Saved Payee" },
  documents: [],
  documentIds: [],
  notes: "Original submitted notes",
  createdAt: "2026-10-28T10:00:00Z",
  submittedAt: null,
  lastSyncedAt: null,
  reviewNote: null,
  errorMessage: null,
};
const results = [];
await fs.mkdir("test-results/claims", { recursive: true });
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let claim = { ...base };
    let failAssessment = false;
    let sends = 0;
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
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
      else if (path.endsWith("/member-auth/refresh")) body = { accessToken: "mock", member };
      else if (path.endsWith("/public/settings/branding"))
        return route.fulfill({ status: 503, json: {} });
      else if (path.endsWith("/notifications")) body.data = { items: [], unreadCount: 0 };
      else if (path.endsWith("/claims/submissions/1/send")) {
        assert.equal(route.request().postDataJSON().historyChecked, true);
        sends++;
        claim = {
          ...claim,
          status: "SUBMITTED",
          deliveryState: "ACCEPTED",
          externalClaimId: "42",
          externalStatus: assessment.status,
          externalAssessment: assessment,
        };
        body.data = claim;
      } else if (path.endsWith("/claims/submissions/1")) body.data = claim;
      else if (path.endsWith("/claims/submissions"))
        body = { success: true, data: [claim], pagination: { total: 1, totalPages: 1 } };
      else if (path.endsWith("/claims/claimdetails/42")) {
        if (failAssessment) return route.fulfill({ status: 503, json: { success: false } });
        claim = {
          ...claim,
          externalStatus: assessment.status,
          externalAssessment: assessment,
          lastSyncedAt: "2026-10-29T12:00:00Z",
        };
        body.data = { ...assessment, lastSyncedAt: claim.lastSyncedAt };
      } else if (path.endsWith("/member-portal/claims")) body.data = [claim];
      else if (path.endsWith("/member-portal/profile"))
        body.data = {
          member,
          profileCompletion: { complete: true, percentage: 100, missing: [] },
          benefitPlan: { benefits: [] },
        };
      await route.fulfill({ json: body });
    });
    const open = (path) => page.goto(`http://127.0.0.1:4184${path}`);
    const verifyLayout = async (name) => {
      for (const zoom of [1, 2]) {
        await page.evaluate((value) => {
          document.documentElement.style.zoom = String(value);
        }, zoom);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
          false,
          `${name} overflow at ${width}/${zoom}`,
        );
      }
      await page.evaluate(() => {
        document.documentElement.style.zoom = "1";
      });
      await page.screenshot({ path: `test-results/claims/${name}-${width}.png`, fullPage: true });
    };
    await open("/claims/1");
    await page.getByText("Saved Hospital", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Approve and forward", exact: true }).waitFor();
    await page.getByText(/Assessment information becomes available/).waitFor();
    await verifyLayout("awaiting-review");
    claim = {
      ...base,
      reviewedAt: "2026-10-29T10:00:00Z",
      deliveryState: "ACCEPTED",
      status: "SUBMITTED",
      externalClaimId: "42",
      externalStatus: "Assessing",
      externalAssessment: { ...assessment, status: "Assessing" },
      lastSyncedAt: "2026-10-29T10:00:00Z",
    };
    await open("/claims/1");
    await page.getByText("MC-DISPLAY-42", { exact: true }).waitFor();
    assert.equal(
      await page.getByRole("heading", { name: "Mankrado assessment", exact: true }).count(),
      1,
    );
    await page.getByText("Awaiting Approval", { exact: true }).first().waitFor();
    assert.equal(await page.getByText("42", { exact: true }).count(), 1);
    failAssessment = true;
    await page.getByRole("button", { name: "Refresh details" }).click();
    await page.getByText("Could not refresh; showing the last saved assessment.").waitFor();
    await page.getByText("Saved Hospital", { exact: true }).waitFor();
    await verifyLayout("saved-assessment");
    failAssessment = false;
    claim = { ...base, source: "STAFF", deliveryState: "UNKNOWN" };
    await open("/claims/1");
    const retry = page.getByRole("button", { name: "Retry submission" });
    await retry.waitFor();
    assert.ok(await retry.isDisabled());
    await page.getByRole("button", { name: "Check Mankrado history" }).click();
    const acknowledgment = page.getByRole("checkbox", { name: /I checked this member/ });
    await acknowledgment.check();
    await retry.click();
    await page.getByText("MC-DISPLAY-42", { exact: true }).waitFor();
    assert.equal(sends, 1);
    await open("/claims");
    const actions = page.getByRole("button", { name: "Actions for this critical illness claim" });
    await actions.scrollIntoViewIfNeeded();
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await actions.click();
    await page.getByRole("menuitem", { name: "View details" }).click();
    const dialog = page.getByRole("dialog", { name: "Claim details" });
    await dialog.getByText("Saved Hospital", { exact: true }).waitFor();
    await dialog.getByText("MC-DISPLAY-42", { exact: true }).waitFor();
    await dialog.getByRole("button", { name: "Close", exact: true }).focus();
    await page.keyboard.press("Shift+Tab");
    assert.ok(
      await dialog.evaluate((element) => element.contains(document.activeElement)),
      "Keyboard focus must remain inside the modal",
    );
    await page.keyboard.press("Tab");
    assert.ok(
      await dialog
        .getByRole("button", { name: "Close", exact: true })
        .evaluate((element) => element === document.activeElement),
    );
    await verifyLayout("details-modal");
    await page.keyboard.press("Escape");
    assert.equal(await dialog.count(), 0);
    assert.ok(
      await actions.evaluate((element) => element === document.activeElement),
      "Closing the modal restores focus to its trigger",
    );
    await open("/member/claims");
    await page.getByText("Received by Mankrado", { exact: true }).waitFor();
    await page.getByText("Mankrado: Awaiting Approval", { exact: true }).waitFor();
    await verifyLayout("member-claims");
    assert.deepEqual(errors, []);
    results.push({ width, errors, sends });
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
console.log(JSON.stringify(results, null, 2));
