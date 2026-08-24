import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useMemberAuth } from "@/lib/MemberAuthContext";
import AppLoading from "@/components/ui/AppLoading";

export default function MemberProtectedRoute() {
  const { member, isLoading, profileComplete } = useMemberAuth();
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

  if (profileComplete === null) return <AppLoading label="Checking your membership details…" />;

  if (profileComplete === false) {
    return (
      <Navigate
        to={`/login?mode=member&step=policy&redirect=${encodeURIComponent(location.pathname)}`}
        replace
      />
    );
  }

  return <Outlet />;
}
