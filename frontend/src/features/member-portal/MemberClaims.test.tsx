import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Link, MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import api from "@/lib/api";
import MemberClaims, { portalReference } from "./MemberClaims";
import type { ClaimItem } from "./MemberHome.shared";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));
vi.mock("@/features/claims/ClaimDraftList", () => ({ default: () => null }));
vi.mock("@/components/claims/ClaimDetailModal", () => ({
  default: ({
    submissionId,
    audience,
    onClose,
    onChanged,
  }: {
    submissionId: number;
    audience: string;
    onClose: () => void;
    onChanged: () => void;
  }) => (
    <div role="dialog" aria-label={`${audience} claim ${submissionId}`}>
      <button onClick={onClose}>Close details</button>
      <button onClick={onChanged}>Update assessment</button>
    </div>
  ),
}));
const claim = (id: number, extra: Partial<ClaimItem> = {}): ClaimItem => ({
  id,
  source: "MEMBER_PORTAL",
  provider: "Claims System",
  status: "PENDING",
  deliveryState: "NOT_SENT",
  claimType: "HOSPITALIZATION",
  claimantType: "MEMBER",
  externalClaimId: null,
  estimatedAmount: "100",
  reviewNote: null,
  errorMessage: null,
  submittedAt: null,
  createdAt: "2026-10-28T10:00:00Z",
  ...extra,
});
beforeEach(() => {
  vi.mocked(api.get).mockReset();
  Element.prototype.scrollIntoView = vi.fn();
});
const show = (path = "/member/claims") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <MemberClaims />
    </MemoryRouter>,
  );

it("shows numbered member and staff submissions, sorting equal dates by descending ID", async () => {
  const claims = Array.from({ length: 12 }, (_, index) => claim(index + 1));
  claims[11] = claim(12, {
    source: "STAFF",
    claimantType: "SPOUSE",
    status: "RETURNED",
    reviewNote: "Replace the report",
  });
  vi.mocked(api.get).mockResolvedValue({ data: { data: claims } });
  show();
  const table = await screen.findByRole("table", { name: "My claims" });
  const rows = within(table).getAllByRole("row");
  expect(rows).toHaveLength(11);
  expect(within(rows[1]).getByRole("rowheader")).toHaveTextContent("CLM-000012");
  expect(within(rows[1]).getAllByRole("cell")[0]).toHaveTextContent(/^1$/);
  expect(within(rows[1]).getByText("Staff on your behalf")).toBeVisible();
  expect(within(rows[1]).getByText("Spouse")).toBeVisible();
  expect(within(rows[1]).getByText("Returned for correction")).toBeVisible();
  expect(within(rows[1]).getByText("Review note: Replace the report")).toBeVisible();
  expect(within(rows[1]).getByRole("link", { name: "Edit & resubmit" })).toHaveAttribute(
    "href",
    "/member/claims/12/resubmit",
  );
  expect(within(rows[2]).getAllByText("Member")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  const secondPage = within(table).getAllByRole("row");
  expect(secondPage).toHaveLength(3);
  expect(within(secondPage[1]).getAllByRole("cell")[0]).toHaveTextContent(/^11$/);
  expect(within(secondPage[1]).getByRole("rowheader")).toHaveTextContent("CLM-000002");
  expect(portalReference(42)).toBe("CLM-000042");
  expect(api.get).toHaveBeenCalledTimes(1);
  expect(api.get).toHaveBeenCalledWith("/member-portal/claims", expect.anything());
});

it("selects and focuses an anchored claim beyond page one without trapping pagination", async () => {
  vi.mocked(api.get).mockResolvedValue({
    data: { data: Array.from({ length: 12 }, (_, index) => claim(index + 1)) },
  });
  show("/member/claims#claim-1");
  const row = await screen.findByRole("row", { name: "Claim 1" });
  await waitFor(() => expect(row).toHaveFocus());
  expect(screen.getByText(/Page 2 of 2/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Previous" }));
  expect(screen.getByText(/Page 1 of 2/)).toBeVisible();
  expect(screen.queryByRole("row", { name: "Claim 1" })).not.toBeInTheDocument();
});

it("clears active filters when a notification targets a hidden claim", async () => {
  vi.mocked(api.get).mockResolvedValue({
    data: {
      data: Array.from({ length: 12 }, (_, index) =>
        claim(index + 1, index === 11 ? { status: "RETURNED" } : {}),
      ),
    },
  });
  render(
    <MemoryRouter initialEntries={["/member/claims"]}>
      <Link to="/member/claims#claim-1">Notification target</Link>
      <MemberClaims />
    </MemoryRouter>,
  );
  await screen.findByRole("table");
  fireEvent.change(screen.getByLabelText("Stage"), {
    target: { value: "Returned for correction" },
  });
  expect(screen.queryByRole("row", { name: "Claim 1" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: "Notification target" }));
  const row = await screen.findByRole("row", { name: "Claim 1" });
  await waitFor(() => expect(row).toHaveFocus());
  expect(screen.getByLabelText("Stage")).toHaveValue("");
  expect(screen.getByText(/Page 2 of 2/)).toBeVisible();
});

it("orders dates before IDs and refreshes the stage after the member details modal updates", async () => {
  vi.mocked(api.get).mockResolvedValueOnce({
    data: { data: [claim(42), claim(1, { createdAt: "2026-10-29T10:00:00Z" })] },
  });
  show();
  const table = await screen.findByRole("table", { name: "My claims" });
  expect(within(table).getAllByRole("rowheader")[0]).toHaveTextContent("CLM-000001");
  fireEvent.click(screen.getByRole("button", { name: "View details for claim 1" }));
  expect(screen.getByRole("dialog", { name: "member claim 1" })).toBeVisible();
  vi.mocked(api.get).mockResolvedValueOnce({
    data: {
      data: [
        claim(1, {
          status: "SUBMITTED",
          deliveryState: "ACCEPTED",
          externalClaimId: "lookup-99",
          externalStatus: "Awaiting Approval",
        }),
      ],
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Update assessment" }));
  expect(await within(table).findByText("Received by Claims Portal")).toBeVisible();
  expect(screen.getByText("Claims Portal: Awaiting Approval")).toBeVisible();
  expect(screen.getByText("CLM-000001")).toBeVisible();
  expect(screen.queryByText("lookup-99")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Close details" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("combines type, stage and inclusive filed dates, resets pagination, and clears filters", async () => {
  vi.mocked(api.get).mockResolvedValue({
    data: {
      data: [
        ...Array.from({ length: 12 }, (_, index) => claim(index + 1)),
        claim(42, { status: "RETURNED", createdAt: "2026-10-29T10:00:00Z" }),
        claim(43, { claimType: "DEATH", createdAt: "2026-10-29T10:00:00Z" }),
      ],
    },
  });
  show();
  await screen.findByRole("table");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.change(screen.getByLabelText("Stage"), {
    target: { value: "Returned for correction" },
  });
  expect(screen.getByText("1 of 14 claims")).toBeVisible();
  expect(screen.queryByRole("navigation", { name: "Pagination" })).not.toBeInTheDocument();
  expect(screen.getByRole("row", { name: "Claim 42" })).toBeVisible();
  fireEvent.change(screen.getByLabelText("Filed from"), { target: { value: "2026-10-29" } });
  fireEvent.change(screen.getByLabelText("Filed through"), { target: { value: "2026-10-29" } });
  expect(screen.getByRole("row", { name: "Claim 42" })).toBeVisible();
  fireEvent.change(screen.getByLabelText("Claim type"), { target: { value: "DEATH" } });
  expect(screen.getByText("No claims match your filters.")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Stage"), { target: { value: "" } });
  expect(screen.getByRole("row", { name: "Claim 43" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(screen.getByText(/Page 1 of 2/)).toBeVisible();
  expect(screen.getByText("14 of 14 claims")).toBeVisible();
  expect(api.get).toHaveBeenCalledTimes(1);
});

it("distinguishes a local load failure from no claims, and allows retry", async () => {
  vi.mocked(api.get).mockRejectedValueOnce(new Error("offline"));
  show();
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load your claims");
  expect(screen.queryByText("You haven't submitted any claims yet.")).not.toBeInTheDocument();
  vi.mocked(api.get).mockResolvedValueOnce({ data: { data: [] } });
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("You haven't submitted any claims yet.")).toBeVisible();
  expect(screen.getByRole("link", { name: "Claim History" })).toHaveAttribute(
    "href",
    "/member/claims/history",
  );
});
