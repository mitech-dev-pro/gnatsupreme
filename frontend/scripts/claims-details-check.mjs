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
    page.on("dialog", (dialog) =>
      dialog.type() === "beforeunload" ? dialog.accept() : dialog.dismiss(),
    );
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let claim = { ...base };
    let failAssessment = false;
    let failHistory = false;
    let historyRequests = 0;
    let historyRows = [];
    let extraClaims = [];
    let approvalRows = null;
    const draftRecords = [];
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
              title: "Claim forwarded to Claims Portal",
              message: "Claims Portal confirmed receipt. This is not approval of payment.",
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
      else if (/\/claims\/drafts(?:\/\d+)?$/.test(path)) {
        const method = route.request().method(),
          query = new URL(route.request().url()).searchParams;
        const audience = path.includes("member-portal") ? "member" : "staff";
        const id = Number(path.split("/").at(-1));
        if (method === "POST" || method === "PUT") {
          const input = route.request().postDataJSON();
          const existing = method === "PUT" ? draftRecords.find((item) => item.id === id) : null;
          const saved = {
            ...existing,
            id: existing?.id ?? draftRecords.length + 1,
            revision: (existing?.revision ?? 0) + 1,
            memberId: member.id,
            member,
            payload: input.payload,
            documentIds: input.documentIds,
            submissionKey: existing?.submissionKey ?? input.submissionKey,
            updatedAt: "2026-10-29T12:00:00Z",
            audience,
            documents: input.documentIds.map((fileId) => ({
              id: fileId,
              slotKey: "dischargeSummaryOrBill",
              originalName: "discharge-summary.pdf",
            })),
          };
          if (existing) Object.assign(existing, saved);
          else draftRecords.push(saved);
          body.data = saved;
        } else if (Number.isFinite(id)) body.data = draftRecords.find((item) => item.id === id);
        else {
          const visible = draftRecords.filter(
              (item) => item.audience === audience && !item.submittedClaimId,
            ),
            page = Number(query.get("page") || 1);
          body = {
            success: true,
            data: visible.slice((page - 1) * 10, page * 10),
            pagination: {
              total: visible.length,
              totalPages: Math.max(1, Math.ceil(visible.length / 10)),
            },
          };
        }
      } else if (path.endsWith("/claims/member-lookup")) body.data = member;
      else if (path.endsWith("/claims/estimate")) body.data = { amount: "20000", available: true };
      else if (path.endsWith("/member-portal/claims/history")) {
        historyRequests++;
        if (failHistory)
          return route.fulfill({
            status: 503,
            json: {
              success: false,
              message: "Claims Portal history is unavailable. Local claims remain saved.",
            },
          });
        body.data = historyRows;
      } else if (path.endsWith("/member-portal/claims/1/assessment")) {
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
        const draft = draftRecords.find(
          (item) => item.id === route.request().postDataJSON().draftId,
        );
        assert.ok(draft, "A durable draft is saved before submitting");
        draft.submittedClaimId = 1;
        body.data = { ...claim, id: 1, deliveryState: "ACCEPTED", externalClaimId: "42" };
      } else if (/\/claims\/submissions\/\d+\/review$/.test(path)) {
        const id = Number(path.split("/").at(-2));
        const review = route.request().postDataJSON();
        assert.equal(review.action, "RETURN");
        assert.equal(review.note, "Please attach a clearer report.");
        approvalRows = approvalRows.filter((row) => row.id !== id);
      } else if (path.endsWith("/claims/submissions/1")) body.data = claim;
      else if (
        path.endsWith("/claims/submissions") &&
        approvalRows !== null &&
        new URL(route.request().url()).searchParams.get("awaitingReview") === "true"
      ) {
        const query = new URL(route.request().url()).searchParams;
        const page = Number(query.get("page")),
          limit = Number(query.get("limit"));
        assert.equal(limit, 10);
        body = {
          success: true,
          data: approvalRows.slice((page - 1) * limit, page * limit),
          pagination: {
            total: approvalRows.length,
            totalPages: Math.ceil(approvalRows.length / limit),
          },
        };
      } else if (path.endsWith("/claims/submissions"))
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
      } else if (path.endsWith("/member-portal/claims")) body.data = [claim, ...extraClaims];
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
        await page.evaluate(async (value) => {
          document.documentElement.style.zoom = String(value);
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
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
        if (name === "claim-review-modal") {
          const bounds = await page
            .getByRole("dialog", { name: "Review claim", exact: true })
            .boundingBox();
          assert.ok(
            bounds && bounds.y >= 0 && bounds.y + bounds.height <= 901,
            `Review modal must fit vertically at ${width}/${zoom}`,
          );
        }
      }
      await page.evaluate(async () => {
        document.documentElement.style.zoom = "1";
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      if (name === "claim-review-modal")
        await page
          .getByRole("dialog", { name: "Review claim", exact: true })
          .evaluate((element) => {
            element.scrollTop = 0;
          });
      await page.screenshot({ path: `test-results/claims/${name}-${width}.png`, fullPage: true });
    };
    await open("/claims/1");
    await page.getByText("Saved Hospital", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Approve and forward", exact: true }).waitFor();
    await page.getByText(/Assessment information becomes available/).waitFor();
    await verifyLayout("awaiting-review");
    approvalRows = Array.from({ length: 11 }, (_, index) => ({ ...base, id: index + 1 }));
    await open("/claims/approvals");
    await page.getByText("CLM-000001", { exact: true }).waitFor();
    assert.equal(await page.getByRole("table").getByRole("row").count(), 11);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByText("CLM-000011", { exact: true }).waitFor();
    assert.equal(await page.getByRole("table").locator("tbody tr td").first().textContent(), "11");
    const approvalActions = page.getByRole("button", { name: /Actions for this/ });
    await approvalActions.scrollIntoViewIfNeeded();
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await approvalActions.click();
    await page.getByRole("menuitem", { name: "Review", exact: true }).click();
    const reviewDialog = page.getByRole("dialog", { name: "Review claim", exact: true });
    await reviewDialog.waitFor();
    assert.equal(
      await page
        .getByRole("table")
        .getByText(/Approval forwards/)
        .count(),
      0,
    );
    await reviewDialog.getByRole("button", { name: "Return for correction", exact: true }).click();
    assert.ok(
      await reviewDialog.getByRole("button", { name: "Confirm return", exact: true }).isDisabled(),
    );
    await reviewDialog
      .getByLabel("Review note", { exact: false })
      .fill("Please attach a clearer report.");
    await verifyLayout("claim-review-modal");
    await reviewDialog.getByRole("button", { name: "Confirm return", exact: true }).click();
    await page.getByText("CLM-000001", { exact: true }).waitFor();
    assert.equal(await reviewDialog.count(), 0);
    assert.equal(await page.getByRole("table").locator("tbody tr td").first().textContent(), "1");
    await verifyLayout("claim-approvals-numbered");
    approvalRows = null;
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
      await page.getByRole("heading", { name: "Claims Portal assessment", exact: true }).count(),
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
    await page.getByRole("button", { name: "Check Claims Portal history" }).click();
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
    await page.getByRole("table").getByText("Received by Claims Portal", { exact: true }).waitFor();
    await page.getByText("Claims Portal: Awaiting Approval", { exact: true }).waitFor();
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
    const requestsBeforeSubmissions = historyRequests;
    await open("/member/claims");
    await page.getByRole("button", { name: "View details for claim 1", exact: true }).waitFor();
    assert.equal(historyRequests, requestsBeforeSubmissions);
    assert.equal(await page.getByText(/Claims Portal history is unavailable/).count(), 0);
    await page.getByRole("main").getByRole("link", { name: "Claim History", exact: true }).click();
    await page
      .getByText("Claims Portal history is unavailable. Please try refreshing history.", {
        exact: true,
      })
      .waitFor();
    assert.equal(await page.getByRole("table").count(), 0);
    failHistory = false;
    historyRows = Array.from({ length: 13 }, (_, index) => ({
      id: `lookup-${index}`,
      claimNumber: index < 2 ? "REPEATED-DISPLAY-42" : `MC-${13 - index}`,
      name: member.fullName,
      claimDate: "2026-10-28 10:00:00",
      amountPayable: index === 1 ? null : "0.00",
      status: index === 2 ? "New insurer queue" : "Awaiting Approval",
    }));
    await page.getByRole("button", { name: "Refresh history", exact: true }).click();
    const historyTable = page.getByRole("table", {
      name: "Claims Portal claim history",
      exact: true,
    });
    await historyTable.waitFor();
    assert.equal(await historyTable.getByRole("row").count(), 11);
    assert.equal(await historyTable.getByText("REPEATED-DISPLAY-42", { exact: true }).count(), 2);
    await historyTable.getByText("Not provided by Claims Portal", { exact: true }).waitFor();
    assert.match(await historyTable.locator("tbody tr").first().innerText(), /0\.00/);
    await page.getByLabel("Insurer status", { exact: true }).selectOption("New insurer queue");
    await page.getByText("1 of 13 records", { exact: true }).waitFor();
    await page.getByLabel("Claim date from", { exact: true }).fill("2026-10-28");
    await page.getByLabel("Claim date from", { exact: true }).press("Escape");
    await page.getByLabel("Claim date through", { exact: true }).fill("2026-10-28");
    await page.getByLabel("Claim date through", { exact: true }).press("Escape");
    assert.equal(await historyTable.getByRole("row").count(), 2);
    await verifyLayout("member-history-filters");
    await page.getByLabel("Claim date from", { exact: true }).click();
    await page.getByRole("dialog", { name: "Claim date from calendar", exact: true }).waitFor();
    await verifyLayout("member-history-calendar");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Clear filters", exact: true }).click();
    const nextHistory = page.getByRole("button", { name: "Next", exact: true });
    await nextHistory.focus();
    await page.keyboard.press("Enter");
    await page.getByText("Page 2 of 2", { exact: false }).waitFor();
    assert.equal(
      await historyTable.locator("tbody tr").first().locator("td").first().textContent(),
      "11",
    );
    failHistory = true;
    await page.getByRole("button", { name: "Refresh history", exact: true }).click();
    await page
      .getByText(
        "Could not refresh history; showing the last loaded results, which may be outdated.",
        { exact: true },
      )
      .waitFor();
    assert.equal(await historyTable.getByRole("row").count(), 4);
    await verifyLayout("member-claim-history");
    failHistory = false;
    historyRows = [];
    await page.getByRole("button", { name: "Refresh history", exact: true }).click();
    await page
      .getByText("No claims returned by Claims Portal for your membership.", { exact: true })
      .waitFor();
    if (width === 390) {
      await page.getByRole("button", { name: "More", exact: true }).click();
      await page
        .getByRole("complementary", { name: "More member navigation", exact: true })
        .getByRole("link", { name: "Claim History", exact: true })
        .waitFor();
      await page.keyboard.press("Escape");
    }
    await page.getByRole("link", { name: "Back to My Claims", exact: true }).click();
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
    extraClaims = Array.from({ length: 23 }, (_, index) => ({
      ...base,
      id: index + 2,
      source: index % 2 === 0 ? "STAFF" : "MEMBER_PORTAL",
      claimantType: "SPOUSE",
      status: index === 22 ? "RETURNED" : "PENDING",
    }));
    await open("/member/notifications");
    await page.getByText("Review note: Upload a clearer report", { exact: true }).waitFor();
    await verifyLayout("member-notifications");
    await page.getByRole("link", { name: "View claim", exact: true }).click();
    await page.locator("#claim-1").waitFor();
    await page.waitForFunction(() => document.activeElement?.id === "claim-1");
    assert.equal(new URL(page.url()).hash, "#claim-1");
    await page.getByText("Page 3 of 3", { exact: false }).waitFor();
    assert.equal(await page.locator("#claim-1").locator("td").first().textContent(), "24");
    await verifyLayout("member-paginated-claims");
    await page.getByRole("button", { name: "Previous", exact: true }).click();
    await page.getByRole("button", { name: "Previous", exact: true }).click();
    await page
      .locator("#claim-24")
      .getByRole("link", { name: "Edit & resubmit", exact: true })
      .waitFor();
    await page.locator("#claim-24").getByText("Staff on your behalf", { exact: true }).waitFor();
    await verifyLayout("member-staff-filed-claims");
    await page.getByLabel("Stage", { exact: true }).selectOption("Returned for correction");
    await page.getByLabel("Filed from", { exact: true }).fill("2026-10-28");
    await page.getByLabel("Filed from", { exact: true }).press("Escape");
    await page.getByLabel("Filed through", { exact: true }).fill("2026-10-28");
    await page.getByLabel("Filed through", { exact: true }).press("Escape");
    await page.getByText("1 of 24 claims", { exact: true }).waitFor();
    await page.getByLabel("Claim type", { exact: true }).selectOption("HOSPITALIZATION");
    await page.getByText("No claims match your filters.", { exact: true }).waitFor();
    await verifyLayout("member-claim-filters");
    await page.getByRole("button", { name: "Clear filters", exact: true }).click();
    extraClaims = [];
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
