import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import api from "@/lib/api";
import { StaffAccountsTab } from "./StaffAccountsTab";
import { AuditLogTab } from "./AuditLogTab";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));
vi.mock("@/lib/useDistricts", () => ({
  useDistricts: () => ({
    districts: [{ id: 1, name: "Test District", region: { id: 1, name: "Test Region" } }],
  }),
}));
const staff = {
  id: 7,
  fullName: "Test Staff",
  email: "staff@example.test",
  role: "NATIONAL_ADMIN",
  isActive: true,
  regionId: null,
  districtId: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.mocked(api.get).mockResolvedValue({
    data: { data: [staff], pagination: { total: 40, totalPages: 2 } },
  });
  vi.mocked(api.post).mockResolvedValue({ data: {} });
  vi.mocked(api.patch).mockResolvedValue({ data: {} });
});

it("edits in a modal, preserves page and restores focus to its trigger", async () => {
  const user = userEvent.setup();
  render(<StaffAccountsTab isSuperAdmin />);
  await user.click(await screen.findByRole("button", { name: "Edit" }));
  const dialog = screen.getByRole("dialog", { name: "Edit staff account" });
  expect(screen.getAllByRole("row")).toHaveLength(2);
  await user.clear(within(dialog).getByLabelText("Full Name"));
  await user.type(within(dialog).getByLabelText("Full Name"), "Updated Staff");
  await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(api.patch).toHaveBeenCalledWith(
    "/users/7",
    expect.objectContaining({ fullName: "Updated Staff" }),
  );
  expect(screen.getByRole("button", { name: "Edit" })).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Edit" }));
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument();
});

it("adds staff in a modal and protects unsaved values when closing", async () => {
  const user = userEvent.setup();
  render(<StaffAccountsTab isSuperAdmin />);
  await screen.findByText("Test Staff");
  await user.click(screen.getByRole("button", { name: "Add Staff Account" }));
  let dialog = screen.getByRole("dialog", { name: "Add staff account" });
  await user.type(within(dialog).getByLabelText("Full Name"), "New Staff");
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "Keep editing" }));
  dialog = screen.getByRole("dialog");
  expect(within(dialog).getByLabelText("Full Name")).toHaveValue("New Staff");
  await user.type(within(dialog).getByLabelText("Email"), "new@example.test");
  await user.click(within(dialog).getByRole("button", { name: "Role" }));
  await user.click(within(dialog).getByRole("option", { name: "National Admin" }));
  await user.type(within(dialog).getByLabelText(/Temporary password/), "TestPassword123!");
  await user.click(within(dialog).getByRole("button", { name: "Create account" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(api.post).toHaveBeenCalledWith(
    "/users",
    expect.objectContaining({ fullName: "New Staff", role: "NATIONAL_ADMIN" }),
  );
});

it("keeps failed resets inside the modal and clears secrets after cancellation", async () => {
  const user = userEvent.setup();
  vi.mocked(api.patch).mockRejectedValue({ response: { data: { message: "Reset refused" } } });
  render(<StaffAccountsTab isSuperAdmin />);
  await user.click(await screen.findByRole("button", { name: "Reset password" }));
  const dialog = screen.getByRole("dialog");
  await user.type(within(dialog).getByLabelText(/New temporary password/), "TestPassword123!");
  await user.click(within(dialog).getByRole("button", { name: "Update password" }));
  expect(await within(dialog).findByText("Reset refused")).toBeInTheDocument();
  expect(within(dialog).getByLabelText(/New temporary password/)).toHaveValue("TestPassword123!");
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await user.click(screen.getByRole("button", { name: "Reset password" }));
  expect(screen.getByLabelText(/New temporary password/)).toHaveValue("");
});

it("confirms status changes in a modal and prevents duplicate submissions", async () => {
  const user = userEvent.setup();
  let resolve!: (value: object) => void;
  vi.mocked(api.patch).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(<StaffAccountsTab isSuperAdmin />);
  await user.click(await screen.findByRole("button", { name: "Deactivate" }));
  const button = within(screen.getByRole("dialog")).getByRole("button", {
    name: "Deactivate account",
  });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(api.patch).toHaveBeenCalledTimes(1);
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  resolve({ data: {} });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(api.patch).toHaveBeenCalledWith("/users/7/status", { isActive: false });
});

it("opens read-only audit details without expanding rows, including empty and false snapshots", async () => {
  const user = userEvent.setup();
  vi.mocked(api.get).mockResolvedValue({
    data: {
      data: [
        {
          id: 19,
          action: "USER_UPDATED",
          description: "Updated staff account",
          createdAt: "2026-10-30T12:00:00Z",
          actorEmail: "admin@example.test",
          actor: null,
          entityType: "User",
          entityId: "7",
          beforeData: false,
          afterData: null,
        },
      ],
      pagination: { total: 1, totalPages: 1 },
    },
  });
  render(<AuditLogTab />);
  const trigger = await screen.findByRole("button", { name: "View audit entry 19" });
  await user.click(trigger);
  const dialog = screen.getByRole("dialog", { name: "Audit entry details" });
  expect(screen.getAllByRole("row")).toHaveLength(2);
  expect(within(dialog).getByText("false")).toBeInTheDocument();
  expect(within(dialog).getByText("No snapshot recorded.")).toBeInTheDocument();
  expect(within(dialog).getByText("User #7")).toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
