import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import ActionMenu from "./ActionMenu";
import Dialog from "./Dialog";

it("supports arrow navigation and Escape, restoring focus to the three-dot trigger", async () => {
  const selected = vi.fn();
  render(
    <MemoryRouter>
      <ActionMenu
        label="Record actions"
        items={[
          { label: "View details", to: "/record/42" },
          { label: "Review", onSelect: selected },
        ]}
      />
    </MemoryRouter>,
  );
  const trigger = screen.getByRole("button", { name: "Record actions" });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "ArrowUp" });
  await waitFor(() => expect(screen.getByRole("menuitem", { name: "Review" })).toHaveFocus());
  fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
  expect(screen.getByRole("menuitem", { name: "View details" })).toHaveFocus();
  expect(screen.getByRole("menuitem", { name: "View details" })).toHaveAttribute(
    "href",
    "/record/42",
  );
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  expect(selected).not.toHaveBeenCalled();
});

it("opens a dialog from the menu and restores the originating trigger when it closes", async () => {
  function Example() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <ActionMenu
          label="Record actions"
          items={[{ label: "Review", onSelect: () => setOpen(true) }]}
        />
        {open && (
          <Dialog title="Review record" onClose={() => setOpen(false)}>
            <button>Confirm</button>
          </Dialog>
        )}
      </>
    );
  }
  render(
    <MemoryRouter>
      <Example />
    </MemoryRouter>,
  );
  const trigger = screen.getByRole("button", { name: "Record actions" });
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole("menuitem", { name: "Review" }));
  expect(screen.getByRole("dialog", { name: "Review record" })).toHaveFocus();
  fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
  expect(screen.getByRole("button", { name: "Confirm" })).toHaveFocus();
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
});
