import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import ClaimDeliveryControls from "./ClaimDeliveryControls";
import api from "@/lib/api";
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
const claim = {
  id: 1,
  provider: "Claims System",
  source: "STAFF",
  status: "PENDING",
  deliveryState: "UNKNOWN",
};
beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
});
it.each([
  { history: [] },
  { history: [{ claimNumber: "MC-2", status: "Assessing", amountPayable: "0.00" }] },
])(
  "requires a successful history lookup and acknowledgment before retrying",
  async ({ history }) => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: history } });
    vi.mocked(api.post).mockResolvedValue({});
    const onSent = vi.fn();
    render(<ClaimDeliveryControls claim={claim} staffId="123456" onSent={onSent} />);
    expect(api.get).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox")).toBeDisabled();
    const retry = screen.getByRole("button", { name: "Retry submission" });
    expect(retry).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Check Mankrado history" }));
    await waitFor(() => expect(screen.getByRole("checkbox")).toBeEnabled());
    expect(retry).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(retry);
    await waitFor(() => expect(onSent).toHaveBeenCalledOnce());
    expect(api.post).toHaveBeenCalledWith("/claims/submissions/1/send", { historyChecked: true });
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("checkbox")).toBeDisabled();
  },
);
it("blocks acknowledgment when history fails", async () => {
  vi.mocked(api.get).mockRejectedValue(new Error("offline"));
  render(<ClaimDeliveryControls claim={claim} staffId="123456" onSent={vi.fn()} />);
  await userEvent.click(screen.getByRole("button", { name: "Check Mankrado history" }));
  await screen.findByText(/Mankrado history is unavailable/);
  expect(screen.getByRole("checkbox")).toBeDisabled();
  expect(api.post).not.toHaveBeenCalled();
});
