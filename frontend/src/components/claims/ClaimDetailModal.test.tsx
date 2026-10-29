import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import ClaimDetailModal from "./ClaimDetailModal";
import api from "@/lib/api";
vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));
beforeEach(() => {
  vi.mocked(api.get).mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const claim = {
  id: 1,
  provider: "Claims System",
  source: "MEMBER_PORTAL",
  status: "PENDING",
  deliveryState: "NOT_SENT",
  externalClaimId: null,
  externalStatus: null,
  externalAssessment: null,
  claimType: "HOSPITALIZATION",
  claimantType: "MEMBER",
  claimantName: "Member",
  member: { id: 7, controllerId: "123456", fullName: "Member" },
  submittedByMember: { fullName: "Member", controllerId: "123456" },
  reviewedAt: null,
  submittedAt: null,
  createdAt: "2026-10-29T10:00:00Z",
  claimDetails: {
    hospitalName: "Saved Hospital",
    admissionDate: "2026-10-01",
    dischargeDate: "2026-10-12",
    reason: "Malaria",
  },
  claimantContact: { fullName: "Member", nationality: "Ghanaian" },
  paymentMethod: "CHEQUE",
  paymentDetails: { payeeName: "Saved Payee" },
  documents: [{ id: 3, slotKey: "dischargeSummaryOrBill", originalName: "report.pdf" }],
  notes: "Saved claim notes",
};

it("shows saved details and documents immediately through the member endpoint without staff controls", async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { data: claim } });
  render(
    <MemoryRouter>
      <ClaimDetailModal audience="member" submissionId={1} onClose={vi.fn()} />
    </MemoryRouter>,
  );
  await screen.findByText("Saved Hospital");
  expect(screen.getByText("Saved Payee")).toBeInTheDocument();
  expect(screen.getByText("Saved claim notes")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "report.pdf" })).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Retry|Send saved|Approve/ }),
  ).not.toBeInTheDocument();
  expect(api.get).toHaveBeenCalledTimes(1);
  expect(api.get).toHaveBeenCalledWith("/member-portal/claims/1", expect.anything());
});

it("keeps local details and the last assessment visible when Mankrado is unavailable", async () => {
  vi.mocked(api.get).mockImplementation(async (url) => {
    if (url === "/member-portal/claims/1")
      return {
        data: {
          data: {
            ...claim,
            deliveryState: "ACCEPTED",
            externalClaimId: "42",
            externalAssessment: {
              claimNumber: "MC-42",
              status: "Assessing",
              amountPayable: "0.00",
            },
            lastSyncedAt: "2026-10-29T10:00:00Z",
          },
        },
      };
    throw new Error("offline");
  });
  render(
    <MemoryRouter>
      <ClaimDetailModal audience="member" submissionId={1} onClose={vi.fn()} />
    </MemoryRouter>,
  );
  await screen.findByText("Could not refresh; showing the last saved assessment.");
  expect(screen.getByText("Saved Hospital")).toBeInTheDocument();
  expect(screen.getByText("MC-42")).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith("/member-portal/claims/1/assessment", expect.anything());
  expect(
    vi.mocked(api.get).mock.calls.every(([url]) => String(url).startsWith("/member-portal/")),
  ).toBe(true);
});

it("offers the existing correction route only for returned claims", async () => {
  vi.mocked(api.get).mockResolvedValue({
    data: { data: { ...claim, status: "RETURNED", reviewNote: "Replace the report" } },
  });
  render(
    <MemoryRouter>
      <ClaimDetailModal audience="member" submissionId={1} onClose={vi.fn()} />
    </MemoryRouter>,
  );
  const edit = await screen.findByRole("link", { name: "Edit and resubmit" });
  expect(edit).toHaveAttribute("href", "/member/claims/1/resubmit");
  expect(screen.getByText("Replace the report")).toBeInTheDocument();
});

it("downloads attached files through the owned member claim endpoint", async () => {
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi.fn(() => "blob:test");
      static revokeObjectURL = vi.fn();
    },
  );
  const clicked = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => undefined);
  vi.mocked(api.get).mockImplementation(async (url) =>
    url === "/member-portal/claims/1"
      ? { data: { data: claim } }
      : { data: new Blob(["test"], { type: "application/pdf" }) },
  );
  render(
    <MemoryRouter>
      <ClaimDetailModal audience="member" submissionId={1} onClose={vi.fn()} />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "report.pdf" }));
  await waitFor(() => expect(clicked).toHaveBeenCalledOnce());
  expect(api.get).toHaveBeenCalledWith("/member-portal/claims/1/documents/3", {
    responseType: "blob",
  });
});

it("ignores an obsolete local response when another claim is selected", async () => {
  let resolve!: (value: unknown) => void;
  vi.mocked(api.get)
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    )
    .mockResolvedValue({ data: { data: { ...claim, id: 2, notes: "Second claim" } } });
  const props = { audience: "member" as const, onClose: vi.fn() };
  const { rerender } = render(
    <MemoryRouter>
      <ClaimDetailModal {...props} submissionId={1} />
    </MemoryRouter>,
  );
  rerender(
    <MemoryRouter>
      <ClaimDetailModal {...props} submissionId={2} />
    </MemoryRouter>,
  );
  await screen.findByText("Second claim");
  await act(async () => resolve({ data: { data: claim } }));
  expect(screen.queryByText("Saved claim notes")).not.toBeInTheDocument();
});
