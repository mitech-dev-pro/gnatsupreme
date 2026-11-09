import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { it, expect, vi, beforeEach } from "vitest";
import StaffSetup from "./StaffSetup";

const completeSetup = vi.fn();
let mockUser: { setupRequired: boolean; email: string | null } | null = null;
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

it("asks for the temp password and a new password for a phone-only account", async () => {
  mockUser = { setupRequired: true, email: null };
  completeSetup.mockResolvedValueOnce({});
  renderPage();

  expect(screen.getByLabelText(/temporary password/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument();
  expect(screen.queryByLabelText(/^email$/i)).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText(/temporary password/i), {
    target: { value: "Str0ng!TempPassw0rd" },
  });
  fireEvent.change(screen.getByLabelText(/^new password$/i), {
    target: { value: "Str0ng!NewPassw0rd" },
  });
  fireEvent.change(screen.getByLabelText(/confirm new password/i), {
    target: { value: "Str0ng!NewPassw0rd" },
  });
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));

  await waitFor(() =>
    expect(completeSetup).toHaveBeenCalledWith({
      currentPassword: "Str0ng!TempPassw0rd",
      newPassword: "Str0ng!NewPassw0rd",
    }),
  );
});

it("rejects mismatched new passwords before calling the API", async () => {
  mockUser = { setupRequired: true, email: null };
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
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
  await waitFor(() => expect(screen.getByText(/do not match/i)).toBeInTheDocument());
  expect(completeSetup).not.toHaveBeenCalled();
});

it("surfaces the backend's same-password rejection as a form error", async () => {
  mockUser = { setupRequired: true, email: null };
  completeSetup.mockRejectedValueOnce({
    response: {
      data: { message: "Choose a new password -- it can't be the same as your current one" },
    },
  });
  renderPage();
  fireEvent.change(screen.getByLabelText(/temporary password/i), {
    target: { value: "Str0ng!TempPassw0rd" },
  });
  fireEvent.change(screen.getByLabelText(/^new password$/i), {
    target: { value: "Str0ng!TempPassw0rd" },
  });
  fireEvent.change(screen.getByLabelText(/confirm new password/i), {
    target: { value: "Str0ng!TempPassw0rd" },
  });
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
  expect(await screen.findByText(/can't be the same/i)).toBeInTheDocument();
});

it("redirects away once setup is already done", () => {
  mockUser = { setupRequired: false, email: null };
  const { container } = renderPage();
  expect(container.textContent).not.toMatch(/temporary password/i);
});
