import assert from "node:assert/strict";
import test from "node:test";
import { MankradoClaimsProvider } from "./mankrado.provider.js";
import { ClaimsDeliveryError, type ClaimSubmissionInput } from "./claims.provider.js";
import { CLAIM_FILE_FIELDS, parseHistory, parseDetails, parseSubmission, submissionForm } from "./mankrado.contract.js";
import { validateClaimFile } from "./claims.documents.js";
import { hasRequiredDocuments } from "./claims.schemas.js";
import { deliverClaim } from "./claims.delivery.js";

const input: ClaimSubmissionInput = {
  idempotencyKey: "staff:1:test", member: { id: 1, controllerId: "123456", fullName: "Test Member" },
  claimType: "HOSPITALIZATION", claimantType: "MEMBER", claimantName: "Test Member", claimantIdType: "GHANA_CARD", claimantIdNumber: "TEST",
  claimantContact: { fullName: "Test Contact", primaryPhone: "0200000000" },
  claimDetails: { admissionDate: "2026-08-01T00:00:00.000Z", dischargeDate: "2026-08-12", hospitalName: "Test Hospital" },
  paymentMethod: "CHEQUE", paymentDetails: { payeeName: "Test Member" },
  documents: [{ field: "hospital_med", name: "report.pdf", mimeType: "application/pdf", bytes: new TextEncoder().encode("%PDF-1.4 test") }],
};
const config = { enabled: true, mode: "API" as const, baseUrl: "https://example.test/gnatsupreme/", apiKey: "test-key" };

test("multipart uses mapped fields, dates, actual file bytes, API key, and preserved base path", async () => {
  const provider = new MankradoClaimsProvider(config, async (url, options) => {
    assert.equal(String(url), "https://example.test/gnatsupreme/claim/submit");
    assert.equal(options?.method, "POST");
    assert.equal(new Headers(options?.headers).get("x-api-key"), "test-key");
    assert.equal(new Headers(options?.headers).has("content-type"), false);
    assert.equal(options?.redirect, "error");
    assert.ok(options?.signal);
    const form = options?.body as FormData;
    assert.equal(form.has("staff_id"), false);
    assert.equal(form.get("submissionReference"), input.idempotencyKey);
    assert.equal(form.get("contactName"), "Test Contact");
    assert.equal(form.get("mobileNumber"), "0200000000");
    assert.equal(form.get("claimant"), "Test Member");
    assert.equal(form.get("payeeName"), "Test Member");
    assert.equal(form.get("adminDate"), "2026-08-01");
    assert.equal(form.get("claimType"), "hospital");
    assert.equal(form.get("ghanaCardNumber"), "TEST");
    assert.equal(await (form.get("hospital_med") as File).text(), "%PDF-1.4 test");
    const wire = new Request(String(url), { method: "POST", body: form });
    assert.match(wire.headers.get("content-type")!, /multipart\/form-data; boundary=/);
    assert.match(await wire.text(), /filename="report.pdf"/);
    return Response.json({ status: "200", claimId: "MK-1" }, { status: 200 });
  });
  assert.equal((await provider.createSubmission(input)).externalClaimId, "MK-1");
});

test("all agreed file mappings are present and death_doc remains reserved", () => {
  assert.deepEqual(Object.values(CLAIM_FILE_FIELDS).flatMap(Object.values).sort(), ["death_med", "death_cert", "death_police", "tpd_doc", "tpd_police", "ci_med", "ci_lab", "hospital_med"].sort());
  assert.equal(submissionForm(input).has("documents"), false);
});

test("file types and exact 1 MB boundary", () => {
  for (const [name, mime] of [["a.pdf", "application/pdf"], ["a.doc", "application/msword"], ["a.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"], ["a.JPG", "image/jpeg"]]) {
    assert.doesNotThrow(() => validateClaimFile({ originalName: name!, mimeType: mime!, sizeBytes: 1_000_000 }));
  }
  for (const sizeBytes of [0, 1_000_001]) assert.throws(() => validateClaimFile({ originalName: "a.pdf", mimeType: "application/pdf", sizeBytes }));
  assert.throws(() => validateClaimFile({ originalName: "a.png", mimeType: "image/png", sizeBytes: 10 }));
  assert.throws(() => validateClaimFile({ originalName: "a.exe", mimeType: "application/pdf", sizeBytes: 10 }));
  assert.equal(hasRequiredDocuments("HOSPITALIZATION", new Set()), false);
  assert.equal(hasRequiredDocuments("DEATH", new Set(["deathCertOrMortuary"])), true);
});

test("rejects missing/malformed status or claimId", () => {
  for (const body of [{ status: "200" }, { claimId: "MK-1" }, { status: "500", claimId: "MK-1" }, { status: "200", claimId: "" }]) {
    assert.throws(() => parseSubmission(body), (error: unknown) => error instanceof ClaimsDeliveryError && error.outcome === "UNKNOWN");
  }
});

test("HTTP failures, timeouts and malformed responses never imply acceptance", async () => {
  for (const [status, outcome] of [[401, "FAILED"], [422, "FAILED"], [500, "UNKNOWN"], [409, "UNKNOWN"]] as const) {
    const provider = new MankradoClaimsProvider(config, async () => new Response("private provider error", { status }));
    await assert.rejects(provider.createSubmission(input), (error: unknown) => error instanceof ClaimsDeliveryError && error.outcome === outcome && !error.message.includes("private"));
  }
  for (const transport of [async () => { throw new DOMException("timeout", "TimeoutError"); }, async () => new Response("not json")]) {
    await assert.rejects(new MankradoClaimsProvider(config, transport).createSubmission(input), (error: unknown) => error instanceof ClaimsDeliveryError && error.outcome === "UNKNOWN");
  }
});

test("history and details use encoded path segments and normalize provider responses", async () => {
  const urls: string[] = [];
  const provider = new MankradoClaimsProvider(config, async (url) => {
    urls.push(String(url));
    return Response.json(urls.length === 1 ? { status: "200", history: [{ claimNumber: 1788876358, name: "Test Member", claimDate: "2026-09-08", amountPayable: "20,000.0", claimStatus: "Awaiting Approval", staff_id: "123456" }] } : { status: "200", details: { claimNumber: "MC-1", name: "Test Member", claimDate: "2025-06-17 14:50:16.360", amountPayable: "8095.64", claimStatus: "ASSESSING", rejectReason: null } });
  });
  assert.equal((await provider.history("123456"))[0]?.staffId, "123456");
  assert.equal((await provider.details("MK/1")).status, "ASSESSING");
  assert.deepEqual(urls, ["https://example.test/gnatsupreme/claims/history/123456", "https://example.test/gnatsupreme/claimdetails/MK%2F1"]);
});

test("disabled configuration sends no requests", async () => {
  let calls = 0;
  const provider = new MankradoClaimsProvider({ ...config, enabled: false }, async () => { calls++; return Response.json({}); });
  await assert.rejects(provider.createSubmission(input));
  assert.equal(calls, 0);
});

function deliveryFixture(overrides: Record<string, unknown> = {}, fail = false) {
  const row: any = { id: 1, ...input, memberId: 1, source: "STAFF", provider: "MANKRADO", status: "PENDING", deliveryState: "NOT_SENT", documentIds: [1], ...overrides };
  let sends = 0;
  const dependencies: any = {
    db: { externalClaimSubmission: {
      updateMany: async ({ where, data }: any) => {
        assert.equal(where.deliveryState, "NOT_SENT");
        if (row.deliveryState !== "NOT_SENT" || row.provider !== "MANKRADO" || row.status !== "PENDING" || (row.source === "MEMBER_PORTAL" && !row.reviewedAt)) return { count: 0 };
        Object.assign(row, data); return { count: 1 };
      },
      findUniqueOrThrow: async () => ({ ...row }),
      update: async ({ data }: any) => { Object.assign(row, data); return row; },
    } },
    provider: { isConfigured: () => true, createSubmission: async () => { sends++; if (fail) throw new ClaimsDeliveryError("UNKNOWN", "TIMEOUT", "Unconfirmed"); return { externalClaimId: "MK-1", status: "SUBMITTED" }; } },
    documents: async () => input.documents,
  };
  return { row, dependencies, sends: () => sends };
}
test("atomic delivery prevents concurrent sends and persists confirmed acceptance", async () => {
  const fixture = deliveryFixture();
  await Promise.all([deliverClaim(1, fixture.dependencies), deliverClaim(1, fixture.dependencies)]);
  assert.equal(fixture.sends(), 1);
  assert.equal(fixture.row.deliveryState, "ACCEPTED");
  assert.equal(fixture.row.status, "SUBMITTED");
});
test("member claims require review and historical simulations are never sent", async () => {
  for (const overrides of [{ source: "MEMBER_PORTAL" }, { provider: "SIMULATION" }]) {
    const fixture = deliveryFixture(overrides); await deliverClaim(1, fixture.dependencies); assert.equal(fixture.sends(), 0);
  }
  const approved = deliveryFixture({ source: "MEMBER_PORTAL", reviewedAt: new Date() });
  await deliverClaim(1, approved.dependencies); assert.equal(approved.sends(), 1);
});
test("uncertain outcomes preserve review state and cannot be resent", async () => {
  const fixture = deliveryFixture({}, true);
  await deliverClaim(1, fixture.dependencies); await deliverClaim(1, fixture.dependencies);
  assert.equal(fixture.sends(), 1); assert.equal(fixture.row.deliveryState, "UNKNOWN"); assert.equal(fixture.row.status, "PENDING");
});

test("confirmed claim details envelope retains payment, rejection, date and display reference", () => {
  const payload = { status: "200", details: { claimNumber: "MC-0617-254542", name: "Test Member", claimDate: "2025-06-17 14:50:16.360", amountPayable: "8095.64", claimStatus: "Completed", rejectReason: null } };
  const result = parseDetails(payload, "42");
  assert.deepEqual(result, { id: "42", claimNumber: "MC-0617-254542", name: "Test Member", claimDate: "2025-06-17 14:50:16.360", amountPayable: "8095.64", status: "Completed", rejectReason: null });
  assert.equal(parseDetails({ ...payload, details: { ...payload.details, amountPayable: "0", rejectReason: "Document missing" } }, "42").amountPayable, "0");
  assert.equal(parseDetails({ ...payload, details: { ...payload.details, amountPayable: null, name: null, claimDate: null } }, "42").amountPayable, null);
  assert.throws(() => parseDetails({ ...payload, status: "404" }, "42"));
  assert.throws(() => parseDetails({ ...payload, details: { ...payload.details, amountPayable: "not money" } }, "42"));
  assert.throws(() => parseDetails({ status: "200", details: null }, "42"));
});

test("history parses confirmed envelope and comma-formatted amounts without discarding repeated rows", () => {
  const item = { claimNumber: 1788876358, name: "Test Member", claimDate: "2026-09-08", amountPayable: "20,000.0", claimStatus: "Awaiting Approval" };
  const rows = parseHistory({ status: "200", history: [item, item] });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { id: "1788876358", claimNumber: "1788876358", name: "Test Member", claimDate: "2026-09-08", amountPayable: "20000.0", status: "Awaiting Approval", staffId: undefined });
  assert.deepEqual(rows[0], rows[1]);
  assert.deepEqual(parseHistory({ status: "200", history: [] }), []);
  assert.equal(parseHistory({ status: 200, history: [{ ...item, claimNumber: "MC-1", amountPayable: "0" }] })[0]?.amountPayable, "0");
  assert.equal(parseHistory({ status: "200", history: [{ ...item, name: null, claimDate: null, amountPayable: null }] })[0]?.amountPayable, null);
  for (const amountPayable of ["20,00.0", "abc", "-20", "1,000,00"]) assert.throws(() => parseHistory({ status: "200", history: [{ ...item, amountPayable }] }));
  assert.throws(() => parseHistory({ status: "404", history: [] }));
  assert.throws(() => parseHistory({ status: "200", history: [{ ...item, claimDate: "2026-02-31" }] }));
});
