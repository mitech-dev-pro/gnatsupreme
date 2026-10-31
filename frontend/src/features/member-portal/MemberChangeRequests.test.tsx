import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import api from "@/lib/api";
import MemberChangeRequests from "./MemberChangeRequests";
import type { ChangeRequest, MemberProfile } from "./MemberHome.shared";

vi.mock("@/lib/api", () => ({ default: { patch: vi.fn() } }));
const profile = { beneficiaries: [{ id: 9, fullName: "Child Name" }] } as MemberProfile;
const request = (id = 42): ChangeRequest => ({
  id,
  type: "MEMBER_DETAILS",
  status: "RETURNED",
  targetBeneficiaryId: null,
  proposedData: { school: "Proposed School" },
  requestNote: "Please check",
  reviewNote: "Use the full school name",
  requestedAt: "2026-10-29T12:00:00.000Z",
  reviewedAt: "2026-10-29T13:00:00.000Z",
  updatedAt: "2026-10-29T13:00:00.000Z",
});
beforeEach(() => {
  vi.mocked(api.patch).mockReset();
  Element.prototype.scrollIntoView = vi.fn();
});
function setup(
  items = [request()],
  options: { entry?: string; error?: string; loading?: boolean } = {},
) {
  const refresh = vi.fn().mockResolvedValue(undefined);
  render(
    <MemoryRouter initialEntries={[options.entry ?? "/member/requests"]}>
      <MemberChangeRequests
        items={items}
        profile={profile}
        loading={options.loading ?? false}
        error={options.error ?? ""}
        onRefresh={refresh}
      />
    </MemoryRouter>,
  );
  return refresh;
}

it("shows returned requests as needing correction and submits corrected values against the original version", async () => {
  vi.mocked(api.patch).mockResolvedValue({});
  const refresh = setup();
  expect(screen.getByText("0 awaiting review · 1 need your correction")).toBeInTheDocument();
  fireEvent.click(screen.getByText("1. My details"));
  fireEvent.click(screen.getByRole("button", { name: "Edit & resubmit" }));
  const form = screen.getByRole("form", { name: "Correct request 42" });
  expect(screen.getByText("Use the full school name")).toBeInTheDocument();
  fireEvent.change(within(form).getByLabelText("School"), {
    target: { value: "Corrected School" },
  });
  fireEvent.submit(form);
  await waitFor(() =>
    expect(api.patch).toHaveBeenCalledWith("/member-portal/change-requests/42/resubmit", {
      type: "MEMBER_DETAILS",
      proposedData: { school: "Corrected School" },
      requestNote: "Please check",
      expectedUpdatedAt: request().updatedAt,
    }),
  );
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  expect(await screen.findByText("Request #42 resubmitted for GNAT review.")).toBeInTheDocument();
});

it("keeps corrections and the staff reason visible when a stale submission fails", async () => {
  vi.mocked(api.patch).mockRejectedValue({
    response: { data: { message: "This request changed. Refresh it." } },
  });
  setup();
  fireEvent.click(screen.getByText("1. My details"));
  fireEvent.click(screen.getByRole("button", { name: "Edit & resubmit" }));
  fireEvent.change(screen.getByLabelText("School"), { target: { value: "My correction" } });
  fireEvent.submit(screen.getByRole("form"));
  expect(await screen.findByRole("alert")).toHaveTextContent("This request changed. Refresh it.");
  expect(screen.getByLabelText("School")).toHaveValue("My correction");
});

it("numbers across pages and opens and focuses a notification target beyond page one", async () => {
  const items = Array.from({ length: 12 }, (_, index) => ({
    ...request(100 - index),
    status: "PENDING" as const,
  }));
  setup(items, { entry: "/member/requests#request-89" });
  expect(await screen.findByText("Page 2 of 2 · 12 requests")).toBeInTheDocument();
  expect(screen.getByText("12. My details")).toBeInTheDocument();
  await waitFor(() => expect(document.activeElement).toHaveAttribute("id", "request-89"));
  expect(document.querySelector("#request-89 details")).toHaveAttribute("open");
  fireEvent.click(screen.getByRole("button", { name: "Previous" }));
  expect(screen.getByText("1. My details")).toBeInTheDocument();
});

it("retains loaded history on refresh failure and offers refresh without claiming it is empty", () => {
  setup([request()], { error: "Requests could not be refreshed." });
  expect(screen.getByText(/Showing previously loaded requests/)).toBeInTheDocument();
  expect(screen.getByText("1. My details")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Refresh requests" })).toBeEnabled();
});

it("requires confirmation before cancellation and never offers editing a closed request", async () => {
  vi.mocked(api.patch).mockResolvedValue({});
  const refresh = setup([{ ...request(), status: "PENDING" }]);
  fireEvent.click(screen.getByText("1. My details"));
  expect(screen.queryByRole("button", { name: "Edit & resubmit" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cancel request" }));
  expect(api.patch).not.toHaveBeenCalled();
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel request" }),
  );
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(api.patch).toHaveBeenCalledWith("/member-portal/change-requests/42/cancel", {
    expectedUpdatedAt: request().updatedAt,
  });
});

it("keeps removal corrections tied to the same beneficiary", async () => {
  vi.mocked(api.patch).mockResolvedValue({});
  setup([{ ...request(), type: "BENEFICIARY_REMOVE", targetBeneficiaryId: 9, proposedData: null }]);
  fireEvent.click(screen.getByText("1. Remove beneficiary"));
  expect(screen.getByText("Child Name")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Edit & resubmit" }));
  fireEvent.submit(screen.getByRole("form"));
  await waitFor(() =>
    expect(api.patch).toHaveBeenCalledWith(
      "/member-portal/change-requests/42/resubmit",
      expect.objectContaining({ type: "BENEFICIARY_REMOVE", targetBeneficiaryId: 9 }),
    ),
  );
});

it("allows clearing an optional Ghana Card without sending its empty mask", async () => {
  vi.mocked(api.patch).mockResolvedValue({});
  setup([{ ...request(), proposedData: { ghanaCardId: "GHA-123456789-0" } }]);
  fireEvent.click(screen.getByText("1. My details"));
  fireEvent.click(screen.getByRole("button", { name: "Edit & resubmit" }));
  const card = screen.getByLabelText("Ghana Card ID") as HTMLInputElement;
  fireEvent.change(card, { target: { value: "" } });
  expect(card.checkValidity()).toBe(true);
  fireEvent.submit(screen.getByRole("form"));
  await waitFor(() =>
    expect(api.patch).toHaveBeenCalledWith(
      "/member-portal/change-requests/42/resubmit",
      expect.objectContaining({ proposedData: { ghanaCardId: null } }),
    ),
  );
});
