import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import api from "@/lib/api";
import PendingApprovals from "./PendingApprovals";
import ChangeRequests from "./ChangeRequests";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));
let role = "SUPER_ADMIN";
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { role } }) }));
const member = (id = 1) => ({
  id,
  fullName: `Member ${id}`,
  controllerId: `C${id}`,
  status: "PENDING",
  school: "Current School",
  ghanaCardId: "GHA-123456789-0",
  report20Matched: true,
  phoneVerifiedAt: null,
  employmentCategory: "TEACHING",
  spouse: null,
  beneficiaries: [],
  _count: { beneficiaries: 0 },
  district: { name: "District", region: { name: "Region" } },
  createdAt: "2026-10-29T10:00:00Z",
  createdBy: null,
});
const request = {
  id: 42,
  type: "MEMBER_DETAILS",
  status: "PENDING",
  proposedData: { school: "New School" },
  member: member(),
  requestedAt: "2026-10-29T10:00:00Z",
  requestedBy: null,
  reviewedBy: null,
};
const response = (data: unknown[], total = data.length) => ({
  data: { data, pagination: { total, totalPages: Math.max(1, Math.ceil(total / 10)) } },
});
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(api.patch).mockReset();
  role = "SUPER_ADMIN";
});

it("keeps member approval failures inside the dialog and clamps the last page after success", async () => {
  let approved = false;
  vi.mocked(api.get).mockImplementation(async (_path, config) => {
    const page = (config?.params as { page?: number } | undefined)?.page ?? 1;
    return response(
      page === 2
        ? approved
          ? []
          : [member(11)]
        : Array.from({ length: 10 }, (_, index) => member(index + 1)),
      approved ? 10 : 11,
    );
  });
  vi.mocked(api.post)
    .mockRejectedValueOnce(new Error("offline"))
    .mockImplementationOnce(async () => {
      approved = true;
      return { data: { data: { requested: 1, succeeded: 1, failed: 0, results: [] } } };
    });
  render(
    <MemoryRouter initialEntries={["/approvals?page=2"]}>
      <PendingApprovals />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Actions for Member 11" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Review" }));
  fireEvent.click(screen.getByRole("button", { name: "Approve member" }));
  const dialog = screen.getByRole("dialog", { name: "Approve 1 member" });
  expect(within(dialog).getByText("Member 11")).toBeVisible();
  expect(within(screen.getByRole("table")).getAllByRole("cell")[1]).toHaveTextContent(/^11$/);
  fireEvent.click(within(dialog).getByRole("button", { name: "Approve members" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(/could not be approved/);
  fireEvent.click(within(dialog).getByRole("button", { name: "Approve members" }));
  await screen.findByRole("button", { name: "Actions for Member 1" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(within(screen.getByRole("table")).getAllByRole("cell")[1]).toHaveTextContent(/^1$/);
  expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  expect(api.post).toHaveBeenLastCalledWith("/members/bulk/approve", { memberIds: [11] });
});

it("requires a correction note for member returns and preserves it after failure", async () => {
  vi.mocked(api.get).mockResolvedValue(response([member()]));
  vi.mocked(api.post).mockRejectedValue(new Error("offline"));
  render(
    <MemoryRouter>
      <PendingApprovals />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole("checkbox", { name: "Select Member 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Return for correction" }));
  const dialog = screen.getByRole("dialog", { name: "Return 1 member for correction" });
  expect(within(dialog).getByRole("button", { name: "Confirm return" })).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText(/Review note/), {
    target: { value: "Missing document" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Confirm return" }));
  await within(dialog).findByRole("alert");
  expect(within(dialog).getByLabelText(/Review note/)).toHaveValue("Missing document");
  expect(api.post).toHaveBeenCalledWith("/members/bulk/return", {
    memberIds: [1],
    note: "Missing document",
  });
});

it("reviews a change request from its menu, retains notes on failure and reports success", async () => {
  let reviewed = false;
  vi.mocked(api.get).mockImplementation(async (path) =>
    path === "/change-requests"
      ? response(reviewed ? [] : [request])
      : { data: { data: member() } },
  );
  vi.mocked(api.patch)
    .mockRejectedValueOnce(new Error("offline"))
    .mockImplementationOnce(async () => {
      reviewed = true;
      return { data: {} };
    });
  render(
    <MemoryRouter>
      <ChangeRequests />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Actions for request 42" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Return for correction" }));
  const dialog = screen.getByRole("dialog", { name: "Return change request for correction" });
  expect(within(dialog).getByRole("button", { name: "Confirm return" })).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText(/Review note/), {
    target: { value: "Confirm the school" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Confirm return" }));
  await within(dialog).findByRole("alert");
  expect(within(dialog).getByLabelText(/Review note/)).toHaveValue("Confirm the school");
  fireEvent.click(within(dialog).getByRole("button", { name: "Confirm return" }));
  await screen.findByText("Request for Member 1 reviewed successfully.");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(api.patch).toHaveBeenLastCalledWith("/change-requests/42/review", {
    action: "RETURN",
    note: "Confirm the school",
  });
});

it("does not mistake failed list or member-detail loads for empty or reviewable records", async () => {
  vi.mocked(api.get).mockRejectedValue(new Error("offline"));
  const view = render(
    <MemoryRouter>
      <PendingApprovals />
    </MemoryRouter>,
  );
  await screen.findByRole("alert");
  expect(screen.queryByText("No pending approvals")).not.toBeInTheDocument();
  view.unmount();
  vi.mocked(api.get).mockImplementation(async (path) => {
    if (path === "/change-requests") return response([request]);
    throw Error("offline");
  });
  render(
    <MemoryRouter>
      <ChangeRequests />
    </MemoryRouter>,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The current member details could not be loaded",
  );
  expect(screen.queryByRole("button", { name: "Actions for request 42" })).not.toBeInTheDocument();
});

it("loads all statuses when requested and preserves read-only permissions", async () => {
  role = "READ_ONLY";
  vi.mocked(api.get).mockImplementation(async (path) =>
    path === "/change-requests" ? response([request]) : { data: { data: member() } },
  );
  render(
    <MemoryRouter>
      <ChangeRequests />
    </MemoryRouter>,
  );
  await screen.findByText("New School");
  expect(screen.queryByRole("button", { name: "Actions for request 42" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Filter by status" }));
  fireEvent.click(screen.getByRole("option", { name: "All statuses" }));
  await waitFor(() =>
    expect(api.get).toHaveBeenCalledWith(
      "/change-requests",
      expect.objectContaining({
        params: expect.objectContaining({ status: undefined, limit: 10 }),
      }),
    ),
  );
  expect(api.patch).not.toHaveBeenCalled();
});

it("reports partial bulk failures without losing the result after list refresh", async () => {
  vi.mocked(api.get).mockImplementation(async (path) =>
    path === "/change-requests"
      ? response([request, { ...request, id: 43 }])
      : { data: { data: member() } },
  );
  vi.mocked(api.post).mockResolvedValue({
    data: {
      data: {
        requested: 2,
        succeeded: 1,
        failed: 1,
        results: [{ id: 43, success: false, message: "Already reviewed" }],
      },
    },
  });
  render(
    <MemoryRouter>
      <ChangeRequests />
    </MemoryRouter>,
  );
  await screen.findByRole("button", { name: "Actions for request 42" });
  fireEvent.click(screen.getByRole("checkbox", { name: /Select all pending on this page/ }));
  fireEvent.click(screen.getByRole("button", { name: "Actions for selected requests" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Approve" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm approve" }));
  expect(await screen.findByText("1 of 2 applied.")).toBeVisible();
  expect(screen.getByText("Request #43: Already reviewed")).toBeVisible();
  expect(api.post).toHaveBeenCalledWith("/change-requests/bulk/review", {
    changeRequestIds: [42, 43],
    action: "APPROVE",
    note: null,
  });
});
