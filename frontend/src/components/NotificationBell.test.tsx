import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import NotificationBell from "./NotificationBell";
import api from "@/lib/api";
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), patch: vi.fn() } }));
const item = {
  id: 1,
  title: "New claim",
  message: "Member submitted a claim",
  type: "MEMBER_CLAIM_SUBMITTED",
  readAt: null,
  createdAt: "2026-10-29T16:00:00Z",
  actionUrl: "/claims/42",
};
beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.patch).mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});
function Location() {
  return <output>{useLocation().pathname}</output>;
}
it("refreshes the list on every opening and keeps saved results on a failed refresh", async () => {
  let fail = false;
  let items = [item];
  vi.mocked(api.get).mockImplementation(async (url) => {
    if (url === "/notifications/unread-count") return { data: { data: { count: items.length } } };
    if (fail) throw new Error("offline");
    return { data: { data: items } };
  });
  render(
    <MemoryRouter>
      <NotificationBell />
    </MemoryRouter>,
  );
  const bell = screen.getByRole("button", { name: "Notifications" });
  await userEvent.click(bell);
  await screen.findByText("New claim");
  await userEvent.click(bell);
  items = [{ ...item, id: 2, title: "Another claim" }];
  await userEvent.click(bell);
  await screen.findByText("Another claim");
  await userEvent.click(bell);
  fail = true;
  await userEvent.click(bell);
  await screen.findByRole("alert");
  expect(screen.getByText("Another claim")).toBeInTheDocument();
  expect(screen.queryByText("No notifications yet.")).not.toBeInTheDocument();
});
it("refreshes the open list when its unread polling interval runs", async () => {
  vi.useFakeTimers();
  let title = "First claim";
  vi.mocked(api.get).mockImplementation(async (url) => ({
    data: { data: url === "/notifications/unread-count" ? { count: 1 } : [{ ...item, title }] },
  }));
  render(
    <MemoryRouter>
      <NotificationBell />
    </MemoryRouter>,
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
  });
  expect(screen.getByText("First claim")).toBeInTheDocument();
  title = "Fresh claim";
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(screen.getByText("Fresh claim")).toBeInTheDocument();
});
it("opens the linked staff claim and marks only that notification as read", async () => {
  vi.mocked(api.get).mockImplementation(async (url) => ({
    data: { data: url === "/notifications/unread-count" ? { count: 1 } : [item] },
  }));
  vi.mocked(api.patch).mockResolvedValue({});
  render(
    <MemoryRouter>
      <NotificationBell />
      <Location />
    </MemoryRouter>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Notifications" }));
  await userEvent.click(await screen.findByRole("link", { name: "View claim" }));
  expect(screen.getByText("/claims/42")).toBeInTheDocument();
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/notifications/1/read"));
});
