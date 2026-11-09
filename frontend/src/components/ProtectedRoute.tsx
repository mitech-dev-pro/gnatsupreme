import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import AppLoading from "@/components/ui/AppLoading";

export default function ProtectedRoute() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <AppLoading />;

  if (!user) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  // UX only -- the backend gate (authenticateAllowPendingSetup's absence everywhere except
  // GET /auth/me and POST /auth/complete-setup) is what actually enforces this; a pending
  // account would 403 on every protected route regardless of this redirect.
  if (user.setupRequired && location.pathname !== "/staff-setup") {
    return <Navigate to="/staff-setup" replace />;
  }

  return <Outlet />;
}
