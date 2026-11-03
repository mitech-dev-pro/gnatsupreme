import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import MemberNotifications from "./MemberNotifications";
import api from "@/lib/api";
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), patch: vi.fn() } }));
const notification = {
  id: 1,
  title: "Claim returned for correction",
  message: "Review note: Add a clearer report",
  type: "CLAIM_RETURNED",
  readAt: null,
  createdAt: "2026-10-29T16:00:00Z",
  actionUrl: "/member/claims/42/resubmit",
};
beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.patch).mockReset();
});
function Location() {
  const location = useLocation();
  return <output>{location.pathname + location.hash}</output>;
}
it("shows the review reason, opens correction and marks the notification as read", async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { data: [notification], unreadCount: 1 } });
  vi.mocked(api.patch).mockResolvedValue({});
  render(
    <MemoryRouter>
      <MemberNotifications />
      <Location />
    </MemoryRouter>,
  );
  await screen.findByText(/Add a clearer report/);
  await userEvent.click(screen.getByRole("link", { name: "Correct and resubmit" }));
  expect(screen.getByText("/member/claims/42/resubmit")).toBeInTheDocument();
  await waitFor(() =>
    expect(api.patch).toHaveBeenCalledWith("/member-portal/notifications/1/read"),
  );
});
it("preserves notifications during refresh failures and rejects unsafe action links", async () => {
  vi.mocked(api.get)
    .mockResolvedValueOnce({
      data: { data: [{ ...notification, actionUrl: "https://example.test" }], unreadCount: 1 },
    })
    .mockRejectedValue(new Error("offline"));
  render(
    <MemoryRouter>
      <MemberNotifications />
    </MemoryRouter>,
  );
  await screen.findByText(notification.title);
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Refresh notifications" }));
  await screen.findByText(/Could not refresh notifications/);
  expect(screen.getByText(notification.title)).toBeInTheDocument();
});
