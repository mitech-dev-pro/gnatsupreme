import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { it, expect, vi, beforeEach } from "vitest";
import AddEmailBanner from "./AddEmailBanner";

const setEmail = vi.fn();
let mockUser: { email: string | null } | null = null;
vi.mock("@/lib/AuthContext", () => ({
  useAuth: () => ({ user: mockUser, setEmail }),
}));

beforeEach(() => {
  setEmail.mockReset();
});

it("does not render when the user already has an email", () => {
  mockUser = { email: "staff@example.test" };
  render(<AddEmailBanner />);
  expect(screen.queryByText(/add your email/i)).not.toBeInTheDocument();
});

it("renders the banner when the user has no email", () => {
  mockUser = { email: null };
  render(<AddEmailBanner />);
  expect(screen.getByText(/add your email so you can also sign in that way/i)).toBeInTheDocument();
});

it("blocks submission when email and confirm email don't match, without calling the API", async () => {
  mockUser = { email: null };
  render(<AddEmailBanner />);
  fireEvent.click(screen.getByRole("button", { name: /^add email$/i }));

  fireEvent.change(screen.getByLabelText(/current password/i), {
    target: { value: "Str0ng!Passw0rd" },
  });
  fireEvent.change(screen.getByLabelText(/^email/i), {
    target: { value: "staff@example.test" },
  });
  fireEvent.change(screen.getByLabelText(/confirm email/i), {
    target: { value: "typo@example.test" },
  });
  fireEvent.click(screen.getByRole("button", { name: /save email/i }));

  await waitFor(() => expect(screen.getByText(/do not match/i)).toBeInTheDocument());
  expect(setEmail).not.toHaveBeenCalled();
});

it("submits when the two email fields match", async () => {
  mockUser = { email: null };
  setEmail.mockResolvedValueOnce({});
  render(<AddEmailBanner />);
  fireEvent.click(screen.getByRole("button", { name: /^add email$/i }));

  fireEvent.change(screen.getByLabelText(/current password/i), {
    target: { value: "Str0ng!Passw0rd" },
  });
  fireEvent.change(screen.getByLabelText(/^email/i), {
    target: { value: "staff@example.test" },
  });
  fireEvent.change(screen.getByLabelText(/confirm email/i), {
    target: { value: "staff@example.test" },
  });
  fireEvent.click(screen.getByRole("button", { name: /save email/i }));

  await waitFor(() =>
    expect(setEmail).toHaveBeenCalledWith({
      currentPassword: "Str0ng!Passw0rd",
      email: "staff@example.test",
      confirmEmail: "staff@example.test",
    }),
  );
});
