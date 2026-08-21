import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useMemberAuth } from "@/lib/MemberAuthContext";
import AppLoading from "@/components/ui/AppLoading";

export default function MemberProtectedRoute() {
  const { member, isLoading } = useMemberAuth();
  const location = useLocation();

  if (isLoading) return <AppLoading label="Restoring your member session…" />;

  if (!member) {
    return (
      <Navigate
        to={`/login?mode=member&redirect=${encodeURIComponent(location.pathname)}`}
        replace
      />
    );
  }

  return <Outlet />;
}
