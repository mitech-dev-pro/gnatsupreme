import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import api from "@/lib/api";
import MemberClaimHistory from "./MemberClaimHistory";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));
beforeEach(() => {
  vi.mocked(api.get).mockReset();
});
const entry = {
  id: "lookup-99",
  claimNumber: "DISPLAY-42",
  name: "Member",
  claimDate: "2026-10-28 10:00:00",
  amountPayable: "0.00",
  status: "Awaiting Approval",
};
const show = () =>
  render(
    <MemoryRouter>
      <MemberClaimHistory />
    </MemoryRouter>,
  );

it("keeps provider ordering, repeated records, zero and null amounts, and numbers across pages", async () => {
  const history = Array.from({ length: 12 }, (_, index) => ({
    ...entry,
    claimNumber: `DISPLAY-${12 - index}`,
  }));
  history[0] = { ...entry };
  history[1] = { ...entry };
  vi.mocked(api.get).mockResolvedValue({
    data: { data: [history[0], { ...history[1], amountPayable: null }, ...history.slice(2)] },
  });
  show();
  const table = await screen.findByRole("table", { name: "Claims Portal claim history" });
  expect(within(table).getAllByRole("row")).toHaveLength(11);
  expect(within(table).getAllByText("DISPLAY-42")).toHaveLength(2);
  const rows = within(table).getAllByRole("row");
  expect(within(rows[1]).getByText(/0\.00/)).toBeVisible();
  expect(within(rows[2]).getByText("Not provided by Claims Portal")).toBeVisible();
  expect(within(rows[1]).getByText("Awaiting Approval")).toHaveClass("bg-info-soft");
  expect(screen.queryByText("lookup-99")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  const lastRows = within(table).getAllByRole("row");
  expect(lastRows).toHaveLength(3);
  expect(within(lastRows[1]).getAllByRole("cell")[0]).toHaveTextContent(/^11$/);
  expect(within(lastRows[1]).getByRole("rowheader")).toHaveTextContent("DISPLAY-2");
});

it("preserves rows and pagination after a failed refresh, then accepts a successful empty result", async () => {
  vi.mocked(api.get).mockResolvedValueOnce({
    data: { data: Array.from({ length: 12 }, () => entry) },
  });
  show();
  await screen.findByRole("table");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  vi.mocked(api.get).mockRejectedValueOnce(new Error("provider offline"));
  fireEvent.click(screen.getByRole("button", { name: "Refresh history" }));
  expect(await screen.findByText(/last loaded results, which may be outdated/)).toBeVisible();
  expect(screen.getByText(/Page 2 of 2/)).toBeVisible();
  expect(screen.getAllByText("DISPLAY-42")).toHaveLength(2);
  vi.mocked(api.get).mockResolvedValueOnce({ data: { data: [] } });
  fireEvent.click(screen.getByRole("button", { name: "Refresh history" }));
  expect(
    await screen.findByText("No claims returned by Claims Portal for your membership."),
  ).toBeVisible();
  expect(screen.queryByText(/outdated/)).not.toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

it("distinguishes initial service failure from a successful empty response", async () => {
  vi.mocked(api.get).mockRejectedValueOnce(new Error("provider offline"));
  show();
  expect(
    await screen.findByText("Claims Portal history is unavailable. Please try refreshing history."),
  ).toBeVisible();
  expect(screen.queryByText(/No claims returned/)).not.toBeInTheDocument();
  vi.mocked(api.get).mockResolvedValueOnce({ data: { data: [] } });
  fireEvent.click(screen.getByRole("button", { name: "Refresh history" }));
  expect(await screen.findByText(/No claims returned/)).toBeVisible();
  expect(api.get).toHaveBeenCalledTimes(2);
  expect(api.get).toHaveBeenLastCalledWith("/member-portal/claims/history", expect.anything());
});

it("shows loading, disables duplicate refreshes, and aborts the request on leaving", async () => {
  vi.mocked(api.get).mockImplementation(() => new Promise(() => {}));
  const view = show();
  expect(screen.getByText("Loading Claims Portal claim history…")).toBeVisible();
  expect(screen.getByRole("button", { name: "Refresh history" })).toBeDisabled();
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
  const signal = vi.mocked(api.get).mock.calls[0][1]?.signal;
  view.unmount();
  expect(signal?.aborted).toBe(true);
});

it("filters free-text insurer statuses and inclusive claim dates without matching portal IDs", async () => {
  vi.mocked(api.get).mockResolvedValue({
    data: {
      data: [
        ...Array.from({ length: 11 }, () => entry),
        {
          ...entry,
          claimNumber: "FUTURE-QUEUE",
          status: "Unfamiliar insurer queue",
          claimDate: "2026-10-29 23:59:59.123",
        },
        { ...entry, claimNumber: "NO-DATE", status: "Unfamiliar insurer queue", claimDate: null },
      ],
    },
  });
  show();
  await screen.findByRole("table");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.change(screen.getByLabelText("Insurer status"), {
    target: { value: "Unfamiliar insurer queue" },
  });
  expect(screen.getByText("2 of 13 records")).toBeVisible();
  expect(screen.queryByRole("navigation", { name: "Pagination" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Claim date from"), { target: { value: "2026-10-29" } });
  fireEvent.change(screen.getByLabelText("Claim date through"), {
    target: { value: "2026-10-29" },
  });
  expect(screen.getByText("FUTURE-QUEUE")).toBeVisible();
  expect(screen.queryByText("NO-DATE")).not.toBeInTheDocument();
  expect(screen.getByText("1 of 13 records")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(screen.getByText(/Page 1 of 2/)).toBeVisible();
  expect(screen.getByText("13 of 13 records")).toBeVisible();
  expect(api.get).toHaveBeenCalledTimes(1);
});
