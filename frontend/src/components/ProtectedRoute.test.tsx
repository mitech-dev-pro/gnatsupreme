import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { it, expect, vi } from "vitest";
import ProtectedRoute from "./ProtectedRoute";

let mockUser: { setupRequired?: boolean } | null = null;
vi.mock("@/lib/AuthContext", () => ({
  useAuth: () => ({ user: mockUser, isLoading: false }),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route path="/staff-setup" element={<div>Setup page</div>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<div>Dashboard</div>} />
          <Route path="/members" element={<div>Members</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

it("redirects to /login when there is no user", () => {
  mockUser = null;
  renderAt("/members");
  expect(screen.getByText("Login page")).toBeInTheDocument();
});

it("redirects a pending (setupRequired) account to /staff-setup from any other protected route", () => {
  mockUser = { setupRequired: true };
  renderAt("/members");
  expect(screen.getByText("Setup page")).toBeInTheDocument();
});

it("lets a pending account actually reach /staff-setup itself, not a redirect loop", () => {
  mockUser = { setupRequired: true };
  renderAt("/staff-setup");
  expect(screen.getByText("Setup page")).toBeInTheDocument();
});

it("lets a fully set-up account through to the requested route", () => {
  mockUser = { setupRequired: false };
  renderAt("/members");
  expect(screen.getByText("Members")).toBeInTheDocument();
});
