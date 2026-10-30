import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import ClaimReviewModal from "./ClaimReviewModal";
import { reviewClaim } from "@/features/claims/claims.api";
import type { ClaimSubmission } from "./ClaimsTable";
vi.mock("@/features/claims/claims.api", () => ({ reviewClaim: vi.fn() }));
beforeEach(() => {
  vi.mocked(reviewClaim).mockReset();
});
export const submission = {
  id: 42,
  member: { fullName: "Test Member", id: 1, controllerId: "123456" },
  claimType: "HOSPITALIZATION",
  claimantName: "Covered Member",
  status: "PENDING",
  source: "MEMBER_PORTAL",
  deliveryState: "NOT_SENT",
  reviewedAt: null,
  provider: "Claims System",
  externalClaimId: null,
  estimatedAmount: "8000",
  submittedAt: null,
} as ClaimSubmission;
it("opens a compact focused review, requires correction notes and restores focus on cancellation", () => {
  const trigger = document.createElement("button");
  document.body.append(trigger);
  trigger.focus();
  const close = vi.fn();
  const view = render(<ClaimReviewModal claim={submission} onClose={close} onReviewed={vi.fn()} />);
  expect(screen.getByRole("dialog", { name: "Review claim" })).toHaveFocus();
  expect(screen.getByText(/Test Member · CLM-000042/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Return for correction" }));
  expect(screen.getByRole("button", { name: "Confirm return" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Review note/), {
    target: { value: "Replace the report" },
  });
  expect(screen.getByRole("button", { name: "Confirm return" })).toBeEnabled();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(close).toHaveBeenCalledOnce();
  view.unmount();
  expect(trigger).toHaveFocus();
  trigger.remove();
});
it("keeps failed review notes in the modal and supports retry", async () => {
  vi.mocked(reviewClaim).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce();
  const close = vi.fn(),
    changed = vi.fn();
  render(<ClaimReviewModal claim={submission} onClose={close} onReviewed={changed} />);
  fireEvent.click(screen.getByRole("button", { name: "Reject" }));
  fireEvent.change(screen.getByLabelText(/Review note/), { target: { value: "Not eligible" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm reject" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText(/Review note/)).toHaveValue("Not eligible");
  expect(close).not.toHaveBeenCalled();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Confirm reject" }));
  });
  expect(reviewClaim).toHaveBeenLastCalledWith(42, "REJECT", "Not eligible");
  expect(close).toHaveBeenCalledOnce();
  expect(changed).toHaveBeenCalledOnce();
});
it("prevents duplicate approval, closing and decision changes while saving", async () => {
  let finish!: () => void;
  vi.mocked(reviewClaim).mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const close = vi.fn();
  render(<ClaimReviewModal claim={submission} onClose={close} onReviewed={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Approve and forward" }));
  const confirm = screen.getByRole("button", { name: "Confirm approve and forward" });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(reviewClaim).toHaveBeenCalledTimes(1);
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Return for correction" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Close review" })).toBeDisabled();
  await act(async () => {
    finish();
  });
  expect(close).toHaveBeenCalledOnce();
});
