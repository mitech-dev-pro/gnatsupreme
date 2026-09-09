import { useEffect, useState } from "react";
export type StaffUser = {
  id: number;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
  regionId: number | null;
  districtId: number | null;
  region: { id: number; name: string } | null;
  district: { id: number; name: string } | null;
  createdAt: string;
};
export type AuditLog = {
  id: number;
  action: string;
  entityType: string | null;
  entityId: string | null;
  description: string;
  createdAt: string;
  actor: { id: number; fullName: string; email: string; role: string } | null;
  actorEmail: string | null;
  beforeData: unknown;
  afterData: unknown;
};
export const ROLES = ["SUPER_ADMIN", "NATIONAL_ADMIN", "REGIONAL_ADMIN", "DISTRICT_ADMIN"];
export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  NATIONAL_ADMIN: "National Admin",
  REGIONAL_ADMIN: "Regional Admin",
  DISTRICT_ADMIN: "District Admin",
};
export const inputClasses =
  "w-full rounded-lg border border-border-default bg-text-on-action px-3 py-2 text-sm transition focus:border-action-primary focus:shadow-focus-soft focus:outline-none";
export const labelClasses = "mb-1 block text-xs font-bold text-text-strong";
export const tabButton = (active: boolean) =>
  `rounded-lg px-4 py-2 text-sm font-bold transition ${
    active
      ? "bg-text-strong text-white"
      : "border border-border-default text-text-strong hover:bg-surface-hover"
  }`;
export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
export function useDebouncedValue<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}
export const VIEW_ROLES = ["SUPER_ADMIN", "NATIONAL_ADMIN"];
