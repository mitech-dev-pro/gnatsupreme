import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { it, expect, vi, beforeEach } from "vitest";
import StaffSetup from "./StaffSetup";

const completeSetup = vi.fn();
let mockUser: {
  setupRequired: boolean;
  email: string | null;
  pendingEmail?: string | null;
} | null = null;
vi.mock("@/lib/AuthContext", () => ({
  useAuth: () => ({ user: mockUser, isLoading: false, completeSetup }),
}));

beforeEach(() => {
  completeSetup.mockReset();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <StaffSetup />
    </MemoryRouter>,
  );
}

it("asks for a new password and an email for a fresh (S0) phone-only account", async () => {
  mockUser = { setupRequired: true, email: null, pendingEmail: null };
  completeSetup.mockResolvedValueOnce({});
  renderPage();

  expect(screen.getByLabelText(/temporary password/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText(/temporary password/i), {
    target: { value: "Str0ng!TempPassw0rd" },
  });
  fireEvent.change(screen.getByLabelText(/^new password$/i), {
    target: { value: "Str0ng!NewPassw0rd" },
  });
  fireEvent.change(screen.getByLabelText(/confirm new password/i), {
    target: { value: "Str0ng!NewPassw0rd" },
  });
  fireEvent.change(screen.getByLabelText(/^email$/i), {
    target: { value: "staff@example.test" },
  });
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));

  await waitFor(() =>
    expect(completeSetup).toHaveBeenCalledWith({
      currentPassword: "Str0ng!TempPassw0rd",
      newPassword: "Str0ng!NewPassw0rd",
      email: "staff@example.test",
    }),
  );
});

it("prefills the email from pendingEmail when re-running setup", () => {
  mockUser = { setupRequired: true, email: null, pendingEmail: "typo@example.test" };
  renderPage();
  expect(screen.getByLabelText(/^email$/i)).toHaveValue("typo@example.test");
});

it("only asks for the current password on an S2a account (email confirmed, setup not done)", () => {
  mockUser = { setupRequired: true, email: "confirmed@example.test", pendingEmail: null };
  renderPage();
  expect(screen.getByLabelText(/temporary password/i)).toBeInTheDocument();
  expect(screen.queryByLabelText(/^email$/i)).not.toBeInTheDocument();
});

it("rejects mismatched new passwords before calling the API", async () => {
  mockUser = { setupRequired: true, email: null, pendingEmail: null };
  renderPage();
  fireEvent.change(screen.getByLabelText(/temporary password/i), {
    target: { value: "Str0ng!TempPassw0rd" },
  });
  fireEvent.change(screen.getByLabelText(/^new password$/i), {
    target: { value: "Str0ng!NewPassw0rd" },
  });
  fireEvent.change(screen.getByLabelText(/confirm new password/i), {
    target: { value: "Different!Passw0rd" },
  });
  fireEvent.change(screen.getByLabelText(/^email$/i), {
    target: { value: "staff@example.test" },
  });
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
  await waitFor(() => expect(screen.getByText(/do not match/i)).toBeInTheDocument());
  expect(completeSetup).not.toHaveBeenCalled();
});
