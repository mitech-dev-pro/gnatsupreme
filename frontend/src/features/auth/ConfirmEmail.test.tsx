import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { it, expect, vi } from "vitest";
import ConfirmEmail from "./ConfirmEmail";

const confirmEmail = vi.fn();
vi.mock("@/lib/AuthContext", () => ({
  useAuth: () => ({ confirmEmail }),
}));

it("shows a success message when the token confirms", async () => {
  confirmEmail.mockResolvedValueOnce({ message: "Email confirmed. You can now sign in." });
  render(
    <MemoryRouter initialEntries={["/confirm-email?token=" + "a".repeat(64)]}>
      <ConfirmEmail />
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByText(/email confirmed/i)).toBeInTheDocument());
  expect(confirmEmail).toHaveBeenCalledWith("a".repeat(64));
});

it("shows an error message when the token is invalid or expired", async () => {
  confirmEmail.mockRejectedValueOnce({
    response: { data: { message: "This confirmation link is invalid or has expired." } },
  });
  render(
    <MemoryRouter initialEntries={["/confirm-email?token=" + "b".repeat(64)]}>
      <ConfirmEmail />
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByText(/invalid or has expired/i)).toBeInTheDocument());
});

it("shows an error immediately when the URL has no token at all", async () => {
  render(
    <MemoryRouter initialEntries={["/confirm-email"]}>
      <ConfirmEmail />
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByText(/missing or invalid/i)).toBeInTheDocument());
  expect(confirmEmail).not.toHaveBeenCalled();
});
