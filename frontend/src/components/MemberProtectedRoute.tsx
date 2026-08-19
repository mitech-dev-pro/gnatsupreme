import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useMemberAuth } from "@/lib/MemberAuthContext";

export default function MemberProtectedRoute() {
  const { member, isLoading } = useMemberAuth();
  const location = useLocation();

  if (isLoading) return null;

  if (!member) {
    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(location.pathname)}`}
        replace
      />
    );
  }

  return <Outlet />;
}
