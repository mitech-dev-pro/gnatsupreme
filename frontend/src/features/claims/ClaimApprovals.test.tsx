import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import api from "@/lib/api";
import { reviewClaim } from "./claims.api";
import ClaimApprovals from "./ClaimApprovals";
vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));
vi.mock("./claims.api", () => ({ reviewClaim: vi.fn() }));
beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(reviewClaim).mockReset();
});
const row = (id: number) => ({
  id,
  member: { id: 1, fullName: "Test Member", controllerId: "123456" },
  provider: "Claims System",
  status: "PENDING",
  source: "MEMBER_PORTAL",
  deliveryState: "NOT_SENT",
  reviewedAt: null,
  claimType: "HOSPITALIZATION",
  claimantName: "Test Member",
  externalClaimId: null,
  estimatedAmount: "8000",
  submittedAt: null,
});
it("numbers server-paginated approvals and returns to the previous page after its last review", async () => {
  let reviewed = false;
  vi.mocked(api.get).mockImplementation(async (_path, config) => {
    const page = (config?.params as { page: number } | undefined)?.page;
    expect(config?.params).toMatchObject({ limit: 10, awaitingReview: "true" });
    return {
      data: {
        data:
          page === 2
            ? reviewed
              ? []
              : [row(11)]
            : Array.from({ length: 10 }, (_, index) => row(index + 1)),
        pagination: { total: reviewed ? 10 : 11, totalPages: reviewed ? 1 : 2 },
      },
    };
  });
  vi.mocked(reviewClaim).mockImplementation(async () => {
    reviewed = true;
  });
  render(
    <MemoryRouter initialEntries={["/claims/approvals?page=2"]}>
      <ClaimApprovals />
    </MemoryRouter>,
  );
  await screen.findByText("CLM-000011");
  const table = screen.getByRole("table");
  expect(within(table).getAllByRole("row")).toHaveLength(2);
  expect(within(table).getAllByRole("cell")[0]).toHaveTextContent(/^11$/);
  expect(screen.queryByRole("button", { name: /^Review/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Actions for this/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Review" }));
  expect(within(table).queryByText(/Approval forwards/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Approve and forward" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm approve and forward" }));
  await screen.findByText("CLM-000001");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(within(table).getAllByRole("row")).toHaveLength(11);
  expect(within(table).getAllByRole("cell")[0]).toHaveTextContent(/^1$/);
  expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
});
