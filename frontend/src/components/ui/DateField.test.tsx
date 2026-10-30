import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import DateField from "./DateField";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 29, 12));
});
afterEach(() => {
  vi.useRealTimers();
});
function Form() {
  const [value, setValue] = useState("2026-10-01");
  return (
    <>
      <DateField label="Claim date" value={value} onChange={setValue} max="2026-10-12" required />
      <output data-testid="saved-date">{value}</output>
    </>
  );
}
it("uses the custom calendar, preserves date-only payloads and required validation, and supports keyboard clearing", () => {
  render(<Form />);
  const input = screen.getByLabelText(/Claim date/);
  expect(input).toHaveAttribute("type", "text");
  expect(input).toBeRequired();
  fireEvent.change(input, { target: { value: "2026-10-11" } });
  expect(screen.getByTestId("saved-date")).toHaveTextContent("2026-10-11");
  fireEvent.focus(input);
  const calendar = screen.getByRole("dialog", { name: "Claim date calendar" });
  expect(within(calendar).getByRole("button", { name: "Today" })).toBeDisabled();
  expect(within(calendar).getByRole("button", { name: "13" })).toBeDisabled();
  fireEvent.keyDown(within(calendar).getByRole("button", { name: "11" }), { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(input).toHaveFocus();
  fireEvent.keyDown(screen.getByRole("button", { name: "Clear date" }), { key: " " });
  expect(screen.getByTestId("saved-date")).toBeEmptyDOMElement();
});

it("rejects a typed date outside the permitted range", () => {
  render(<Form />);
  const input = screen.getByLabelText(/Claim date/);
  fireEvent.change(input, { target: { value: "2026-10-13" } });
  fireEvent.blur(input);
  expect(screen.getByTestId("saved-date")).toHaveTextContent("2026-10-01");
  expect(input).toHaveAttribute("aria-invalid", "true");
});
