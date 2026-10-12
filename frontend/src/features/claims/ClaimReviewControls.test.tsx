import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ClaimReviewControls, type ClaimDecision } from "./ClaimReviewControls";

it("requires a reason for return or rejection and allows approval without one", async () => {
  const confirm = vi.fn();
  function Review() {
    const [decision, setDecision] = useState<ClaimDecision | null>(null);
    const [note, setNote] = useState("");
    return (
      <ClaimReviewControls
        decision={decision}
        note={note}
        busy={false}
        onDecision={setDecision}
        onNote={setNote}
        onCancel={() => setDecision(null)}
        onConfirm={confirm}
      />
    );
  }
  const user = userEvent.setup();
  render(<Review />);
  await user.click(screen.getByRole("button", { name: "Return for correction" }));
  expect(screen.getByRole("button", { name: "Confirm return" })).toBeDisabled();
  await user.type(screen.getByLabelText(/Review note/), "Please attach the report.");
  await user.click(screen.getByRole("button", { name: "Confirm return" }));
  expect(confirm).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Approve" }));
  await user.clear(screen.getByLabelText(/Review note/));
  expect(screen.getByRole("button", { name: "Confirm approve" })).toBeEnabled();
});
