import { chromium } from "@playwright/test";
import { preview } from "vite";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

// Every API call is mocked. No records, notifications or claims reach a real service.
const server = await preview({ preview: { host: "127.0.0.1", port: 4186, strictPort: true } });
const browser = await chromium.launch({
  channel: process.platform === "win32" ? "msedge" : undefined,
  headless: true,
});
const member = {
  id: 7,
  controllerId: "TEST1234",
  fullName: "Draft Test Member",
  status: "ACTIVE",
  school: "Test School",
  ghanaCardId: "GHA-123456789-0",
  phone: null,
  email: null,
  spouse: null,
  beneficiaries: [],
  district: { id: 9, name: "Test District", region: { id: 3, name: "Test Region" } },
};
await fs.mkdir("test-results/drafts", { recursive: true });
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
    page.on("dialog", (dialog) =>
      dialog.type() === "beforeunload" ? dialog.accept() : dialog.dismiss(),
    );
    const drafts = [],
      submissions = [],
      files = new Map();
    let deletedFiles = 0,
      nextDraftId = 1;
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url()),
        path = url.pathname,
        method = route.request().method(),
        audience = path.includes("member-portal") ? "member" : "staff";
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
      else if (path.endsWith("/notifications/unread-count")) body.data = { count: 0 };
      else if (path.endsWith("/member-portal/notifications"))
        body = { success: true, data: [], unreadCount: 0 };
      else if (path.endsWith("/member-portal/profile"))
        body.data = {
          member,
          profileCompletion: { complete: true, percentage: 100, missing: [] },
          benefitPlan: {
            benefits: [{ type: "HOSPITALIZATION", enabled: true, namedConditions: [] }],
          },
        };
      else if (path.endsWith("/claims/member-lookup")) body.data = member;
      else if (path.endsWith("/claims/estimate"))
        body.data = { available: true, amount: "8000", note: null };
      else if (
        path.endsWith("/member-portal/claims/documents") ||
        path.endsWith("/members/7/files")
      ) {
        const id = files.size + 100;
        const file = { id, slotKey: "dischargeSummaryOrBill", originalName: "draft-report.pdf" };
        files.set(id, file);
        body.data = file;
      } else if (
        method === "DELETE" &&
        (/\/files\/\d+$/.test(path) || /\/claims\/documents\/\d+$/.test(path))
      ) {
        deletedFiles++;
      } else if (/\/claims\/drafts(?:\/\d+)?$/.test(path)) {
        const id = Number(path.split("/").at(-1)),
          existing = drafts.find((draft) => draft.id === id && draft.audience === audience);
        if (method === "POST" || method === "PUT") {
          const input = route.request().postDataJSON();
          assert.equal("declaration" in input.payload, false);
          if (
            method === "PUT" &&
            (!existing || existing.revision !== input.revision || existing.submittedClaimId)
          )
            return route.fulfill({
              status: 409,
              json: { message: "Draft changed in another tab. Reload before saving." },
            });
          const saved = {
            ...existing,
            id: existing?.id ?? nextDraftId++,
            revision: (existing?.revision ?? 0) + 1,
            memberId: 7,
            member,
            audience,
            payload: input.payload,
            documentIds: input.documentIds,
            documents: input.documentIds.map((fileId) => files.get(fileId)),
            submissionKey: existing?.submissionKey ?? input.submissionKey,
            updatedAt: "2026-10-29T12:00:00Z",
          };
          if (existing) Object.assign(existing, saved);
          else drafts.push(saved);
          body.data = saved;
        } else if (method === "DELETE") {
          assert.ok(existing && existing.revision === Number(url.searchParams.get("revision")));
          drafts.splice(drafts.indexOf(existing), 1);
        } else if (Number.isFinite(id)) {
          if (!existing)
            return route.fulfill({ status: 404, json: { message: "Draft not found" } });
          if (existing.submittedClaimId)
            return route.fulfill({
              status: 409,
              json: { message: "Already submitted", submissionId: existing.submittedClaimId },
            });
          body.data = existing;
        } else {
          const visible = drafts.filter(
            (draft) => draft.audience === audience && !draft.submittedClaimId,
          );
          body = {
            success: true,
            data: visible,
            pagination: { total: visible.length, totalPages: 1 },
          };
        }
      } else if (
        (path.endsWith("/claims/submissions") || path.endsWith("/member-portal/claims")) &&
        method === "POST"
      ) {
        const input = route.request().postDataJSON(),
          draft = drafts.find((item) => item.id === input.draftId && item.audience === audience);
        assert.ok(draft);
        assert.equal(input.draftRevision, draft.revision);
        assert.equal(route.request().headers()["idempotency-key"], draft.submissionKey);
        assert.equal(draft.submittedClaimId, undefined);
        const submitted = {
          ...input,
          id: submissions.length + 50,
          member,
          source: audience === "member" ? "MEMBER_PORTAL" : "STAFF",
          status: audience === "member" ? "PENDING" : "SUBMITTED",
          deliveryState: audience === "member" ? "NOT_SENT" : "ACCEPTED",
          provider: "Claims System",
          externalClaimId: audience === "staff" ? "EX-50" : null,
          externalStatus: null,
          estimatedAmount: "8000",
          createdAt: "2026-10-29T12:00:00Z",
          submittedAt: audience === "staff" ? "2026-10-29T12:00:00Z" : null,
        };
        draft.submittedClaimId = submitted.id;
        draft.revision++;
        submissions.push(submitted);
        body.data = submitted;
      } else if (path.endsWith("/claims/submissions"))
        body = {
          success: true,
          data: submissions,
          pagination: { total: submissions.length, totalPages: 1 },
        };
      else if (path.endsWith("/member-portal/claims")) body.data = submissions;
      await route.fulfill({ json: body });
    });
    const open = (path) => page.goto(`http://127.0.0.1:4186${path}`);
    const settle = () =>
      page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
    const check = async (name) => {
      for (const zoom of [1, 2]) {
        await page.evaluate((value) => {
          document.documentElement.style.zoom = String(value);
        }, zoom);
        await settle();
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
          false,
          `${name} overflow ${width}/${zoom}`,
        );
      }
      await page.evaluate(() => {
        document.documentElement.style.zoom = "1";
      });
      await settle();
      await page.screenshot({ path: `test-results/drafts/${name}-${width}.png`, fullPage: true });
    };
    for (const audience of ["member", "staff"]) {
      const formPath = audience === "member" ? "/member/claims/new" : "/claims/new",
        listPath = audience === "member" ? "/member/claims" : "/claims",
        before = submissions.length;
      await open(formPath);
      if (audience === "staff") {
        await page.getByLabel("Staff ID", { exact: false }).fill(member.controllerId);
        await page.getByRole("button", { name: "Continue", exact: true }).click();
      }
      await page.getByRole("button", { name: /Hospitalization/ }).click();
      await page.getByLabel("Name of hospital", { exact: false }).fill("Draft Hospital");
      await page.getByLabel("Ghana Card number", { exact: false }).fill("GHA-123");
      const category = page.getByRole("group", {
        name: /Hospital Discharge Summary or Medical Bill/,
      });
      await category.getByLabel("Attach document", { exact: true }).setInputFiles({
        name: "draft-report.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4 draft test"),
      });
      await page.getByText("1 of 1 required", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Save draft", exact: true }).click();
      await page.waitForURL((url) => url.searchParams.has("draft"));
      const id = Number(new URL(page.url()).searchParams.get("draft"));
      assert.equal(submissions.length, before);
      assert.equal(
        await page
          .getByLabel("Date of admission", { exact: false })
          .evaluate((input) => input.validity.valueMissing),
        true,
        "The draft saves while required admission details are incomplete",
      );
      await page.getByText(/Still to complete/).click();
      await page.getByText("Admission date", { exact: true }).waitFor();
      await check(`${audience}-incomplete-draft`);
      await page.getByRole("button", { name: /Back to claims/ }).click();
      await page.waitForURL(`**${listPath}`);
      await page.getByRole("link", { name: "Resume", exact: true }).click();
      await page.locator('input[value="Draft Hospital"]').waitFor();
      await page.getByRole("button", { name: "Remove draft-report.pdf", exact: true }).waitFor();
      assert.equal(
        await page.getByLabel("Ghana Card number", { exact: false }).inputValue(),
        "GHA-123",
      );
      await page.getByRole("button", { name: "Remove draft-report.pdf", exact: true }).click();
      await page.getByRole("button", { name: /Back to claims/ }).click();
      await page
        .getByRole("dialog", { name: "Leave this claim?", exact: true })
        .getByRole("button", { name: "Discard changes", exact: true })
        .click();
      await page.getByRole("link", { name: "Resume", exact: true }).click();
      await page.getByRole("button", { name: "Remove draft-report.pdf", exact: true }).waitFor();
      assert.equal(deletedFiles, 0);
      await page.getByLabel("Name of hospital", { exact: false }).fill("Changed hospital");
      await page.getByRole("button", { name: /Back to claims/ }).click();
      await page
        .getByRole("dialog", { name: "Leave this claim?", exact: true })
        .getByRole("button", { name: "Keep editing", exact: true })
        .click();
      assert.equal(
        await page.getByLabel("Name of hospital", { exact: false }).inputValue(),
        "Changed hospital",
      );
      await page.getByRole("button", { name: /Back to claims/ }).click();
      await page.getByRole("button", { name: "Save draft and leave", exact: true }).click();
      await page.getByRole("link", { name: "Resume", exact: true }).click();
      await page.locator('input[value="Changed hospital"]').waitFor();
      drafts.find((draft) => draft.id === id).revision++;
      await page.getByLabel("Name of hospital", { exact: false }).fill("My conflicting edits");
      await page.getByRole("button", { name: "Save draft", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "Draft changed in another tab" }).waitFor();
      assert.equal(
        await page.getByLabel("Name of hospital", { exact: false }).inputValue(),
        "My conflicting edits",
      );
      await check(`${audience}-draft-conflict`);
      await page.getByRole("button", { name: /Back to claims/ }).click();
      await page.getByRole("button", { name: "Discard changes", exact: true }).click();
      await page.getByRole("link", { name: "Resume", exact: true }).click();
      await page.locator('input[value="Changed hospital"]').waitFor();
      await page.getByLabel("Ghana Card number", { exact: false }).fill("GHA-123456789-0");
      await page.getByLabel("Date of admission", { exact: false }).fill("2026-07-01");
      await page.getByLabel("Date of discharge", { exact: false }).fill("2026-07-12");
      await page.getByLabel("Reason for hospitalization", { exact: false }).fill("Recovery");
      await page.getByRole("button", { name: "Next", exact: true }).click();
      const declaration = page.getByRole("checkbox", { name: /I accept this declaration/ });
      await declaration.check();
      await page.getByRole("button", { name: "Save draft", exact: true }).click();
      await page.getByText(/^Saved\. Last saved/).waitFor();
      await page.getByRole("button", { name: /Back to claims/ }).click();
      await page.getByRole("link", { name: "Resume", exact: true }).click();
      await page.getByLabel("Name of hospital", { exact: false }).waitFor();
      await page.getByRole("button", { name: "Next", exact: true }).click();
      assert.equal(await declaration.isChecked(), false);
      await declaration.check();
      await page.getByRole("button", { name: "Submit claim", exact: true }).click();
      await page.waitForURL(`**${listPath}`);
      await page.getByText(/No saved drafts/).waitFor();
      assert.equal(submissions.length, before + 1);
      await check(`${audience}-submitted-draft-removed`);
      await open(formPath);
      if (audience === "staff") {
        await page.getByLabel("Staff ID", { exact: false }).fill(member.controllerId);
        await page.getByRole("button", { name: "Continue", exact: true }).click();
      }
      await page.getByRole("button", { name: /Hospitalization/ }).click();
      await page
        .getByLabel("Name of hospital", { exact: false })
        .fill("Delete this unfinished draft");
      await page.getByRole("button", { name: "Save draft", exact: true }).click();
      await page.waitForURL((url) => url.searchParams.has("draft"));
      const deleteId = Number(new URL(page.url()).searchParams.get("draft"));
      await page.getByRole("button", { name: /Back to claims/ }).click();
      const actions = page.getByRole("button", {
        name: `Actions for draft ${deleteId}`,
        exact: true,
      });
      await actions.scrollIntoViewIfNeeded();
      await settle();
      await actions.click();
      await page.getByRole("menuitem", { name: "Delete draft", exact: true }).click();
      await page
        .getByRole("dialog", { name: "Delete draft?", exact: true })
        .getByRole("button", { name: "Delete draft", exact: true })
        .click();
      await page.getByText(/No saved drafts/).waitFor();
      assert.equal(deletedFiles, 0);
    }
    assert.deepEqual(errors, []);
    results.push({
      width,
      errors,
      submittedMocks: submissions.length,
      deletedAttachments: deletedFiles,
    });
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
console.log(JSON.stringify(results, null, 2));
