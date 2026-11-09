import { useEffect, useState } from "react";
export type StaffUser = {
  id: number;
  fullName: string;
  // Nullable -- a GNAT account created with only a phone number has no confirmed email yet.
  // setupRequired is the server-enforced gate for a still-temp-password account. See the
  // backend's account-states table (middleware/authenticate.ts, modules/auth/auth.routes.ts).
  email: string | null;
  phone: string | null;
  setupRequired: boolean;
  // Independent of (and a backstop under) the per-identifier login rate limiter -- a hard
  // lockout once a phone-only account's failed attempts reach the threshold, shown here as
  // `locked` so a mass lockout is visible at a glance rather than inferred from support calls.
  setupFailedAttempts: number;
  locked: boolean;
  // Null for anything not phone-capable, or phone-capable but never yet logged in since its
  // setup was last armed (bulk-create or an admin reset).
  firstLoginSinceArmed: { at: string; ip: string | null } | null;
  role: string;
  isActive: boolean;
  // A region/district can legitimately appear in more than one admin's scope -- see backend
  // schema.prisma's note on User.regionIds/districtIds.
  regionIds: number[];
  districtIds: number[];
  regions: { id: number; name: string }[];
  districts: { id: number; name: string }[];
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
  "w-full rounded-lg border border-border-default bg-text-on-action px-3 py-2 text-[12.5px] transition focus:border-action-primary focus:shadow-focus-soft focus:outline-none";
export const labelClasses = "mb-1 block text-[11px] font-bold text-text-strong";
export const tabButton = (active: boolean) =>
  `rounded-lg px-4 py-2 text-[12.5px] font-bold transition ${
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
