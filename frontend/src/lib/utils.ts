export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/**
 * True only for the member-portal routes ("/member", "/member/..."). A plain
 * `pathname.startsWith("/member")` also matches staff routes like "/members/123",
 * which broke auth refresh on those pages — this enforces the "/member" segment boundary.
 */
export function isMemberPortalPath(pathname: string): boolean {
  return pathname === "/member" || pathname.startsWith("/member/");
}

/** Local-date "YYYY-MM-DD" for a Date, matching what <input type="date"> and the API expect. */
export function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Parses a "YYYY-MM-DD" string as a local date (avoids the UTC-midnight shift from `new Date(str)`). */
export function parseISODate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}
