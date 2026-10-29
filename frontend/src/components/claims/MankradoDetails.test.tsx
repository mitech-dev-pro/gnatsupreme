import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import MankradoDetails from "./MankradoDetails";
import api from "@/lib/api";
vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));
const saved = {
  claimNumber: "MC-42",
  name: "Member",
  claimDate: null,
  amountPayable: "0.00",
  status: "Assessing",
  rejectReason: null,
};
beforeEach(() => {
  vi.mocked(api.get).mockReset();
});

it("explains waiting for receipt without an external request", () => {
  render(<MankradoDetails externalId={null} />);
  expect(screen.getByText(/after Mankrado confirms receipt/)).toBeInTheDocument();
  expect(api.get).not.toHaveBeenCalled();
});
it("retains a persisted assessment and zero amount during outages and later visits", async () => {
  vi.mocked(api.get).mockRejectedValue(new Error("offline"));
  const props = { externalId: "42", savedAssessment: saved, lastSyncedAt: "2026-10-29T10:00:00Z" };
  const { unmount } = render(<MankradoDetails {...props} />);
  expect(screen.getByText("MC-42")).toBeInTheDocument();
  await screen.findByText("Could not refresh; showing the last saved assessment.");
  expect(screen.getByText(/Last checked:/)).toBeInTheDocument();
  expect(screen.queryByText("Not provided by Mankrado")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Refresh details" }));
  expect(screen.getByText("MC-42")).toBeInTheDocument();
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  unmount();
  render(<MankradoDetails {...props} />);
  expect(screen.getByText("MC-42")).toBeInTheDocument();
  await screen.findByText("Could not refresh; showing the last saved assessment.");
});
it("returns the fresh assessment and timestamp to its parent and shows null payable honestly", async () => {
  const result = {
    ...saved,
    amountPayable: null,
    status: "Awaiting Approval",
    lastSyncedAt: "2026-10-29T11:00:00Z",
  };
  vi.mocked(api.get).mockResolvedValue({ data: { data: result } });
  const updated = vi.fn();
  render(<MankradoDetails externalId="42" savedAssessment={saved} onUpdated={updated} />);
  await screen.findByText("Awaiting Approval");
  expect(screen.getByText("Not provided by Mankrado")).toBeInTheDocument();
  expect(updated).toHaveBeenCalledWith(result);
  expect(api.get).toHaveBeenCalledWith("/claims/claimdetails/42", expect.anything());
});
it("ignores an obsolete response after switching claims", async () => {
  let resolveOld!: (value: unknown) => void;
  vi.mocked(api.get).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  vi.mocked(api.get).mockResolvedValue({
    data: { data: { ...saved, claimNumber: "MC-NEW", lastSyncedAt: "2026-10-29T11:00:00Z" } },
  });
  const updated = vi.fn();
  const { rerender } = render(<MankradoDetails externalId="42" onUpdated={updated} />);
  rerender(<MankradoDetails externalId="43" onUpdated={updated} />);
  await screen.findByText("MC-NEW");
  await act(async () => resolveOld({ data: { data: saved } }));
  expect(screen.queryByText("MC-42")).not.toBeInTheDocument();
  expect(updated).toHaveBeenCalledTimes(1);
});
