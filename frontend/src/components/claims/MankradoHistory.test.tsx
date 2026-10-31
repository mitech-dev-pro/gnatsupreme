import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import MankradoHistory from "./MankradoHistory";
import api from "@/lib/api";
vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));
beforeEach(() => {
  vi.mocked(api.get).mockReset();
});
const row = {
  id: "42",
  claimNumber: "MC-42",
  name: "First Member",
  claimDate: null,
  amountPayable: "0.00",
  status: "Awaiting Approval",
};

it("preserves successful history during a failed refresh and distinguishes an outage from empty history", async () => {
  vi.mocked(api.get)
    .mockResolvedValueOnce({ data: { data: [row] } })
    .mockRejectedValueOnce(new Error("offline"));
  render(<MankradoHistory staffId="123456" />);
  await screen.findByText("MC-42");
  await userEvent.click(screen.getByRole("button", { name: "Refresh history" }));
  await screen.findByText(/Claims Portal history is unavailable/);
  expect(screen.getByText("MC-42")).toBeInTheDocument();
  expect(screen.queryByText(/No claims returned/)).not.toBeInTheDocument();
});

it("never shows a previous member's rows after switching members", async () => {
  vi.mocked(api.get).mockResolvedValueOnce({ data: { data: [row] } });
  const { rerender } = render(<MankradoHistory staffId="123456" />);
  await screen.findByText("MC-42");
  let resolve!: (value: unknown) => void;
  vi.mocked(api.get).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  rerender(<MankradoHistory staffId="654321" />);
  expect(screen.queryByText("MC-42")).not.toBeInTheDocument();
  await act(async () => resolve({ data: { data: [] } }));
  expect(screen.getByText(/No claims returned/)).toBeInTheDocument();
});
