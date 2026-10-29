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
  ghanaCardId: "GHA-123456789-0",
  phone: "12",
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
    let failHistory = false;
    let sends = 0;
    let submissions = 0;
    let staffNotificationTitle = "New claim submitted";
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
      else if (path.endsWith("/member-portal/notifications")) {
        body = {
          success: true,
          data: [
            {
              id: 1,
              type: "CLAIM_APPROVED_FOR_FORWARDING",
              title: "Claim forwarded to Mankrado",
              message: "Mankrado confirmed receipt. This is not approval of payment.",
              readAt: null,
              createdAt: "2026-10-29T16:00:00Z",
              actionUrl: "/member/claims#claim-1",
            },
            {
              id: 2,
              type: "CLAIM_RETURNED",
              title: "Claim returned for correction",
              message: "Review note: Upload a clearer report",
              readAt: null,
              createdAt: "2026-10-29T16:00:00Z",
              actionUrl: "/member/claims/1/resubmit",
            },
          ],
          unreadCount: 2,
        };
      } else if (path.endsWith("/notifications/unread-count")) body.data = { count: 1 };
      else if (path.endsWith("/notifications"))
        body.data = [
          {
            id: 3,
            type: "MEMBER_CLAIM_SUBMITTED",
            title: staffNotificationTitle,
            message: "Test Member submitted a claim for review.",
            readAt: null,
            createdAt: "2026-10-29T16:00:00Z",
            actionUrl: "/claims/1",
          },
        ];
      else if (path.endsWith("/claims/member-lookup")) body.data = member;
      else if (path.endsWith("/claims/estimate")) body.data = { amount: "20000", available: true };
      else if (path.endsWith("/member-portal/claims/history") && failHistory)
        return route.fulfill({
          status: 503,
          json: {
            success: false,
            message: "Mankrado history is unavailable. Local claims remain saved.",
          },
        });
      else if (path.endsWith("/member-portal/claims/1/assessment")) {
        if (failAssessment) return route.fulfill({ status: 503, json: { success: false } });
        body.data = { ...assessment, lastSyncedAt: "2026-10-29T12:00:00Z" };
      } else if (path.endsWith("/member-portal/claims/1/documents/3"))
        return route.fulfill({ contentType: "application/pdf", body: "%PDF-1.4 test document" });
      else if (
        path.endsWith("/member-portal/claims/documents") ||
        path.endsWith("/members/1/files")
      ) {
        assert.match(
          route.request().postDataBuffer().toString("utf8"),
          /name="slotKey"\r?\n\r?\ndischargeSummaryOrBill/,
        );
        body.data = {
          id: 101,
          slotKey: "dischargeSummaryOrBill",
          originalName: "discharge-summary.pdf",
        };
      } else if (path.endsWith("/claims/submissions/1/send")) {
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
      } else if (
        (path.endsWith("/claims/submissions") || path.endsWith("/member-portal/claims")) &&
        route.request().method() === "POST"
      ) {
        assert.equal("primaryPhone" in route.request().postDataJSON().claimantContact, false);
        assert.equal("additionalPhone" in route.request().postDataJSON().claimantContact, false);
        submissions++;
        body.data = { ...claim, id: 1, deliveryState: "ACCEPTED", externalClaimId: "42" };
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
      else if (path.endsWith("/member-portal/claims/1"))
        body.data = {
          ...claim,
          documentIds: [3],
          documents: [{ id: 3, slotKey: "dischargeSummaryOrBill", originalName: "report.pdf" }],
        };
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
      await page.evaluate(() => document.fonts.ready);
      for (const zoom of [1, 2]) {
        await page.evaluate((value) => {
          document.documentElement.style.zoom = String(value);
        }, zoom);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        );
        if (overflow) {
          await page.screenshot({
            path: `test-results/claims/overflow-${name}-${width}-${zoom}.png`,
            fullPage: true,
          });
          console.log(
            await page.evaluate(() =>
              Array.from(document.querySelectorAll("body *"))
                .map((element) => ({
                  tag: element.tagName,
                  text: element.textContent?.slice(0, 60),
                  right: element.getBoundingClientRect().right,
                }))
                .filter((item) => item.right > innerWidth + 1)
                .slice(0, 12),
            ),
          );
        }
        assert.equal(overflow, false, `${name} overflow at ${width}/${zoom}`);
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
    const bell = page.getByRole("button", { name: "Notifications", exact: true });
    await bell.click();
    await page.getByText("New claim submitted", { exact: true }).waitFor();
    await verifyLayout("staff-notifications");
    await bell.click();
    staffNotificationTitle = "Claim resubmitted";
    await bell.click();
    await page.getByText("Claim resubmitted", { exact: true }).waitFor();
    await page.getByRole("link", { name: "View claim", exact: true }).click();
    await page.getByText("Saved Hospital", { exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/claims/1");
    await open("/member/claims");
    await page.getByText("Received by Mankrado", { exact: true }).waitFor();
    await page.getByText("Mankrado: Awaiting Approval", { exact: true }).waitFor();
    await verifyLayout("member-claims");
    const acceptedClaim = { ...claim };
    claim = {
      ...base,
      claimType: "HOSPITALIZATION",
      claimDetails: {
        hospitalName: "Saved Hospital",
        admissionDate: "2026-10-01",
        dischargeDate: "2026-10-12",
        reason: "Malaria",
      },
    };
    failHistory = true;
    await open("/member/claims");
    await page
      .getByText("Mankrado history is unavailable. Local claims remain saved.", { exact: true })
      .waitFor();
    await page.getByRole("button", { name: "View details for claim 1", exact: true }).click();
    const memberDialog = page.getByRole("dialog", { name: "Claim details", exact: true });
    await memberDialog.getByText("Saved Hospital", { exact: true }).waitFor();
    await memberDialog.getByText("Saved Payee", { exact: true }).waitFor();
    await memberDialog.getByText("Original submitted notes", { exact: true }).waitFor();
    assert.equal(
      await memberDialog.getByRole("button", { name: /Retry|Send saved|Approve/ }).count(),
      0,
    );
    await verifyLayout("member-pending-claim-details");
    const download = page.waitForEvent("download");
    await memberDialog.getByRole("button", { name: "report.pdf", exact: true }).click();
    assert.equal((await download).suggestedFilename(), "report.pdf");
    await page.keyboard.press("Escape");
    claim = acceptedClaim;
    failAssessment = true;
    await page.getByRole("button", { name: "View details for claim 1", exact: true }).click();
    await memberDialog
      .getByText("Could not refresh; showing the last saved assessment.", { exact: true })
      .waitFor();
    await memberDialog.getByText("Saved Hospital", { exact: true }).waitFor();
    await verifyLayout("member-saved-assessment-details");
    await page.keyboard.press("Escape");
    failHistory = false;
    failAssessment = false;
    await open("/member/notifications");
    await page.getByText("Review note: Upload a clearer report", { exact: true }).waitFor();
    await verifyLayout("member-notifications");
    await page.getByRole("link", { name: "View claim", exact: true }).click();
    await page.locator("#claim-1").waitFor();
    await page.waitForFunction(() => document.activeElement?.id === "claim-1");
    assert.equal(new URL(page.url()).hash, "#claim-1");
    // An obsolete return notification should lead to current status, not an unusable form.
    await open("/member/claims/1/resubmit");
    await page.waitForURL("**/member/claims#claim-1");
    claim = {
      ...claim,
      status: "RETURNED",
      deliveryState: "NOT_SENT",
      reviewedAt: "2026-10-29T16:00:00Z",
    };
    await open("/member/notifications");
    await page.getByRole("link", { name: "Correct and resubmit", exact: true }).click();
    await page.locator('input[value="Saved Hospital"]').waitFor();
    assert.equal(new URL(page.url()).pathname, "/member/claims/1/resubmit");
    for (const path of ["/member/claims/new", "/claims/new"]) {
      await open(path);
      if (path === "/claims/new") {
        await page.getByLabel("Staff ID", { exact: false }).fill("123456");
        await page.getByRole("button", { name: "Continue", exact: true }).click();
      }
      await page.getByRole("button", { name: /Hospitalization/ }).click();
      await page.getByLabel("Name of hospital", { exact: false }).fill("Test Hospital");
      await page.getByLabel("Date of admission", { exact: false }).fill("2026-07-01");
      await page.getByLabel("Date of discharge", { exact: false }).fill("2026-07-12");
      await page.getByLabel("Reason for hospitalization", { exact: false }).fill("Malaria");
      await page.getByLabel("Ghana Card number", { exact: false }).fill("GHA-123456789-0");
      await page.getByText("0 of 1 required", { exact: true }).waitFor();
      const next = page.getByRole("button", { name: "Next", exact: true });
      assert.ok(await next.isDisabled());
      const category = page.getByRole("group", {
        name: /Hospital Discharge Summary or Medical Bill/,
      });
      await category.getByLabel("Attach document", { exact: true }).waitFor();
      await verifyLayout(
        path.startsWith("/member") ? "member-hospital-upload" : "staff-hospital-upload",
      );
      await category.getByLabel("Attach document", { exact: true }).setInputFiles({
        name: "discharge-summary.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4 test document"),
      });
      await page.getByText("1 of 1 required", { exact: true }).waitFor();
      assert.ok(await next.isEnabled());
      await next.click();
      await page.getByLabel(/Payee name/).waitFor();
      assert.equal(await page.getByLabel("Contact phone number", { exact: true }).count(), 0);
      await verifyLayout(
        path.startsWith("/member") ? "member-cheque-contact" : "staff-cheque-contact",
      );
      await page.getByRole("checkbox", { name: /I accept this declaration/ }).check();
      await page.getByRole("button", { name: "Submit claim", exact: true }).click();
      await page.waitForURL(path.startsWith("/member") ? "**/member/claims" : "**/claims");
    }
    assert.deepEqual(errors, []);
    assert.equal(submissions, 2);
    results.push({ width, errors, sends, submissions });
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
console.log(JSON.stringify(results, null, 2));
