import { useAuth } from "@/lib/AuthContext";
import { useState } from "react";
import { VIEW_ROLES } from "./System.model";
export function useSystem() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const canView = user ? VIEW_ROLES.includes(user.role) : false;
  const [tab, setTab] = useState<"users" | "audit">("users");
  return { isSuperAdmin, canView, tab, setTab };
}
