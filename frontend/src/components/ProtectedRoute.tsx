import { Navigate, Outlet, useLocation } from "react-router-dom";
import { isAccountPending, useAuth } from "@/lib/AuthContext";
import AppLoading from "@/components/ui/AppLoading";

export default function ProtectedRoute() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <AppLoading />;

  if (!user) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  // UX only -- the backend gate (authenticateAllowPendingSetup's absence everywhere except
  // GET /auth/me, POST /auth/complete-setup, and POST /auth/resend-verification-email) is what
  // actually enforces this; a pending account would 403 on every protected route regardless of
  // this redirect. isAccountPending (not setupRequired alone) also catches S1 -- setup already
  // done, email still unconfirmed -- which the backend's own setupRequired gate lets through but
  // still has a staff-setup-worthy pendingEmail sitting unconfirmed.
  if (isAccountPending(user) && location.pathname !== "/staff-setup") {
    return <Navigate to="/staff-setup" replace />;
  }

  return <Outlet />;
}
