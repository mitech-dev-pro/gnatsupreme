import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";

export default function RoleProtectedRoute({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user || !roles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace state={{ from: location.pathname }} />;
  }
  return children;
}
